
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
    // Check if the line ends with a Danda (|) or Double Danda (||) or Devanagari Danda (॥)
    // We treat these as Shlokas which require indentation.
    const isShloka = trimmed.endsWith('|') || trimmed.endsWith('||') || trimmed.endsWith('॥');

    if (isShloka) {
      return `\t${trimmed}`;
    }

    // Rule 1: Word count check.
    // If < 6 words, do NOT indent.
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

  constructor(customApiKey?: string) {
    // Priority: Custom Key > Env Key
    const key = customApiKey || process.env.API_KEY;
    if (!key) {
      console.error("API Key is missing");
    }
    this.ai = new GoogleGenAI({ apiKey: key });
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
    if (items.length === 0) return [];

    const preProcessed = items.map(item => {
      const match = item.text.match(/^[\s\t]*/);
      const leading = match ? match[0] : "";
      const content = item.text.substring(leading.length);
      return { leading, content, context: item.context };
    });

    // Requirement: Prediction Tool uses Gemini Flash 3 Preview
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
      ? `REWRITE and proofread the text for clarity and grammar. KEEP THE SAME LANGUAGE. Decode legacy KrutiDev to Unicode.`
      : `TRANSLATE the text into ${targetLanguage}.`;

    const prompt = `
      You are an astrology expert.
      ${instruction}
      ${keepSanskrit ? "Keep Sanskrit Mantras in Devanagari (Do not translate them, just output in Devanagari script)." : transliterateShlokas ? "Transliterate Mantras phonetically." : ""}
      Gender context: ${items[0].context}.
      Preserve variables like <Var>.
    `;

    try {
      const response = await this.ai.models.generateContent({
        model: modelName,
        contents: [{ role: 'user', parts: [{ text: prompt }, { text: JSON.stringify(preProcessed.map(p => p.content)) }] }],
        config: { responseMimeType: "application/json", responseSchema: batchResponseSchema }
      });

      const parsed = JSON.parse(response.text || "{}");
      const results = parsed.results || [];

      return preProcessed.map((item, idx) => ({
        text: item.leading + (results[idx]?.processedText ?? item.content)
      }));
    } catch (error) {
      console.error("Gemini Error:", error);
      return items.map(i => ({ text: i.text }));
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
    // Requirement: Resource Tool uses Gemini 3 Pro Preview
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
   * APP 2.5: DotNet/Text Resource Localizer (Key=Value Based)
   */
  async translateDotNetResource(
    content: string,
    targetLang: string,
    onProgress: (current: number, total: number, logMsg: string) => void
  ): Promise<string> {
    // Splits by newline, handles CRLF or LF
    const lines = content.split(/\r?\n/);
    const totalLines = lines.length;
    
    // User Requirement: "Make 25% of it as one batch"
    // We calculate batch size to be roughly 25% of the file, ensuring we don't exceed model limits.
    // Minimum 10 lines to avoid tiny batches for small files.
    // If file is huge, 25% might be too big, but Gemini 1.5/3 context is huge.
    // Let's cap at 10,000 lines per batch just to be safe on output tokens, but 25% is the primary rule.
    const calcBatch = Math.ceil(totalLines * 0.25);
    const BATCH_SIZE = Math.max(10, Math.min(calcBatch, 10000)); 

    const processedLines: string[] = [];

    // System instruction for the batch
    const systemInstruction = `
      You are a specialized translator for .NET/Text resource files. 
      Input format is "Key=Value" pairs, with optional "*#*" delimiters for array values.
      Target Language: ${targetLang}.

      STRICT RULES:
      1. OUTPUT FORMAT: Return EXACTLY the same number of lines as input. Preserve empty lines.
      2. COMMENT LINES: If a line starts with ';', return it EXACTLY as is. DO NOT TRANSLATE.
      3. KEY PRESERVATION: For "Key=Value", keep "Key=" exactly as is. Only translate "Value".
      4. DELIMITERS: If the Value contains "*#*", split by it, translate each segment individually, and join with "*#*" preserving the delimiter.
      5. PLACEHOLDERS: Preserve variables like "%$&Name(0)", "{0}", "<Var>" exactly.
      6. ASTROLOGY CONTEXT: Use Vedic astrology terms (e.g. Sun -> Surya in Hindi) where appropriate.
      7. Return ONLY the processed text block. No markdown fencing.
    `;

    for (let i = 0; i < totalLines; i += BATCH_SIZE) {
      const batch = lines.slice(i, i + BATCH_SIZE);
      const batchText = batch.join('\n');
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(totalLines / BATCH_SIZE);

      onProgress(i, totalLines, `Sending Batch ${batchNum}/${totalBatches} (${batch.length} lines) to Gemini...`);

      if (!batchText.trim()) {
        // Skip empty batches but preserve lines
        processedLines.push(...batch);
        onProgress(Math.min(i + BATCH_SIZE, totalLines), totalLines, `Batch ${batchNum} was empty, skipping translation.`);
        continue;
      }

      try {
        const response = await this.ai.models.generateContent({
          model: 'gemini-3-pro-preview',
          contents: `Process this batch (lines ${i + 1} to ${Math.min(i + BATCH_SIZE, totalLines)}):\n\n${batchText}`,
          config: {
            systemInstruction: systemInstruction,
          }
        });

        let resultText = response.text || "";
        // Cleanup markdown if present
        resultText = resultText.replace(/^```[a-z]*\n/, '').replace(/\n```$/, '');
        
        const resultLines = resultText.split(/\r?\n/);
        
        // --- BEST LOCAL PROGRAMMING: SYNTAX RECONSTRUCTION ---
        // We trust the model's text, but we enforce the original structure (Keys, Comments, Empty lines)
        // to ensure "final file syntax match with original file syntax".
        
        const reconstructedBatch: string[] = [];
        
        for (let j = 0; j < batch.length; j++) {
           const originalLine = batch[j];
           const translatedLine = resultLines[j];
           
           const trimmedOriginal = originalLine.trim();
           
           // Case 1: Empty Line
           if (!trimmedOriginal) {
             reconstructedBatch.push(originalLine); // Preserve original empty line
             continue;
           }

           // Case 2: Comment Line
           if (trimmedOriginal.startsWith(';')) {
             reconstructedBatch.push(originalLine); // Preserve original comment
             continue;
           }

           // Case 3: Key=Value
           const equalsIndex = originalLine.indexOf('=');
           if (equalsIndex !== -1) {
              const key = originalLine.substring(0, equalsIndex + 1); // "Key="
              
              // Try to extract value from translated line
              if (translatedLine && translatedLine.includes('=')) {
                  // If model respected structure, take its value
                  const transEqualsIndex = translatedLine.indexOf('=');
                  const transValue = translatedLine.substring(transEqualsIndex + 1);
                  reconstructedBatch.push(key + transValue);
              } else if (translatedLine) {
                  // If model returned just the value (edge case), append it to original key
                  reconstructedBatch.push(key + translatedLine);
              } else {
                  // Fallback: use original line if translation missing
                  reconstructedBatch.push(originalLine);
              }
           } else {
              // Case 4: Other text (no equals, not comment)
              // Use translated line if available, else original
              reconstructedBatch.push(translatedLine || originalLine);
           }
        }
        
        processedLines.push(...reconstructedBatch);
        onProgress(Math.min(i + BATCH_SIZE, totalLines), totalLines, `Batch ${batchNum} completed. Reconstructed ${reconstructedBatch.length} lines.`);

      } catch (err: any) {
        console.error(`Error processing batch starting at line ${i}`, err);
        onProgress(Math.min(i + BATCH_SIZE, totalLines), totalLines, `Error in Batch ${batchNum}: ${err.message}. Using original content.`);
        // Fallback: push original lines for this batch to prevent data loss
        processedLines.push(...batch);
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
    if (items.length === 0) return [];

    // Requirement: Database Tool uses Gemini Flash 3 Preview
    const modelName = 'gemini-3-flash-preview';
    
    // Inject _row_id_ into payload to ensure robust matching even if rows are dropped or reordered
    const payload = items.map(item => ({ _row_id_: item.rowid, ...item.data }));
    
    // Dynamically build schema based on columns present in data
    // We expect the model to return _row_id_ and the translatable columns
    const columns = Object.keys(items[0].data).filter(k => k !== 'sex');
    const properties: any = {
      _row_id_: { type: Type.INTEGER, description: "The distinct row ID provided in input." }
    };
    columns.forEach(col => {
      properties[col] = { type: Type.STRING, description: `Processed content for column ${col}` };
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
      You are an expert translator specializing in Vedic Astrology (Jyotish) and software localization.
      TASK: Translate JSON values to ${targetLanguage} preserving EXACT meaning, tone, and context.

      IMPORTANT: The input array contains objects with a '_row_id_'. You MUST return an array of objects where each object contains the corresponding '_row_id_' and the translated fields. Do NOT merge or skip rows.

      PRINCIPLES:
      1. Semantic Fidelity: Translate meaning-for-meaning, ensuring identical astrological significance.
      2. Personal Tone: Change "The native will have" to "You will have".
      3. Whitespace: Preserve breaks and internal spacing EXACTLY.
      4. Legacy Encoding: Detect KrutiDev/Devlys ASCII (garbled text) and decode to Unicode before translating.
      5. Mantras & Cultural Terms: Detect terms like "Rashi", "Hanuman Chalisa", or "Om Namah Shivaya" and TRANSLITERATE them accurately into ${targetLanguage} script. Do not translate their meaning.
      6. Shlokas: Identify Sanskrit verses by structure (lines ending in ॥ or |). DO NOT TRANSLATE meaning. Transliterate phonetic sounds neatly. Maintain line breaks and verse structure. Avoid diacritics for English targets.
      7. Gender Specificity: If 'sex' field is provided (0=Male, 1=Female):
         - Sex=0: Spouse -> Wife, Businessperson -> Businessman, Opposite sex -> Girl/Woman.
         - Sex=1: Spouse -> Husband, Businessperson -> Businesswoman, Opposite sex -> Boy/Man.
      
      Return ONLY the JSON array.
    ` : `
      You are an expert linguistic editor and Vedic Astrology (Jyotish) specialist.
      TASK: Rewrite JSON data values in proper Unicode, keeping the EXACT SAME MEANING and sense.

      IMPORTANT: The input array contains objects with a '_row_id_'. You MUST return an array of objects where each object contains the corresponding '_row_id_' and the rewritten fields. Do NOT merge or skip rows.

      REWRITING PRINCIPLES:
      1. Minimal Grammar Fixes: Only if it improves readability without changing meaning.
      2. Personal Tone: Change "The native will have" to "You will have".
      3. Whitespace: Maintain ALL line breaks and formatting precisely.
      4. Encoding: faithful conversion of KrutiDev/Devlys to clean Unicode.
      5. Shlokas: Normalize and correct garbled characters using grounding. Rewrite accurately in the target script. Preserve verse structure (॥, |).
      6. Gender Specificity: Use the 'sex' field (0=Male, 1=Female) to specialize terms (Wife/Husband, Businessman/Businesswoman).

      Return ONLY the JSON array.
    `;

    const MAX_RETRIES = 3;
    let lastError: any;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
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
        let results;
        try {
          results = JSON.parse(rawText);
        } catch (e) {
          throw new Error("Invalid JSON returned from Gemini");
        }

        if (!Array.isArray(results)) throw new Error("Response is not an array");

        // Map results by row_id for robust lookup
        // We use a Map to handle potential out-of-order returns
        const resultMap = new Map<number, any>();
        results.forEach((r: any) => {
          if (r && typeof r._row_id_ !== 'undefined') {
            resultMap.set(r._row_id_, r);
          }
        });

        // Construct the final array ensuring it matches input `items` length and order
        return items.map((item) => {
          const rawTranslated = resultMap.get(item.rowid);
          
          // If a row is missing in the response, we fallback to the original data
          // rather than failing the whole batch.
          if (!rawTranslated) {
            console.warn(`Row ${item.rowid} missing in Gemini response. Using original data.`);
            return {
              rowid: item.rowid,
              translatedData: item.data // Fallback to original
            };
          }

          const formattedData: Record<string, string> = {};
          
          Object.keys(rawTranslated).forEach(col => {
            // Skip the ID field in the actual data payload returned
            if (col === '_row_id_') return;

            if (typeof rawTranslated[col] === 'string') {
              // Apply the programmatic local fix for tabs/gaps
              formattedData[col] = applyAstrologyFormatting(rawTranslated[col]);
            } else {
              formattedData[col] = rawTranslated[col];
            }
          });

          return {
            rowid: item.rowid,
            translatedData: formattedData
          };
        });

      } catch (error) {
        console.warn(`Gemini Batch Attempt ${attempt + 1} failed:`, error);
        lastError = error;
        // Wait briefly before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }

    console.error("Gemini DB Error after retries:", lastError);
    // Fallback: Return original data if all retries fail, preserving the process flow
    return items.map(item => ({ rowid: item.rowid, translatedData: item.data }));
  }
}
