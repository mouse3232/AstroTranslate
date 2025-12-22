import { GoogleGenAI, Type, Schema } from "@google/genai";
import { MODEL_NAME } from '../constants';
import { ProcessingMode, BatchResponse } from '../types';

interface BatchItem {
  text: string;
  context: string; // 'Male' | 'Female' | 'Neutral'
}

export class GeminiService {
  private ai: GoogleGenAI;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async translateBatch(
    items: BatchItem[],
    targetLanguage: string,
    mode: ProcessingMode,
    transliterateShlokas: boolean = false
  ): Promise<BatchResponse[]> {
    if (items.length === 0) return [];

    let instruction = '';
    let tools: any[] = [];
    
    // Schema definition for robust output
    const batchResponseSchema: Schema = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING, description: "The final output text (translated, rewritten, or converted)." },
          wasCorrected: { type: Type.BOOLEAN, description: "True if the text was significantly corrected for facts/spelling (mostly for convert mode)." },
          originalDecoded: { type: Type.STRING, description: "For convert mode: the raw decoding before correction." },
          reason: { type: Type.STRING, description: "Reason for the correction if applicable." },
          source: { type: Type.STRING, description: "Source URL if verified via Google Search." }
        },
        required: ["text"]
      }
    };

    if (mode === 'rewrite') {
      instruction = `You are an expert astrology software editor. 
         Task: REWRITE and CORRECT grammatical mistakes in the provided text.
         - The text is likely in ${targetLanguage} or English.
         - Do NOT translate if it is already in ${targetLanguage}, just refine it.
         - Preserve the original astrological meaning perfectly.`;
    } else if (mode === 'convert_encoding') {
      // Enable Google Search for grounding in this mode
      tools = [{ googleSearch: {} }];
      
      instruction = `You are an expert in decoding legacy Hindi fonts (KrutiDev 010) to Unicode.
         Task: CONVERT the text from KrutiDev to Unicode Hindi.
         
         CRITICAL VERIFICATION PROCESS:
         1. Decode the garbled ASCII string to Hindi.
         2. If the text appears to be a Sanskrit Shloka, Mantra, or astrological fact, VERIFY it using the Google Search tool.
         3. If the decoded text has spelling errors or incorrect words compared to the standard mantra/text found online, CORRECT IT.
         4. If you apply a correction, set 'wasCorrected' to true, provide the 'reason', and the 'originalDecoded' (the raw conversion before fixing).
         5. Preserve variables like <Planet> exactly.`;
    } else {
      instruction = `You are an expert translator. TRANSLATE to ${targetLanguage}.`;
    }

    const shlokaInstruction = transliterateShlokas ? `
    6. SHLOKA/MANTRA HANDLING (STRICT):
       - IF the input contains a Sanskrit Shloka, Mantra, or Verse:
         * DO NOT translate its meaning into English or the target language words.
         * INSTEAD, TRANSLITERATE it phonetically into the Target Language script.
       - Case 1: Target is English (or similar Latin script):
         * Write in "Hinglish" (Romanized Sanskrit). 
         * Example: "Tum Kaha Ja rhe" or "Om Bhur Bhuva Swaha".
       - Case 2: Target is Hindi (or Indic script):
         * Write in standard Sanskrit/Hindi Unicode.
         * Example: "ॐ भूर्भुवः स्वः".
    ` : '';

    const prompt = `
      ${instruction}

      GLOBAL RULES:
      1. Output MUST be standard UTF-8.
      2. Preserve variables (<Var>) exactly.
      3. Preserve formatting (whitespace).
      4. GENDER ADAPTATION (CRITICAL):
         - Each input item has a "context" field ('Male', 'Female', or 'Neutral').
         - You MUST adapt the output to match this gender context specifically.
         - RULES for 'Male' Context:
           * Replace gender-neutral terms like "Businessperson" with "Businessman".
           * Replace "Spouse" with "Wife" (unless context implies otherwise).
           * Use masculine grammar and adjectives (e.g., Hindi: 'जातक', 'करता', 'होगा').
         - RULES for 'Female' Context:
           * Replace gender-neutral terms like "Businessperson" with "Businesswoman".
           * Replace "Spouse" with "Husband" (unless context implies otherwise).
           * Use feminine grammar and adjectives (e.g., Hindi: 'जातिका', 'करती', 'होगी').
         - Apply this adaptation logic for ALL languages (English, Hindi, Spanish, etc.).
      5. Return strictly a JSON Array matching the schema.
      ${shlokaInstruction}
    `;

    const promptInput = items.map(item => ({
      text: item.text,
      context: item.context
    }));

    try {
      const response = await this.ai.models.generateContent({
        model: MODEL_NAME,
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              { text: JSON.stringify(promptInput) }
            ]
          }
        ],
        config: {
          tools: tools,
          responseMimeType: "application/json",
          responseSchema: batchResponseSchema
        }
      });

      const jsonStr = response.text || "[]";
      let results: BatchResponse[] = JSON.parse(jsonStr);

      // Sanity check length
      if (results.length !== items.length) {
        // Pad with errors or originals
        const padded = [...results];
        while (padded.length < items.length) {
          padded.push({ text: items[padded.length].text });
        }
        results = padded;
      }

      return results;

    } catch (error) {
      console.error("Gemini Processing Error:", error);
      // Fallback
      return items.map(i => ({ text: i.text }));
    }
  }
}