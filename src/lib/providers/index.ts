import type { AsrProvider, LlmProvider } from "./types";

export * from "./types";

// Implementations land in later slices; selection is by env so providers can be swapped without code changes.

export function getAsr(): AsrProvider {
  const name = process.env.ASR_PROVIDER ?? "assemblyai";
  switch (name) {
    default:
      throw new Error(`ASR provider "${name}" is not implemented`);
  }
}

export function getLlm(): LlmProvider {
  const name = process.env.LLM_PROVIDER ?? "gemini";
  switch (name) {
    default:
      throw new Error(`LLM provider "${name}" is not implemented`);
  }
}
