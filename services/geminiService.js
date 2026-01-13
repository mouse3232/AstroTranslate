
const { GoogleGenAI, Type } = require("@google/genai");

function applyAstrologyFormatting(text) {
  if (!text || typeof text !== 'string') return text;
  const lines = text.split('\n');
  const processedLines = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return "";
    if (trimmed.endsWith(':')) return trimmed;
    return `\t${trimmed}`;
  });
  return processedLines.join('\n');
}

async function retry(fn, retries = 10, baseDelay = 10000, factor = 2) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const msg = (error.message || '').toLowerCase();
      const isRetryable = msg.includes('429') || msg.includes('503') || error.status === 429 || error.status === 503;
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

class GeminiService {
  constructor(customApiKey) {
    let key = customApiKey || process.env.API_KEY;
    this.hasKey = !!key;
    this.ai = new GoogleGenAI(key || 'dummy_key');
  }

  validateKey() {
    if (!this.hasKey) {
      throw new Error("Missing Gemini API Key. Please check your settings.");
    }
  }

  async translateBatch(items, targetLanguage, mode, transliterateShlokas = false, keepSanskrit = false) {
    this.validateKey();
    if (items.length === 0) return [];

    const preProcessed = items.map(item => {
      const match = item.text.match(/^[\s\t]*/);
      const leading = match ? match[0] : "";
      const content = item.text.substring(leading.length);
      const sex = item.context === 'Female' ? 1 : 0;
      return { leading, content, sex };
    });

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
      1. PRESERVE variables like <Var>, {0}, %s EXACTLY.
      2. MANTRA HANDLING:
         ${keepSanskrit ? "- Keep Mantras/Shlokas in ORIGINAL Sanskrit (Devanagari). Do not translate." : transliterateShlokas ? "- Transliterate Mantras into phonetic English." : "- Translate Mantras normally."}
      ABSOLUTE RULES (NO EXCEPTIONS):
      1. ZERO ORIGINAL TEXT: The output must contain zero original-language text from the input.
      2. NO COPYING: No word, phrase, sentence, or character sequence may appear in the output exactly as it appears in the input (unless it is a proper noun or variable).
      3. FULL PROCESSING: The entire input must be fully processed.
      4. LENGTH CHECK: Output length must be ≥ 99% of the input word count.
      5. NO SUMMARIES: Do not summarize. Do not skip lines. Do not truncate.
      6. NO EXPLANATIONS: Return only the processed text strings in the JSON structure.
      7. FAILURE HANDLING: If any part cannot be processed, return an empty string for that specific item (do not return partial text).
    `;
    const payload = preProcessed.map(p => ({
      text: p.content,
      sex: p.sex
    }));

    return retry(async () => {
      const model = this.ai.getGenerativeModel({ model: "gemini-1.5-flash-preview" });
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }, { text: JSON.stringify(payload) }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: batchResponseSchema }
      });
      const response = await result.response;

      const parsed = JSON.parse(response.response.text() || "{}");
      const results = parsed.results || [];

      return preProcessed.map((item, idx) => ({
        text: applyAstrologyFormatting(results[idx]?.processedText ?? item.content)
      }));
    });
  }
}

module.exports = { GeminiService };
