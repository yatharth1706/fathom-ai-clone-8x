import type { AsrProvider, AsrResult } from "./types";

const BASE = "https://api.assemblyai.com/v2";

type AaiWord = { text: string; start: number; end: number };
type AaiUtterance = { speaker: string; start: number; end: number; text: string; words: AaiWord[] };
type AaiTranscript = {
  id: string;
  status: "queued" | "processing" | "completed" | "error";
  error?: string;
  audio_duration?: number; // seconds
  utterances?: AaiUtterance[] | null;
};

export class AssemblyAiProvider implements AsrProvider {
  readonly name = "assemblyai";

  constructor(private apiKey: string) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { Authorization: this.apiKey, "Content-Type": "application/json", ...init?.headers },
    });
    if (!res.ok) throw new Error(`AssemblyAI ${res.status}: ${await res.text()}`);
    return res.json() as Promise<T>;
  }

  async transcribe({ audioUrl, speakersExpected, speakerRange, webhookUrl, webhookSecret }: Parameters<AsrProvider["transcribe"]>[0]) {
    const body: Record<string, unknown> = {
      audio_url: audioUrl,
      speaker_labels: true,
      language_detection: true,
    };
    if (speakersExpected) body.speakers_expected = speakersExpected;
    else if (speakerRange)
      body.speaker_options = { min_speakers_expected: speakerRange[0], max_speakers_expected: speakerRange[1] };
    if (webhookUrl) {
      body.webhook_url = webhookUrl;
      if (webhookSecret) {
        body.webhook_auth_header_name = "x-webhook-secret";
        body.webhook_auth_header_value = webhookSecret;
      }
    }
    const t = await this.request<AaiTranscript>("/transcript", { method: "POST", body: JSON.stringify(body) });
    return { jobId: t.id };
  }

  async getResult(jobId: string): Promise<AsrResult> {
    const t = await this.request<AaiTranscript>(`/transcript/${jobId}`);
    if (t.status === "error") return { status: "error", error: t.error ?? "Transcription failed" };
    if (t.status !== "completed") return { status: "processing" };
    return {
      status: "completed",
      durationMs: Math.round((t.audio_duration ?? 0) * 1000),
      utterances: (t.utterances ?? []).map((u) => ({
        speaker: u.speaker,
        startMs: u.start,
        endMs: u.end,
        text: u.text,
        words: u.words.map((w) => ({ w: w.text, s: w.start, e: w.end })),
      })),
    };
  }
}
