import type { Analysis, SummaryContent, TemplateId, TranscriptForLlm } from "@/lib/providers/types";

// The LLM cites segment ids, never times. Everything here validates those ids and maps them to start_ms.

/** Shapes of seed/fixtures/<slug>/analysis.json and summaries.json (raw LLM output, cleaned at load time). */
export type AnalysisFixture = { provider: string; model: string; analysis: Analysis };
export type SummariesFixture = { provider: string; model: string; summaries: Partial<Record<TemplateId, SummaryContent>> };

type Seg = { idx: number; speaker: string; startMs: number; text: string };

export function toTranscriptForLlm(
  segments: Seg[],
  participants: { label: string; name: string }[],
  title?: string,
): TranscriptForLlm {
  return {
    title,
    participants,
    segments: segments.map((s) => ({ id: s.idx, speaker: s.speaker, startMs: s.startMs, text: s.text })),
  };
}

/** Maps cited ids to segment start times, dropping ids the model made up. */
export function segmentIndex(segments: { idx: number; startMs: number }[]) {
  const starts = new Map(segments.map((s) => [s.idx, s.startMs]));
  return {
    has: (id: number) => starts.has(id),
    startMs: (id: number) => starts.get(id) ?? null,
  };
}
export type SegmentIndex = ReturnType<typeof segmentIndex>;

export function cleanSummary(content: SummaryContent, segs: SegmentIndex): SummaryContent {
  return {
    sections: content.sections.map((sec) => ({
      heading: sec.heading,
      bullets: sec.bullets.map((b) => ({ text: b.text, segIds: [...new Set(b.segIds.filter(segs.has))].sort((a, b) => a - b) })),
    })),
  };
}

/** Rows for the chapters / action_items / insights tables (minus meetingId), plus usable speaker-name guesses. */
export function resolveAnalysis(
  a: Analysis,
  segs: SegmentIndex,
  durationMs: number,
  participantIdByLabel: Map<string, string>,
) {
  // Chapters: valid, distinct starts in order; each ends where the next begins.
  const starts = [...new Map(a.chapters.filter((c) => segs.has(c.startSegId)).map((c) => [c.startSegId, c])).values()].sort(
    (x, y) => x.startSegId - y.startSegId,
  );
  const chapters = starts.map((c, i) => ({
    idx: i,
    title: c.title,
    summary: c.summary,
    startMs: i === 0 ? 0 : segs.startMs(c.startSegId)!,
    endMs: i + 1 < starts.length ? segs.startMs(starts[i + 1].startSegId)! : durationMs,
  }));

  const actionItems = a.actionItems.map((it) => ({
    text: it.text,
    ownerParticipantId: (it.ownerLabel && participantIdByLabel.get(it.ownerLabel)) || null,
    ownerText: it.ownerText,
    dueText: it.dueText,
    segIdx: segs.has(it.segId) ? it.segId : null,
    startMs: segs.startMs(it.segId),
    source: "ai" as const,
  }));

  const insights = a.insights.map((it) => ({
    kind: it.kind,
    text: it.text,
    segIdx: segs.has(it.segId) ? it.segId : null,
    startMs: segs.startMs(it.segId),
  }));

  const speakerNames = new Map(
    a.speakerNames
      .filter((s): s is { label: string; name: string } => !!s.name?.trim() && participantIdByLabel.has(s.label))
      .map((s) => [s.label, s.name.trim()]),
  );

  return { chapters, actionItems, insights, speakerNames };
}
