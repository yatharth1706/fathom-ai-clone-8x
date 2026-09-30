import { TEMPLATE_BY_ID } from "@/lib/templates";
import type { TemplateId, TranscriptForLlm } from "./types";

// Provider-agnostic prompts, so every LlmProvider sends the same instructions and differs only in transport.

function clock(ms: number) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  return `${h > 0 ? `${h}:` : ""}${m}:${String(s % 60).padStart(2, "0")}`;
}

/** One line per segment: `[id] (mm:ss) Name: text`. The id is what the model cites. */
export function renderTranscript(t: TranscriptForLlm) {
  const names = new Map(t.participants.map((p) => [p.label, p.name]));
  const people = t.participants.map((p) => `- ${p.label}: ${p.name}`).join("\n");
  const lines = t.segments.map((s) => `[${s.id}] (${clock(s.startMs)}) ${names.get(s.speaker) ?? s.speaker}: ${s.text}`);
  return `${t.title ? `Meeting: ${t.title}\n` : ""}Participants (label: name):\n${people}\n\nTranscript:\n${lines.join("\n")}`;
}

const CITATION_RULES = `Citations: every item must cite the bracketed segment id(s) where it is said or decided, e.g. [42]. Only cite ids that appear in the transcript. Prefer the segment where the point is first clearly stated.`;

export const SYSTEM_PROMPT = `You are a meeting notetaker. You read diarized, machine-generated transcripts (which contain recognition errors) and produce accurate, concise notes. Never invent facts, names, numbers or commitments that are not supported by the transcript. Write in the same language as the meeting. Refer to people by name when known, otherwise by their speaker label name as given.`;

export function analyzePrompt(t: TranscriptForLlm) {
  return `${renderTranscript(t)}

Analyze this meeting and return JSON.

- title: a specific, descriptive meeting title (max ~8 words), not generic like "Team meeting".
- speakerNames: for EVERY participant label, the person's real name if the transcript makes it reasonably clear (they introduce themselves, are addressed by name right before speaking, or are introduced by someone), else null. Do not guess from topic alone.
- chapters: 3-12 chapters covering the whole meeting in order, each with a short title, a one-sentence summary, and startSegId (the first segment of the chapter). The first chapter starts at the first segment.
- actionItems: concrete follow-up tasks someone committed to or was asked to do. text starts with a verb. ownerLabel is the participant label of the owner if one is clear, else null; ownerText is the owner's name as said (or null); dueText is the deadline as said (e.g. "by Friday"), else null. segId is where it was agreed. Return an empty list if there are none — do not pad.
- insights: decisions made (kind "decision"), the most important points raised (kind "key_point", at most 8), and questions left unresolved (kind "open_question"). segId is where it happens.

${CITATION_RULES}`;
}

export function summarizePrompt(t: TranscriptForLlm, template: TemplateId) {
  const tpl = TEMPLATE_BY_ID[template];
  return `${renderTranscript(t)}

Write a "${tpl.name}" summary of this meeting and return JSON with exactly these sections, in this order, using these headings verbatim:
${tpl.sections.map((s) => `- ${s}`).join("\n")}

${tpl.guidance}

Each bullet is one or two plain sentences (no markdown), specific rather than generic, with its supporting segIds. Aim for 2-6 bullets per section; long meetings may need more in the topic sections.

${CITATION_RULES}`;
}

export function askPrompt(t: TranscriptForLlm, question: string) {
  return `${renderTranscript(t)}

Answer this question about the meeting using only the transcript. If the transcript does not answer it, say so plainly. Keep the answer short (1-4 sentences), plain text.

Question: ${question}

${CITATION_RULES}`;
}
