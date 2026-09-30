import { AssemblyAiProvider } from "./assemblyai";
import { GeminiProvider } from "./gemini";
import type { AsrProvider, LlmProvider } from "./types";

export * from "./types";

// Selection is by env so providers can be swapped without code changes.

export function getAsr(): AsrProvider {
  const name = process.env.ASR_PROVIDER ?? "assemblyai";
  switch (name) {
    case "assemblyai": {
      const key = process.env.ASSEMBLYAI_API_KEY;
      if (!key) throw new Error("ASSEMBLYAI_API_KEY is not set");
      return new AssemblyAiProvider(key);
    }
    default:
      throw new Error(`ASR provider "${name}" is not implemented`);
  }
}

export function getLlm(): LlmProvider {
  const name = process.env.LLM_PROVIDER ?? "gemini";
  switch (name) {
    case "gemini": {
      const key = process.env.GEMINI_API_KEY;
      if (!key) throw new Error("GEMINI_API_KEY is not set");
      return new GeminiProvider(
        key,
        process.env.GEMINI_MODEL ?? "gemini-flash-latest",
        process.env.GEMINI_FALLBACK_MODEL || undefined, // opt-in: many listed models 404 for free-tier keys
      );
    }
    default:
      throw new Error(`LLM provider "${name}" is not implemented`);
  }
}
