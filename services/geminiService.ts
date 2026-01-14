
import { GoogleGenAI, Type } from "@google/genai";
import { ProcessingMode, BatchResponse, SourceLanguage, TargetLanguage } from '../types';

interface BatchItem {
  text: string;
  context: string;
}

export interface DBBatchItem {
  rowid: number;
  data: Record<string, any>;
}

/**
 * INTELLIGENT FORMATTING PRESERVATION
 * Enforces that the translated text matches the source's formatting structure.
 * 1. Matches leading whitespace (tabs/spaces).
 * 2. Matches trailing punctuation (specifically colons).
 * 3. Preserves line breaks and paragraph structure.
 */
function preserveFormatting(original: string, translated: string): string {
  if (!original || !translated) return translated;

  const originalLines = original.split(/\r?\n/);
  const translatedLines = translated.split(/\r?\n/);

  // Strategy 1: If line counts match, apply formatting line-by-line (Most accurate)
  if (originalLines.length === translatedLines.length) {
    return originalLines.map((oLine, i) => {
      const tLine = translatedLines[i];
      // Capture exact leading whitespace from source
      const oLeading = oLine.match(/^[\s\t]*/)?.[0] || '';
      
      // Remove any leading whitespace Gemini might have hallucinated or changed
      const tTrimmed = tLine.trimStart();
      
      let resLine = oLeading + tTrimmed;

      // Enforce trailing colon if source has it
      if (oLine.trimEnd().endsWith(':') && !resLine.trimEnd().endsWith(':')) {
          resLine = resLine.trimEnd() + ':';
      }

      // (Optional) Numbering Check - simple heuristic for "1. ", "A. "
      // If source starts with "1. " and target doesn't, prepend it.
      // This is risky if Gemini translated "1." to "१.", so we skip strict enforcement 
      // to avoid duplication, relying on the prompt for numbering.
      
      return resLine;
    }).join('\n');
  }

  // Strategy 2: Mismatched lines (e.g. text wrapping changed). 
  // Apply formatting based on the whole block context.
  
  // A. Leading Whitespace of the block
  const globalLeading = original.match(/^[\s\t]*/)?.[0] || '';
  let result = globalLeading + translated.trimStart();

  // B. Trailing Colon
  if (original.trimEnd().endsWith(':') && !result.trimEnd().endsWith(':')) {
      result = result.trimEnd() + ':';
  }

  return result;
}

/**
 * Helper to retry async functions with exponential backoff.
 */
async function retry<T>(
  fn: () => Promise<T>, 
  retries = 10, 
  baseDelay = 10000, 
  factor = 2
): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const msg = (error.message || '').toLowerCase();
      const isRetryable = 
        msg.includes('429') || 
        msg.includes('503') || 
        error.status === 429 ||
        error.status === 503;

      if (attempt < retries && isRetryable) {
        let delay = baseDelay * Math.pow(factor, attempt) + (Math.random() * 1000);
        if (msg.includes('429') || error.status === 429) {
            delay = 60000; 
            console.warn(`[Gemini] Rate limited (429). Cooling down for 60s... (Attempt ${attempt + 1}/${retries})`);
        } else {
            console.warn(`[Gemini] Server error. Retrying in ${Math.round(delay)}ms... (Attempt ${attempt + 1}/${retries})`);
        }
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

export class GeminiService {
  private ai: GoogleGenAI;
  private hasKey: boolean;

  constructor(customApiKey?: string) {
    let key = customApiKey;
    if (!key) {
      try {
        // @ts-ignore
        if (typeof import.meta !== 'undefined' && import.meta.env) {
          // @ts-ignore
          key = import.meta.env.VITE_API_KEY; 
        }
      } catch (e) {}
    }
    if (!key) {
      try {
        if (typeof process.env !== 'undefined' && process.env) {
          key = process.env.API_KEY;
        }
      } catch (e) {}
    }
    if (!key) {
      try {
        // Fallback to injected server env (propagated from server.js)
        // @ts-ignore
        if (typeof window !== 'undefined' && window.__SERVER_ENV__ && window.__SERVER_ENV__.API_KEY) {
           // @ts-ignore
           key = window.__SERVER_ENV__.API_KEY;
        }
      } catch (e) {}
    }

    this.hasKey = !!key;
    this.ai = new GoogleGenAI({ apiKey: key || 'dummy_key' });
  }

  private validateKey() {
    if (!this.hasKey) {
      throw new Error("Missing Gemini API Key. Please check your settings.");
    }
  }

  /**
   * APP 1: Astrology Prediction Text (Block Based)
   */
  async translateBatch(
    items: BatchItem[],
    targetLanguage: string,
    mode: ProcessingMode,
    transliterateShlokas: boolean = false,
    keepSanskrit: boolean = false
  ): Promise<BatchResponse[]> {
    this.validateKey();
    if (items.length === 0) return [];

    // Pre-process (Pass Full content, logic handled in post-processing)
    const preProcessed = items.map(item => ({
      text: item.text,
      sex: item.context === 'Female' ? 1 : 0
    }));

    const modelName = 'gemini-3-flash-preview';

    const batchResponseSchema = {
      type: Type.OBJECT,
      properties: {
        results: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              processedText: { type: Type.STRING, description: "Processed text content." },
            },
            required: ["processedText"]
          }
        }
      },
      required: ["results"]
    };

    let instruction = mode === 'rewrite' 
      ? `REWRITE the text in the SAME LANGUAGE. Fix grammar, clarity, and decode KrutiDev/Devlys to Unicode. Do not translate.`
      : `TRANSLATE the text into ${targetLanguage}.`;

    const prompt = `
      ROLE: You are an expert translator and linguistic editor for astrology software.
      TASK: ${instruction}
      
      INPUT DATA: A JSON array of objects. Each object contains:
      - "text": The content to process.
      - "sex": The gender context (0 = Male, 1 = Female).
      
      STRICT FORMATTING & PRESERVATION RULES (CRITICAL):
      1. WHITESPACE: You MUST preserve all leading/trailing tabs (\t) and spaces exactly as they appear in the source.
      2. NUMBERING: Preserve all numbering (e.g., "1.", "1)", "a.") exactly. Do not change the format of the list.
      3. PUNCTUATION: Preserve trailing colons (:) exactly.
      4. VARIABLES: Keep <Var>, {0}, %s EXACTLY.
      5. PARAGRAPHS: Do not merge lines. Do not split lines.
      
      GENDER RULES:
      - sex=0: Masculine tone (Businessman, He).
      - sex=1: Feminine tone (Businesswoman, She).
      
      MANTRA HANDLING:
      ${keepSanskrit ? "- Keep Mantras/Shlokas in ORIGINAL Sanskrit (Devanagari). Do not translate." : transliterateShlokas ? "- Transliterate Mantras into phonetic English." : "- Translate Mantras normally."}

      OUTPUT RULES:
      - Return STRICT JSON.
      - "processedText" must contain the final string.
    `;

    return retry(async () => {
      const response = await this.ai.models.generateContent({
        model: modelName,
        contents: [{ role: 'user', parts: [{ text: prompt }, { text: JSON.stringify(preProcessed) }] }],
        config: { responseMimeType: "application/json", responseSchema: batchResponseSchema }
      });

      const parsed = JSON.parse(response.text || "{}");
      const results = parsed.results || [];

      return items.map((item, idx) => {
        const translatedRaw = results[idx]?.processedText ?? item.text;
        // SCRIPT TO CHECK & ENFORCE FORMATTING
        const finalCorrected = preserveFormatting(item.text, translatedRaw);
        return { text: finalCorrected };
      });
    });
  }

  /**
   * APP 2: App Resource Localizer (Code Based)
   */
  async translateResourceFile(
    fileContent: string, 
    sourceLang: string,
    targetLang: string
  ): Promise<string> {
    this.validateKey();
    const modelName = 'gemini-3-pro-preview';

    const systemInstruction = `
      You are a Senior Localization Engineer. 
      Translate a JavaScript/JSON resource file from ${sourceLang} to ${targetLang}.
      
      ABSOLUTE QUALITY RULES:
      1. Translate ALL string literals inside quotes and items inside arrays.
      2. Do NOT translate keys (identifiers before colon).
      3. Do NOT translate variable names or code keywords.
      4. Presere all syntax, indentation, and structure EXACTLY.
      5. Astrology context: ensure terms like 'Rahu' are correct for the target language.
      6. Return ONLY raw code, no markdown.

      STRICT PROCESSING GATES:
      - The output (string values) must contain zero original-language text.
      - Output length of values must be ≥ 99% of input (No summaries).
      - No skipped lines. No copied phrases. No explanations.
    `;

    return retry(async () => {
      const response = await this.ai.models.generateContent({
        model: modelName,
        contents: `Translate this resource code:\n\n${fileContent}`,
        config: {
          systemInstruction: systemInstruction,
          thinkingConfig: { thinkingBudget: 8192 }
        }
      });

      let cleanText = (response.text || "").trim();
      cleanText = cleanText.replace(/^```[a-z]*\n/, '').replace(/\n```$/, '');
      return cleanText;
    });
  }

  /**
   * APP 2.5: DotNet/Text Resource Localizer
   */
  async translateDotNetResource(
    content: string,
    targetLang: string,
    onProgress: (current: number, total: number, logMsg: string) => void,
    checkStop?: () => boolean
  ): Promise<string> {
    this.validateKey();
    const lines = content.split(/\r?\n/);
    const totalLines = lines.length;
    
    // Create Batches
    const BATCH_SIZE = 5; 
    const batches: { lines: string[], index: number }[] = [];
    
    for (let i = 0; i < totalLines; i += BATCH_SIZE) {
        batches.push({
            lines: lines.slice(i, i + BATCH_SIZE),
            index: i
        });
    }

    const systemInstruction = `
      You are a specialized translator for .NET/Text resource files. 
      Input format is "Key=Value" pairs. Target: ${targetLang}.
      
      STRICT RULES:
      1. OUTPUT FORMAT: Return EXACTLY the same number of lines. Preserve empty lines.
      2. COMMENT LINES: Keep lines starting with ';' EXACTLY as is.
      3. KEY PRESERVATION: Keep "Key=" exactly. Only translate "Value".
      4. DELIMITERS: Split value by "*#*", translate segments, rejoin with "*#*".
      5. PLACEHOLDERS: Preserve "%$&Name(0)", "{0}", "<Var>".
      6. Return ONLY the processed text block.
    `;

    const resultMap = new Map<number, string[]>();
    let completedLines = 0;

    for (const batch of batches) {
        if (checkStop && checkStop()) throw new Error("Processing stopped by user.");

        const batchText = batch.lines.join('\n');
        
        if (!batchText.trim()) {
             resultMap.set(batch.index, batch.lines);
             completedLines += batch.lines.length;
             onProgress(completedLines, totalLines, `Skipped empty batch.`);
             continue;
        }

        try {
            const processedText = await retry(async () => {
                const response = await this.ai.models.generateContent({
                    model: 'gemini-3-pro-preview',
                    contents: `Process lines:\n\n${batchText}`,
                    config: { systemInstruction: systemInstruction }
                });
                return response.text || "";
            });

            let resultText = processedText.replace(/^```[a-z]*\n/, '').replace(/\n```$/, '');
            const resultLines = resultText.split(/\r?\n/);
            
            const reconstructedBatch: string[] = [];
            for (let j = 0; j < batch.lines.length; j++) {
                const originalLine = batch.lines[j];
                const translatedLine = resultLines[j];
                const trimmedOriginal = originalLine.trim();
                
                if (!trimmedOriginal || trimmedOriginal.startsWith(';')) {
                    reconstructedBatch.push(originalLine); 
                    continue;
                }
                const equalsIndex = originalLine.indexOf('=');
                if (equalsIndex !== -1) {
                    const key = originalLine.substring(0, equalsIndex + 1); 
                    if (translatedLine && translatedLine.includes('=')) {
                        const transEqualsIndex = translatedLine.indexOf('=');
                        const transValue = translatedLine.substring(transEqualsIndex + 1);
                        reconstructedBatch.push(key + transValue);
                    } else if (translatedLine) {
                        reconstructedBatch.push(key + translatedLine);
                    } else {
                        reconstructedBatch.push(originalLine);
                    }
                } else {
                    reconstructedBatch.push(translatedLine || originalLine);
                }
            }
            
            resultMap.set(batch.index, reconstructedBatch);
            completedLines += batch.lines.length;
            onProgress(completedLines, totalLines, `Processed lines ${completedLines}/${totalLines}`);
            await new Promise(r => setTimeout(r, 2000)); 

        } catch (err: any) {
            console.error(`Batch failed:`, err);
            resultMap.set(batch.index, batch.lines);
        }
    }

    const finalLines: string[] = [];
    batches.sort((a, b) => a.index - b.index).forEach(b => {
        const res = resultMap.get(b.index) || b.lines;
        finalLines.push(...res);
    });

    return finalLines.join('\n');
  }

  /**
   * APP 3: Database Localizer
   */
  async translateDatabaseBatch(
    items: DBBatchItem[],
    targetLanguage: string,
    mode: 'translate' | 'rewrite',
    options?: { transliterate?: boolean; keepSanskrit?: boolean; }
  ): Promise<any[]> {
    this.validateKey();
    if (items.length === 0) return [];
    
    const modelName = 'gemini-3-flash-preview';
    const payload = items.map(item => ({ _row_id_: item.rowid, ...item.data }));
    
    const columns = Object.keys(items[0].data).filter(k => k !== 'sex');
    const properties: any = {
      _row_id_: { type: Type.INTEGER, description: "ID" }
    };
    columns.forEach(col => {
      properties[col] = { type: Type.STRING, description: `Processed content` };
    });

    const schema = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties,
        required: ["_row_id_", ...columns]
      }
    };

    const rules = `
      ABSOLUTE RULES (NO EXCEPTIONS):
      1. EXACTLY COPY formatting: leading tabs (\t), newlines, and bullet points from source.
      2. EXACTLY COPY trailing punctuation like colons (:).
      3. Do NOT summarize.
      4. Return ONLY JSON.
    `;

    const mantraRule = options?.keepSanskrit 
       ? "- Keep Mantras/Shlokas in ORIGINAL Sanskrit (Devanagari). Do not translate." 
       : options?.transliterate 
            ? "- Transliterate Mantras into phonetic English." 
            : "- Translate Mantras normally.";

    const systemPrompt = mode === 'translate' ? `
      You are an expert translator for Vedic Astrology software.
      TASK: Translate JSON values to ${targetLanguage}.
      
      INPUT: Array of JSON objects. Each may contain a 'sex' field.
      
      STRICT GENDER RULES:
      - sex=0: Masculine (Businessman, He).
      - sex=1: Feminine (Businesswoman, She).

      MANTRA HANDLING:
      ${mantraRule}
      
      ${rules}
    ` : `
      You are an expert linguistic editor.
      TASK: Rewrite JSON data in Unicode, strictly preserving meaning.
      
      ${rules}
    `;

    return retry(async () => {
      const response = await this.ai.models.generateContent({
        model: modelName,
        contents: JSON.stringify(payload),
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          responseSchema: schema as any
        }
      });

      const rawText = response.text || "[]";
      let results = JSON.parse(rawText);
      if (!Array.isArray(results)) throw new Error("Response is not an array");

      const resultMap = new Map<number, any>();
      results.forEach((r: any) => {
        if (r && typeof r._row_id_ !== 'undefined') resultMap.set(r._row_id_, r);
      });

      return items.map((item) => {
        const rawTranslated = resultMap.get(item.rowid);
        if (!rawTranslated) return { rowid: item.rowid, translatedData: item.data };

        const formattedData: Record<string, string> = {};
        Object.keys(rawTranslated).forEach(col => {
          if (col === '_row_id_') return;
          const originalVal = item.data[col];
          const translatedVal = rawTranslated[col];
          
          if (typeof originalVal === 'string' && typeof translatedVal === 'string') {
            // SCRIPT TO CHECK & ENFORCE FORMATTING in DB
            formattedData[col] = preserveFormatting(originalVal, translatedVal);
          } else {
            formattedData[col] = translatedVal;
          }
        });

        return { rowid: item.rowid, translatedData: formattedData };
      });
    });
  }
}
