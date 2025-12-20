import fs from 'fs/promises';
import path from 'path';
import { GeminiService } from './services/geminiService';
import { parseInputFile, identifyTranslatableLines, getGenderFromHeader, updateHeaderSex } from './utils/parser';
import { LANGUAGES } from './constants';
import { TargetLanguage, ProcessingItem } from './types';

// Access API Key from environment
const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.error("\x1b[31m%s\x1b[0m", "Error: API_KEY environment variable is missing.");
  console.error("Please set it: export API_KEY='your_key' (Linux/Mac) or $env:API_KEY='your_key' (Windows)");
  (process as any).exit(1);
}

// Parse Command Line Arguments
const args = (process as any).argv.slice(2);
const dualSexMode = args.includes('--dual');
const rewriteMode = args.includes('--rewrite');
const langArg = args.find(a => a.startsWith('--lang='));

const mode = rewriteMode ? 'rewrite' : 'translate';

let targetLangValues: string[] = [TargetLanguage.Hindi];

if (langArg) {
  const codes = langArg.split('=')[1].split(',').map(s => s.trim());
  targetLangValues = codes.map(code => {
    // Try to match partial names (e.g. "Spanish" -> TargetLanguage.Spanish)
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
    
    // Naming convention: lowercase, underscore, no brackets
    return `${nameWithoutExt}_translated_${langLabel}_${modeStr}.txt`;
};

async function main() {
  console.log("\x1b[36m%s\x1b[0m", "--- AstroLocalize CLI ---");
  console.log(`Mode: ${mode.toUpperCase()}`);
  console.log(`Dual Sex: ${dualSexMode}`);
  console.log(`Languages: ${targetLangValues.join(', ')}`);
  
  const currentDir = (process as any).cwd();
  const files = await fs.readdir(currentDir);
  
  // Filter for text files and exclude existing translations to avoid loops
  const inputFiles = files.filter(f => 
    (f.endsWith('.txt') || f.endsWith('.res') || f.endsWith('.dat')) && 
    !f.includes('_translated_') &&
    f !== 'cli.ts'
  );

  if (inputFiles.length === 0) {
    console.log("No valid input files (.txt, .res, .dat) found in current directory.");
    return;
  }

  console.log(`Found ${inputFiles.length} files to process.\n`);
  
  const gemini = new GeminiService(API_KEY!);

  for (const fileName of inputFiles) {
    console.log(`\x1b[33mProcessing: ${fileName}...\x1b[0m`);
    
    try {
        const content = await fs.readFile(path.join(currentDir, fileName), 'utf-8');
        
        for (const lang of targetLangValues) {
            const outputFileName = generateFileName(fileName, lang);
            const outputHeader = `--- Processing ${lang} ---`;
            console.log(outputHeader);

            const { preamble, blocks } = parseInputFile(content);
            
            // --- Logic mirrors App.tsx ---
            interface TargetBlock {
                header: string;
                lines: string[]; 
                gender: 'Male' | 'Female' | 'Neutral';
            }

            const baseTargetBlocks: TargetBlock[] = [];

            blocks.forEach(block => {
                if (dualSexMode) {
                  baseTargetBlocks.push({
                    header: updateHeaderSex(block.header, 0),
                    lines: [...block.contentLines],
                    gender: 'Male'
                  });
                  baseTargetBlocks.push({
                    header: updateHeaderSex(block.header, 1),
                    lines: [...block.contentLines],
                    gender: 'Female'
                  });
                } else {
                  const gender = getGenderFromHeader(block.header);
                  baseTargetBlocks.push({
                    header: block.header,
                    lines: [...block.contentLines],
                    gender
                  });
                }
            });

            const processingItems: ProcessingItem[] = [];
            baseTargetBlocks.forEach((block, blockIdx) => {
                const translatableMap = identifyTranslatableLines(block.lines);
                block.lines.forEach((line, lineIdx) => {
                  if (translatableMap[lineIdx]) {
                    processingItems.push({
                      text: line,
                      context: block.gender,
                      blockId: `b${blockIdx}`,
                      lineIndex: lineIdx
                    });
                  }
                });
            });

            const totalItems = processingItems.length;
            const BATCH_SIZE = 15;
            let sentCount = 0;

            if (totalItems > 0) {
                for (let i = 0; i < totalItems; i += BATCH_SIZE) {
                  const batch = processingItems.slice(i, i + BATCH_SIZE);
                  const apiRequests = batch.map(item => ({
                    text: item.text,
                    context: item.context
                  }));

                  // Log progress
                  const percent = Math.round((sentCount / totalItems) * 100);
                  (process as any).stdout.write(`\r   > Progress: ${sentCount}/${totalItems} blocks (${percent}%)`);

                  const results = await gemini.translateBatch(apiRequests, lang, mode);
                  
                  batch.forEach((item, idx) => {
                    const blockIdx = parseInt(item.blockId.substring(1));
                    if (results[idx] !== undefined) {
                       baseTargetBlocks[blockIdx].lines[item.lineIndex] = results[idx];
                    }
                  });
                  
                  sentCount += batch.length;
                }
            }
            (process as any).stdout.write(`\r   > Progress: ${totalItems}/${totalItems} blocks (100%)\n`);

            // Reconstruct and Save
            let finalOutput = preamble.trimEnd();
            if (baseTargetBlocks.length > 0) {
                if (finalOutput.length > 0) finalOutput += '\n\n';
                baseTargetBlocks.forEach((block, idx) => {
                  const blockContent = block.lines.join('\n').trimEnd();
                  finalOutput += `${block.header}\n${blockContent}`;
                  if (idx < baseTargetBlocks.length - 1) finalOutput += '\n\n';
                });
            }

            // Add BOM for UTF-8 compatibility with some windows editors
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