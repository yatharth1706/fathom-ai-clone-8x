import "server-only";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { cleanSummary, segmentIndex, toTranscriptForLlm } from "@/lib/analysis";
import { getLlm, type TemplateId } from "@/lib/providers";
import { summaryToMarkdown } from "@/lib/summary-format";

/** Loads a meeting's transcript in the shape the LLM sees, using current speaker names. */
async function loadTranscript(meetingId: string) {
  const d = db();
  const [meeting] = await d
    .select({ title: schema.meetings.title })
    .from(schema.meetings)
    .where(eq(schema.meetings.id, meetingId));
  if (!meeting) return null;

  const [people, rows] = await Promise.all([
    d
      .select({ id: schema.participants.id, label: schema.participants.speakerLabel, name: schema.participants.displayName })
      .from(schema.participants)
      .where(eq(schema.participants.meetingId, meetingId)),
    d
      .select({
        idx: schema.transcriptSegments.idx,
        participantId: schema.transcriptSegments.participantId,
        startMs: schema.transcriptSegments.startMs,
        text: schema.transcriptSegments.text,
      })
      .from(schema.transcriptSegments)
      .where(eq(schema.transcriptSegments.meetingId, meetingId))
      .orderBy(asc(schema.transcriptSegments.idx)),
  ]);
  const labelById = new Map(people.map((p) => [p.id, p.label]));
  const segments = rows.map((r) => ({ ...r, speaker: labelById.get(r.participantId) ?? "?" }));
  return {
    title: meeting.title,
    segments,
    transcript: toTranscriptForLlm(segments, people.map(({ label, name }) => ({ label, name })), meeting.title),
  };
}

/** Generates (or regenerates) one template's summary and upserts it. Throws on LLM failure after recording it. */
export async function generateSummary(meetingId: string, template: TemplateId) {
  const loaded = await loadTranscript(meetingId);
  if (!loaded) return null;
  const d = db();
  const llm = getLlm();
  const key = [schema.summaries.meetingId, schema.summaries.template];

  try {
    const segs = segmentIndex(loaded.segments);
    const content = cleanSummary(await llm.summarize(loaded.transcript, template), segs);
    const row = {
      status: "ready" as const,
      content,
      markdown: summaryToMarkdown(content, { title: loaded.title, startMs: segs.startMs }),
      model: llm.model,
      error: null,
    };
    await d
      .insert(schema.summaries)
      .values({ meetingId, template, ...row })
      .onConflictDoUpdate({ target: key, set: row });
    return row;
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await d
      .insert(schema.summaries)
      .values({ meetingId, template, status: "failed", error })
      .onConflictDoUpdate({ target: key, set: { status: "failed", error } });
    throw e;
  }
}
