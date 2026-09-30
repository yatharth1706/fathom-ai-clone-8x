import type { AsrUtterance, AsrWord } from "@/lib/providers/types";

export type NormalizedSegment = {
  idx: number;
  speaker: string;
  startMs: number;
  endMs: number;
  text: string;
  words: AsrWord[];
};

export type SpeakerStats = { speaker: string; talkMs: number; segmentCount: number; firstMs: number };

// Paragraph sizing for readability and seek granularity: prefer a sentence break after SOFT_MS, force one at HARD_MS.
const SOFT_MS = 20_000;
const HARD_MS = 40_000;
const SENTENCE_END = /[.?!]["')\]]?$/;

// One color per speaker, used everywhere (avatars, names, timeline lanes). Neighbours in this order are far apart
// in hue, and every shade is dark enough for white initials and readable as text on white.
export const SPEAKER_COLORS = [
  "#2563eb", // blue
  "#ea580c", // orange
  "#16a34a", // green
  "#db2777", // pink
  "#7c3aed", // violet
  "#0891b2", // cyan
  "#dc2626", // red
  "#a16207", // ochre
  "#0d9488", // teal
  "#9333ea", // purple
  "#4d7c0f", // olive
  "#475569", // slate
];

function joinWords(words: AsrWord[]) {
  return words.map((w) => w.w).join(" ");
}

/** Splits long speaker turns into paragraphs at sentence boundaries and assigns sequential idx values. */
export function normalizeUtterances(utterances: AsrUtterance[]): NormalizedSegment[] {
  const out: NormalizedSegment[] = [];
  const push = (speaker: string, words: AsrWord[], fallbackText?: string) => {
    if (words.length === 0 && !fallbackText) return;
    out.push({
      idx: out.length,
      speaker,
      startMs: words[0]?.s ?? 0,
      endMs: words.at(-1)?.e ?? 0,
      text: fallbackText ?? joinWords(words),
      words,
    });
  };

  for (const u of utterances) {
    if (u.words.length === 0) {
      out.push({ idx: out.length, speaker: u.speaker, startMs: u.startMs, endMs: u.endMs, text: u.text, words: [] });
      continue;
    }
    let chunk: AsrWord[] = [];
    for (const w of u.words) {
      chunk.push(w);
      const dur = w.e - chunk[0].s;
      if ((dur >= SOFT_MS && SENTENCE_END.test(w.w)) || dur >= HARD_MS) {
        push(u.speaker, chunk);
        chunk = [];
      }
    }
    push(u.speaker, chunk);
  }
  return out;
}

/** Per-speaker talk time, ordered by first appearance. */
export function speakerStats(segments: NormalizedSegment[]): SpeakerStats[] {
  const map = new Map<string, SpeakerStats>();
  for (const s of segments) {
    const st = map.get(s.speaker) ?? { speaker: s.speaker, talkMs: 0, segmentCount: 0, firstMs: s.startMs };
    st.talkMs += s.endMs - s.startMs;
    st.segmentCount += 1;
    map.set(s.speaker, st);
  }
  return [...map.values()].sort((a, b) => a.firstMs - b.firstMs);
}
