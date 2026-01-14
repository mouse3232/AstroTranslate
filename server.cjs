const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const { GeminiService } = require('./services/geminiService.js');
const { parseInputFile, identifyTranslatableLines, getGenderFromHeader, updateHeaderSex } = require('./utils/parser.js');
const { LANGUAGES } = require('./constants.js');

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.error("\x1b[31m%s\x1b[0m", "Error: API_KEY environment variable is missing.");
  process.exit(1);
}

const gemini = new GeminiService();

const server = http.createServer(async (req, res) => {
    // Basic routing
    if (req.url === '/process' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', async () => {
            try {
                const { fileName, lang, dualSexMode, mode } = JSON.parse(body);
                const result = await processFile(fileName, lang, dualSexMode, mode);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

async function processFile(fileName, lang, dualSexMode, mode) {
    const currentDir = process.cwd();
    const content = await fs.readFile(path.join(currentDir, fileName), 'utf-8');

    const { preamble, blocks } = parseInputFile(content);

    const baseTargetBlocks = [];
    blocks.forEach(block => {
        if (dualSexMode) {
            baseTargetBlocks.push({ header: updateHeaderSex(block.header, 0), lines: [...block.contentLines], gender: 'Male' });
            baseTargetBlocks.push({ header: updateHeaderSex(block.header, 1), lines: [...block.contentLines], gender: 'Female' });
        } else {
            baseTargetBlocks.push({ header: block.header, lines: [...block.contentLines], gender: getGenderFromHeader(block.header) });
        }
    });

    const processingItems = [];
    baseTargetBlocks.forEach((block, blockIdx) => {
        const translatableMap = identifyTranslatableLines(block.lines);
        block.lines.forEach((line, lineIdx) => {
            if (translatableMap[lineIdx]) {
                processingItems.push({ text: line, context: block.gender, blockId: `b${blockIdx}`, lineIndex: lineIdx });
            }
        });
    });

    const totalItems = processingItems.length;
    const BATCH_SIZE = 3;
    if (totalItems > 0) {
        for (let i = 0; i < totalItems; i += BATCH_SIZE) {
            const batch = processingItems.slice(i, i + BATCH_SIZE);
            const apiRequests = batch.map(item => ({ text: item.text, context: item.context }));
            const results = await gemini.translateBatch(apiRequests, lang, mode);
            batch.forEach((item, idx) => {
                const blockIdx = parseInt(item.blockId.substring(1));
                if (results[idx]) {
                    baseTargetBlocks[blockIdx].lines[item.lineIndex] = results[idx].text;
                }
            });
            await new Promise(r => setTimeout(r, 5000));
        }
    }

    let finalOutput = preamble.trimEnd();
    if (baseTargetBlocks.length > 0) {
        if (finalOutput.length > 0) finalOutput += '\n\n';
        baseTargetBlocks.forEach((block, idx) => {
            finalOutput += `${block.header}\n${block.lines.join('\n').trimEnd()}`;
            if (idx < baseTargetBlocks.length - 1) finalOutput += '\n\n';
        });
    }

    const outputFileName = `processed_${fileName}`;
    const fileContentWithBOM = '\uFEFF' + finalOutput;
    await fs.writeFile(path.join(currentDir, outputFileName), fileContentWithBOM, 'utf-8');

    return { success: true, message: `File ${fileName} processed.`, outputFileName };
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
