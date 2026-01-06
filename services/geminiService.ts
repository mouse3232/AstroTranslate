
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
 * Strict formatting: 
 * 1. Shlokas (lines ending in | or ||) MUST start with a tab.
 * 2. Regular lines with >= 6 words MUST start with a tab.
 * 3. Short lines (< 6 words) must NOT start with a tab.
 */
function applyAstrologyFormatting(text: string): string {
  if (!text || typeof text !== 'string') return text;

  const lines = text.split('\n');
  
  const processedLines = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return ""; // Return empty string for blank lines to avoid whitespace buildup

    // Rule 2: Shloka detection.
    const isShloka = trimmed.endsWith('|') || trimmed.endsWith('||') || trimmed.endsWith('॥');

    if (isShloka) {
      return `\t${trimmed}`;
    }

    // Rule 1: Word count check.
    const wordCount = trimmed.split(/\s+/).length;
    if (wordCount < 6) {
      return trimmed;
    }

    // Default: Regular text with >= 6 words gets indented.
    return `\t${trimmed}`; 
  });

  return processedLines.join('\n');
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
        if (typeof process !== 'undefined' && process.env) {
          key = process.env.API_KEY;
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

    // Pre-process to separate leading whitespace
    const preProcessed = items.map(item => {
      const match = item.text.match(/^[\s\t]*/);
      const leading = match ? match[0] : "";
      const content = item.text.substring(leading.length);
      // Map context string to numeric Sex value for the model
      const sex = item.context === 'Female' ? 1 : 0; 
      return { leading, content, sex };
    });

    // Gemini 3 Flash Preview for text tasks
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
      
      STRICT GENDER & TONE RULES (APPLY PER ITEM BASED ON "sex" VALUE):
      1. SEX PARAMETER:
         - sex=0 means MASCULINE context.
         - sex=1 means FEMININE context.
      2. TONE ENFORCEMENT:
         - IF sex=0: Use masculine grammatical forms, pronouns, titles, and profession names.
         - IF sex=1: MANDATORILY convert the output to FEMININE tone. Use feminine forms, pronouns, titles.
           - Source text (Neutral/Masculine) MUST be transformed into Feminine form.
      3. WORD MAPPING EXAMPLES:
         - "Businessperson" -> "Businessman" (sex=0) / "Businesswoman" (sex=1).
         - "Spouse" -> "Wife" (sex=0) / "Husband" (sex=1).
         - "He" -> "He" (sex=0) / "She" (sex=1) [when referring to the native].
         - NEVER return the same neutral term for both sexes if distinct terms exist.
      
      GENERAL RULES:
      1. NO EXPLANATION. NO NOTES. Output ONLY the processed text in the "results" array.
      2. PRESERVE variables like <Var>, {0}, %s EXACTLY.
      3. MANTRA HANDLING:
         ${keepSanskrit ? "- Keep Mantras/Shlokas in ORIGINAL Sanskrit (Devanagari). Do not translate." : transliterateShlokas ? "- Transliterate Mantras into phonetic English." : "- Translate Mantras normally."}
    `;

    // Construct the payload with explicit sex per item
    const payload = preProcessed.map(p => ({
      text: p.content,
      sex: p.sex
    }));

    try {
      const response = await this.ai.models.generateContent({
        model: modelName,
        contents: [{ role: 'user', parts: [{ text: prompt }, { text: JSON.stringify(payload) }] }],
        config: { responseMimeType: "application/json", responseSchema: batchResponseSchema }
      });

      const parsed = JSON.parse(response.text || "{}");
      const results = parsed.results || [];

      return preProcessed.map((item, idx) => ({
        text: item.leading + (results[idx]?.processedText ?? item.content)
      }));
    } catch (error: any) {
      console.error("Gemini Error:", error);
      if (error.message?.includes("401") || error.message?.includes("API key")) {
         throw new Error("Invalid or Missing API Key.");
      }
      throw error;
    }
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
      RULES:
      1. Translate ALL string literals inside quotes and items inside arrays.
      2. Do NOT translate keys (identifiers before colon).
      3. Do NOT translate variable names or code keywords.
      4. Presere all syntax, indentation, and structure EXACTLY.
      5. Astrology context: ensure terms like 'Rahu' are correct for the target language.
      6. Return ONLY raw code, no markdown.
    `;

    try {
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
    } catch (error: any) {
      throw new Error(error.message || "Failed to translate resource file.");
    }
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
    const calcBatch = Math.ceil(totalLines * 0.25);
    const BATCH_SIZE = Math.max(10, Math.min(calcBatch, 10000)); 

    const processedLines: string[] = [];

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

    for (let i = 0; i < totalLines; i += BATCH_SIZE) {
      if (checkStop && checkStop()) {
         throw new Error("Processing stopped by user.");
      }
      
      const batch = lines.slice(i, i + BATCH_SIZE);
      const batchText = batch.join('\n');
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(totalLines / BATCH_SIZE);

      onProgress(i, totalLines, `Sending Batch ${batchNum}/${totalBatches} (${batch.length} lines)...`);

      if (!batchText.trim()) {
        processedLines.push(...batch);
        continue;
      }

      try {
        const response = await this.ai.models.generateContent({
          model: 'gemini-3-pro-preview',
          contents: `Process lines ${i + 1} to ${Math.min(i + BATCH_SIZE, totalLines)}:\n\n${batchText}`,
          config: { systemInstruction: systemInstruction }
        });

        let resultText = response.text || "";
        resultText = resultText.replace(/^```[a-z]*\n/, '').replace(/\n```$/, '');
        const resultLines = resultText.split(/\r?\n/);
        
        // Reconstruction logic (kept same as before for stability)
        const reconstructedBatch: string[] = [];
        for (let j = 0; j < batch.length; j++) {
           const originalLine = batch[j];
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
        
        processedLines.push(...reconstructedBatch);
      } catch (err: any) {
        throw new Error(`Batch ${batchNum} failed: ${err.message}`);
      }
    }

    return processedLines.join('\n');
  }

  /**
   * APP 3: Database Localizer
   */
  async translateDatabaseBatch(
    items: DBBatchItem[],
    targetLanguage: string,
    mode: 'translate' | 'rewrite'
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

    const systemPrompt = mode === 'translate' ? `
      You are an expert translator for Vedic Astrology software.
      TASK: Translate JSON values to ${targetLanguage}.
      
      INPUT: Array of JSON objects. Each may contain a 'sex' field.
      
      STRICT GENDER RULES (MANDATORY):
      1. INSPECT 'sex' field in EACH object:
         - sex=0 OR sex='0' -> MASCULINE Context (Male).
         - sex=1 OR sex='1' -> FEMININE Context (Female).
      2. APPLY TONE based on specific 'sex' value:
         - Sex=0: Use Masculine terms (Businessman, Husband, Him).
         - Sex=1: Use Feminine terms (Businesswoman, Wife, Her).
         - IF source is "Businessperson":
            - Output "Businessman" for Sex=0.
            - Output "Businesswoman" for Sex=1.
      3. DEFAULT: If 'sex' is missing, assume Neutral/Masculine.
      
      GENERAL RULES:
      1. Meaning-for-meaning translation.
      2. "The native" -> "You".
      3. Decode KrutiDev/Devlys to Unicode.
      4. Return ONLY JSON.
    ` : `
      You are an expert linguistic editor.
      TASK: Rewrite JSON data in Unicode, strictly preserving meaning.
      
      INPUT: Array of JSON objects. Each may contain a 'sex' field.
      
      STRICT GENDER RULES (MANDATORY):
      1. INSPECT 'sex' field in EACH object:
         - sex=0 -> MASCULINE Context.
         - sex=1 -> FEMININE Context.
      2. APPLY TONE based on specific 'sex' value:
         - Sex=0: Masculine grammar/terms.
         - Sex=1: Feminine grammar/terms (Convert source if needed).
         
      GENERAL RULES:
      1. Fix grammar/spelling.
      2. "The native" -> "You".
      3. Convert KrutiDev/Devlys to Unicode.
      4. Return ONLY JSON.
    `;

    try {
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
          if (typeof rawTranslated[col] === 'string') {
            formattedData[col] = applyAstrologyFormatting(rawTranslated[col]);
          } else {
            formattedData[col] = rawTranslated[col];
          }
        });

        return { rowid: item.rowid, translatedData: formattedData };
      });

    } catch (error: any) {
      console.warn(`Gemini Batch Failed:`, error);
      throw error;
    }
  }
}
