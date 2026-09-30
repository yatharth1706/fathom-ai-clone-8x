import { z } from "zod";

// ---------- ASR ----------

export type AsrWord = { w: string; s: number; e: number }; // ms

export type AsrUtterance = {
  speaker: string; // provider label, e.g. "A"
  startMs: number;
  endMs: number;
  text: string;
  words: AsrWord[];
};

export type AsrResult =
  | { status: "processing" }
  | { status: "error"; error: string }
  | { status: "completed"; durationMs: number; utterances: AsrUtterance[] };

export interface AsrProvider {
  readonly name: string;
  transcribe(input: {
    audioUrl: string;
    speakersExpected?: number;
    speakerRange?: [min: number, max: number];
    webhookUrl?: string;
    webhookSecret?: string;
  }): Promise<{ jobId: string }>;
  getResult(jobId: string): Promise<AsrResult>;
}

// ---------- LLM ----------

export const TEMPLATE_IDS = [
  "general",
  "sales",
  "customer_success",
  "demo",
  "qa",
  "retrospective",
] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

/** Transcript as the LLM sees it. `id` is the segment idx; the LLM cites these, never raw times. */
export type TranscriptForLlm = {
  title?: string;
  participants: { label: string; name: string }[];
  segments: { id: number; speaker: string; startMs: number; text: string }[];
};

const segIds = z.array(z.number().int()).describe("Segment ids that support this item");

export const analysisSchema = z.object({
  title: z.string(),
  speakerNames: z
    .array(z.object({ label: z.string(), name: z.string().nullable() }))
    .describe("Best guess of each speaker's real name from the conversation, or null"),
  chapters: z.array(z.object({ title: z.string(), summary: z.string(), startSegId: z.number().int() })),
  actionItems: z.array(
    z.object({
      text: z.string(),
      ownerLabel: z.string().nullable(),
      ownerText: z.string().nullable(),
      dueText: z.string().nullable(),
      segId: z.number().int(),
    }),
  ),
  insights: z.array(
    z.object({
      kind: z.enum(["decision", "key_point", "open_question"]),
      text: z.string(),
      segId: z.number().int(),
    }),
  ),
});
export type Analysis = z.infer<typeof analysisSchema>;

export const summarySchema = z.object({
  sections: z.array(
    z.object({
      heading: z.string(),
      bullets: z.array(z.object({ text: z.string(), segIds })),
    }),
  ),
});
export type SummaryContent = z.infer<typeof summarySchema>;

export const answerSchema = z.object({
  answer: z.string(),
  citations: segIds,
});
export type Answer = z.infer<typeof answerSchema>;

export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  analyze(t: TranscriptForLlm): Promise<Analysis>;
  summarize(t: TranscriptForLlm, template: TemplateId): Promise<SummaryContent>;
  ask(t: TranscriptForLlm, question: string): Promise<Answer>;
}
