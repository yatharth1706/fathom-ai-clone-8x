import { z } from "zod";
import { analyzePrompt, askPrompt, SYSTEM_PROMPT, summarizePrompt } from "./prompts";
import {
  analysisSchema,
  answerSchema,
  summarySchema,
  type LlmProvider,
  type TemplateId,
  type TranscriptForLlm,
} from "./types";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_ATTEMPTS = 8;
/** Give up retrying after this long, so a call fits inside a 300 s serverless route with room to record the failure. */
const RETRY_BUDGET_MS = 240_000;
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Free-tier 429s carry a RetryInfo detail like `"retryDelay": "17s"`; honour it when present. */
function retryDelayMs(body: string, attempt: number) {
  const m = /"retryDelay":\s*"(\d+(?:\.\d+)?)s"/.exec(body);
  const hinted = m ? Math.ceil(Number(m[1]) * 1000) + 500 : 0;
  return Math.max(hinted, Math.min(2000 * 2 ** attempt, 30_000));
}

export class GeminiProvider implements LlmProvider {
  readonly name = "gemini";
  private lastModel: string;

  /** Optional `fallbackModel` takes over while the primary returns 503 "high demand", which can last minutes. */
  constructor(
    private apiKey: string,
    private primaryModel: string,
    private fallbackModel?: string,
  ) {
    this.lastModel = primaryModel;
  }

  /** The model that produced the most recent response (recorded alongside stored outputs). */
  get model() {
    return this.lastModel;
  }

  /** One structured-output call: the zod schema becomes the response JSON schema, and the reply is validated against it. */
  private async generate<T>(prompt: string, schema: z.ZodType<T>): Promise<T> {
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: z.toJSONSchema(schema, { target: "draft-2020-12" }),
      },
    });

    let lastError: unknown;
    let model = this.primaryModel;
    const deadline = Date.now() + RETRY_BUDGET_MS;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const res = await fetch(`${BASE}/${model}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": this.apiKey, "Content-Type": "application/json" },
        body,
      });
      if (!res.ok) {
        const text = await res.text();
        lastError = new Error(`Gemini ${res.status}: ${text.slice(0, 500)}`);
        // A daily quota won't reset within any sensible wait, even though the error still carries a short retryDelay.
        if (!RETRYABLE.has(res.status) || /PerDay/.test(text)) throw lastError;
        if (res.status === 503 && this.fallbackModel) {
          model = model === this.primaryModel ? this.fallbackModel : this.primaryModel;
          if (model === this.fallbackModel) continue; // it has its own capacity, so try it straight away
        }
        const wait = retryDelayMs(text, attempt);
        if (Date.now() + wait > deadline) break;
        await sleep(wait);
        continue;
      }
      this.lastModel = model;

      const data = (await res.json()) as GeminiResponse;
      if (data.promptFeedback?.blockReason) throw new Error(`Gemini blocked the prompt: ${data.promptFeedback.blockReason}`);
      const cand = data.candidates?.[0];
      const text = (cand?.content?.parts ?? [])
        .filter((p) => !p.thought && p.text)
        .map((p) => p.text)
        .join("");
      try {
        return schema.parse(JSON.parse(text));
      } catch (e) {
        // Truncated or off-schema output is usually a one-off; retry rather than fail the pipeline.
        lastError = new Error(`Gemini returned invalid output (finishReason ${cand?.finishReason}): ${String(e).slice(0, 300)}`);
        await sleep(1000);
      }
    }
    throw lastError;
  }

  analyze(t: TranscriptForLlm) {
    return this.generate(analyzePrompt(t), analysisSchema);
  }

  summarize(t: TranscriptForLlm, template: TemplateId) {
    return this.generate(summarizePrompt(t, template), summarySchema);
  }

  ask(t: TranscriptForLlm, question: string) {
    return this.generate(askPrompt(t, question), answerSchema);
  }
}
