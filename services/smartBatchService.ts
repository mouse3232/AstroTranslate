
import { GoogleGenAI, Type } from "@google/genai";
import { ProcessingItem, BatchResponse, ProcessingMode } from '../types';

export class SmartBatchService {
  private client: GoogleGenAI;
  private apiKey: string;
  // Rate Limiting
  private maxConcurrent = 50;
  private tpmLimit = 1000000; // 1 Million Tokens Per Minute
  private tokensUsedInMinute = 0;
  private minuteStart = Date.now();

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.client = new GoogleGenAI({ apiKey });
  }

  /**
   * Estimates token count (rough approximation: 4 chars = 1 token)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Rate limiter check. Pauses if TPM limit reached.
   */
  private async checkRateLimit(estimatedTokens: number) {
    const now = Date.now();
    if (now - this.minuteStart > 60000) {
        // Reset window
        this.tokensUsedInMinute = 0;
        this.minuteStart = now;
    }

    if (this.tokensUsedInMinute + estimatedTokens > this.tpmLimit) {
        const waitTime = 60000 - (now - this.minuteStart) + 1000;
        console.warn(`[SmartBatch] TPM Limit reached. Waiting ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        this.tokensUsedInMinute = 0;
        this.minuteStart = Date.now();
    }
    
    this.tokensUsedInMinute += estimatedTokens;
  }

  /**
   * Groups items by WORD COUNT to optimize payload size.
   * Target: ~1500 words per batch (approx 2k tokens), safe for context window.
   */
  private createSmartBatches(items: ProcessingItem[], targetWordCount: number = 1500): ProcessingItem[][] {
    const batches: ProcessingItem[][] = [];
    let currentBatch: ProcessingItem[] = [];
    let currentWordCount = 0;

    for (const item of items) {
        const wordCount = item.text.split(/\s+/).length;
        
        if (currentWordCount + wordCount > targetWordCount && currentBatch.length > 0) {
            batches.push(currentBatch);
            currentBatch = [];
            currentWordCount = 0;
        }

        currentBatch.push(item);
        currentWordCount += wordCount;
    }

    if (currentBatch.length > 0) {
        batches.push(currentBatch);
    }

    return batches;
  }

  /**
   * Main Process Method
   */
  async process(
    items: ProcessingItem[],
    targetLang: string,
    mode: ProcessingMode,
    options: { transliterate: boolean; keepSanskrit: boolean },
    onProgress: (completedItems: number, totalItems: number) => void,
    checkStop: () => boolean,
    addLog: (mod: string, msg: string) => void
  ): Promise<Record<string, string>> {
    
    // 1. Create Smart Batches
    const batches = this.createSmartBatches(items);
    addLog('SMART', `Created ${batches.length} optimized batches based on word count.`);

    const mantraRule = options.keepSanskrit 
       ? "- Keep Mantras/Shlokas in ORIGINAL Sanskrit (Devanagari). Do not translate." 
       : options.transliterate 
            ? "- Transliterate Mantras into phonetic English." 
            : "- Translate Mantras normally.";

    // 2. Setup Context Cache
    // We cache the system prompt to save input tokens and speed up processing
    const systemPrompt = `
      ROLE: You are an expert translator/editor for astrology software.
      TASK: ${mode === 'rewrite' ? 'Rewrite to fix grammar/encoding' : 'Translate to ' + targetLang}.
      
      RULES:
      1. Maintain 99% closeness to original meaning.
      2. If a segment is already correct/translated, leave it unchanged.
      3. No English in Output if Target is Hindi. No Hindi in Output if Source is Hindi.
      4. Strict JSON Array output.
      5. Context: 'Male' or 'Female' applies to the subject.
      6. MANTRA HANDLING:
         ${mantraRule}
    `;

    // Model to use for both caching (if available) and generation
    const MODEL_NAME = 'gemini-3-flash-preview'; 

    let cacheName: string | undefined = undefined;
    
    try {
        // Attempt to create cache (TTL 5 mins)
        // Note: Caching might not be supported on all preview models or free tiers.
        // We attempt it, but catch errors gracefully.
        const cacheOp = await this.client.caches.create({
            model: MODEL_NAME, 
            config: {
                systemInstruction: systemPrompt,
                ttl: '300s' 
            }
        });
        cacheName = cacheOp.name;
        addLog('SMART', `Context Cache Created: ${cacheName}`);
    } catch (e: any) {
        addLog('SMART', `Cache creation skipped/failed: ${e.message}. Using standard context.`);
    }

    // 3. Concurrent Processing
    const resultsMap: Record<string, string> = {};
    let completedCount = 0;
    let activePromises: Promise<void>[] = [];

    for (let i = 0; i < batches.length; i++) {
        if (checkStop()) break;

        // Concurrency Control
        if (activePromises.length >= this.maxConcurrent) {
            await Promise.race(activePromises);
        }

        const batch = batches[i];
        
        // Payload Construction
        const payload = batch.map(b => ({
            id: `${b.blockId}_${b.lineIndex}`,
            text: b.text,
            ctx: b.context
        }));

        const prompt = JSON.stringify(payload);
        const estimatedTokens = this.estimateTokens(prompt) + 500; // +500 for output buffer
        
        await this.checkRateLimit(estimatedTokens);

        const p = (async () => {
            try {
                const response = await this.client.models.generateContent({
                    model: MODEL_NAME,
                    contents: [
                        { role: 'user', parts: [{ text: `Process this JSON array: ${prompt}` }] }
                    ],
                    config: {
                        cachedContent: cacheName, // Use the cache if created
                        responseMimeType: 'application/json',
                        // If cache exists, systemInstruction is implicit.
                        // If cache failed, we inject systemPrompt here.
                        systemInstruction: cacheName ? undefined : systemPrompt 
                    }
                });

                const raw = response.text || "[]";
                const json = JSON.parse(raw);
                
                if (Array.isArray(json)) {
                    json.forEach((resItem: any, idx: number) => {
                         // Fallback logic for ordering
                         const original = payload[idx];
                         // Try to match by ID if returned, else index
                         const text = resItem.processedText || resItem.text || resItem; 
                         if (original && typeof text === 'string') {
                             resultsMap[original.id] = text;
                         }
                    });
                }

                completedCount += batch.length;
                onProgress(completedCount, items.length);

            } catch (err: any) {
                addLog('ERR', `Batch ${i} failed: ${err.message}`);
            } finally {
                // Remove self from active
                const idx = activePromises.indexOf(p);
                if (idx > -1) activePromises.splice(idx, 1);
            }
        })();

        activePromises.push(p);
    }

    // Wait for remaining
    await Promise.all(activePromises);

    return resultsMap;
  }
}
