
import fs from 'fs/promises';
import path from 'path';
import { GeminiService } from './services/geminiService';
import { parseInputFile, identifyTranslatableLines, getGenderFromHeader, updateHeaderSex } from './utils/parser';
import { LANGUAGES } from './constants';
import { TargetLanguage, ProcessingItem, BatchResponse } from './types';

// Access API Key from environment
const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.error("\x1b[31m%s\x1b[0m", "Error: API_KEY environment variable is missing.");
  (process as any).exit(1);
}

// Parse Command Line Arguments
const args = (process as any).argv.slice(2);
const dualSexMode = args.includes('--dual');
const rewriteMode = args.includes('--rewrite');
const convertMode = args.includes('--convert');
const langArg = args.find(a => a.startsWith('--lang='));

let mode: 'translate' | 'rewrite' | 'convert_encoding' = 'translate';
if (rewriteMode) mode = 'rewrite';
if (convertMode) mode = 'convert_encoding';

let targetLangValues: string[] = [TargetLanguage.Hindi];

if (langArg) {
  const codes = langArg.split('=')[1].split(',').map(s => s.trim());
  targetLangValues = codes.map(code => {
    const found = LANGUAGES.find(l => 
        l.value.toLowerCase() === code.toLowerCase() || 
        l.label.toLowerCase().includes(code.toLowerCase())
    );
    return found ? found.value : code;
  });
}

const generateFileName = (originalName: string, lang: string) => {
    const nameWithoutExt = originalName.replace(/\.[^/.]+$/, "");
    const modeStr = dualSexMode ? 'dual_sex' : 'standard';
    const langLabel = LANGUAGES.find(l => l.value === lang)?.label.split(' ')[0].toLowerCase() || lang.toLowerCase();
    
    let suffix = 'translated';
    if (mode === 'rewrite') suffix = 'rewritten';
    if (mode === 'convert_encoding') suffix = 'converted_unicode';

    return `${nameWithoutExt}_${suffix}_${langLabel}_${modeStr}.txt`;
};

async function main() {
  console.log("\x1b[36m%s\x1b[0m", "--- AstroTranslate CLI ---");
  console.log(`Mode: ${mode.toUpperCase()}`);
  console.log(`Dual Sex: ${dualSexMode}`);
  
  const currentDir = (process as any).cwd();
  const files = await fs.readdir(currentDir);
  
  const inputFiles = files.filter(f => 
    (f.endsWith('.txt') || f.endsWith('.res') || f.endsWith('.dat')) && 
    !f.includes('_translated_') &&
    !f.includes('_rewritten_') &&
    !f.includes('_converted_') &&
    f !== 'cli.ts'
  );

  if (inputFiles.length === 0) {
    console.log("No valid input files found.");
    return;
  }
  
  // Initialize GeminiService without parameters to use process.env.API_KEY internally
  const gemini = new GeminiService();

  for (const fileName of inputFiles) {
    console.log(`\x1b[33mProcessing: ${fileName}...\x1b[0m`);
    
    try {
        const content = await fs.readFile(path.join(currentDir, fileName), 'utf-8');
        
        for (const lang of targetLangValues) {
            const outputFileName = generateFileName(fileName, lang);
            console.log(`--- Processing ${lang} ---`);

            const { preamble, blocks } = parseInputFile(content);
            
            interface TargetBlock {
                header: string; lines: string[]; gender: 'Male' | 'Female' | 'Neutral';
            }

            const baseTargetBlocks: TargetBlock[] = [];

            blocks.forEach(block => {
                if (dualSexMode) {
                  baseTargetBlocks.push({ header: updateHeaderSex(block.header, 0), lines: [...block.contentLines], gender: 'Male' });
                  baseTargetBlocks.push({ header: updateHeaderSex(block.header, 1), lines: [...block.contentLines], gender: 'Female' });
                } else {
                  baseTargetBlocks.push({ header: block.header, lines: [...block.contentLines], gender: getGenderFromHeader(block.header) });
                }
            });

            const processingItems: ProcessingItem[] = [];
            baseTargetBlocks.forEach((block, blockIdx) => {
                const translatableMap = identifyTranslatableLines(block.lines);
                block.lines.forEach((line, lineIdx) => {
                  if (translatableMap[lineIdx]) {
                    processingItems.push({ text: line, context: block.gender, blockId: `b${blockIdx}`, lineIndex: lineIdx });
                  }
                });
            });

            const totalItems = processingItems.length;
            const BATCH_SIZE = 3; // Reduced batch size
            let sentCount = 0;

            if (totalItems > 0) {
                for (let i = 0; i < totalItems; i += BATCH_SIZE) {
                  const batch = processingItems.slice(i, i + BATCH_SIZE);
                  const apiRequests = batch.map(item => ({ text: item.text, context: item.context }));

                  const percent = Math.round((sentCount / totalItems) * 100);
                  (process as any).stdout.write(`\r   > Progress: ${sentCount}/${totalItems} blocks (${percent}%)`);

                  const results: BatchResponse[] = await gemini.translateBatch(apiRequests, lang, mode);
                  
                  batch.forEach((item, idx) => {
                    const blockIdx = parseInt(item.blockId.substring(1));
                    if (results[idx]) {
                       // For CLI, we automatically apply the text, but log if it was corrected in convert mode
                       if (mode === 'convert_encoding' && results[idx].metadata?.wasCorrected) {
                           // Optional: Log correction
                       }
                       baseTargetBlocks[blockIdx].lines[item.lineIndex] = results[idx].text;
                    }
                  });
                  
                  sentCount += batch.length;
                  // Add delay for CLI as well
                  await new Promise(r => setTimeout(r, 5000));
                }
            }
            (process as any).stdout.write(`\r   > Progress: ${totalItems}/${totalItems} blocks (100%)\n`);

            let finalOutput = preamble.trimEnd();
            if (baseTargetBlocks.length > 0) {
                if (finalOutput.length > 0) finalOutput += '\n\n';
                baseTargetBlocks.forEach((block, idx) => {
                  finalOutput += `${block.header}\n${block.lines.join('\n').trimEnd()}`;
                  if (idx < baseTargetBlocks.length - 1) finalOutput += '\n\n';
                });
            }

            const fileContentWithBOM = '\uFEFF' + finalOutput;
            await fs.writeFile(path.join(currentDir, outputFileName), fileContentWithBOM, 'utf-8');
            console.log(`   \x1b[32mSaved: ${outputFileName}\x1b[0m`);
        }
    } catch (err: any) {
        console.error(`   \x1b[31mError processing ${fileName}: ${err.message}\x1b[0m`);
    }
  }
  console.log("\n\x1b[32mAll tasks completed.\x1b[0m");
}

main().catch(err => console.error(err));
