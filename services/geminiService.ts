import { GoogleGenAI, Type } from "@google/genai";
import { MODEL_NAME } from '../constants';
import { ProcessingMode } from '../types';

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
    mode: ProcessingMode
  ): Promise<string[]> {
    if (items.length === 0) return [];

    const instruction = mode === 'rewrite'
      ? `You are an expert astrology software editor. 
         REWRITE and CORRECT the grammatical mistakes in the following text which is in ${targetLanguage} (or English).
         Do NOT translate if the text is already in the target language.
         Preserve the astrological meaning perfectly.`
      : `You are an expert translator for technical astrology software.
         TRANSLATE the following text into ${targetLanguage}.`;

    const prompt = `
      ${instruction}

      CRITICAL RULES:
      1. **Unicode Enforcement**: The output MUST be in standard UTF-8 Unicode for all languages. 
      2. **Krutidev/Legacy Font Detection**: The input text might contain lines written in 'Krutidev 010', 'Devlys', or similar legacy Hindi font encodings (which appear as garbled ASCII characters like "v©"kf/k ef.k"). 
         - IF you detect this, you MUST first decode it to Hindi Unicode, and THEN translate it to the target language (or keep as Hindi Unicode if target is Hindi).
      3. **Mantras**: If the text contains Mantras (Sanskrit prayers) either in Sanskrit or English transliteration:
         - Transliterate them into the script of the target language so they can be pronounced correctly.
         - Do not translate the meaning of the Mantra itself unless it is part of a descriptive sentence.
      4. **Variables**: Preserve all variables inside angle brackets exactly as is (e.g., <PlanetInfluence>, <House>, <Ratna1>). Do NOT translate or modify them.
      5. **Formatting**: Preserve all leading and trailing whitespace exactly.
      6. **Gender Specificity & Personalization**:
         - The input JSON provides a 'context' field ('Male', 'Female', or 'Neutral').
         - **Personal Tone**: Make the prediction sound personal to the reader (e.g., change "The native will have" to "You will have").
         - **Specific Terminology (CRITICAL)**:
           - If Context is **Male**: 
             - Replace "spouse", "partner", "husband/wife" with **"Wife"** (or target language equivalent).
             - Replace "boy/girl", "opposite sex" with **"Girl"** or **"Woman"**.
             - Use masculine grammar.
           - If Context is **Female**: 
             - Replace "spouse", "partner", "husband/wife" with **"Husband"** (or target language equivalent).
             - Replace "boy/girl", "opposite sex" with **"Boy"** or **"Man"**.
             - Use feminine grammar.
      7. Return ONLY a JSON array of strings corresponding to the results, in the exact order of input.
    `;

    // Map items to a simpler structure for the model to digest
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
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.STRING
            }
          }
        }
      });

      const jsonStr = response.text || "[]";
      let results: string[] = JSON.parse(jsonStr);

      // Sanity check length
      if (results.length !== items.length) {
        console.warn(`Mismatch in translation count. Sent ${items.length}, got ${results.length}. Padding with originals.`);
        // Fill missing spots with original text to prevent crash
        const padded = [...results];
        while (padded.length < items.length) {
          padded.push(items[padded.length].text);
        }
        results = padded;
      }

      return results;

    } catch (error) {
      console.error("Gemini Processing Error:", error);
      // Fallback: return original texts
      return items.map(i => i.text);
    }
  }
}