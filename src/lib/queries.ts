import "server-only";
import { and, asc, desc, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import { connection } from "next/server";
import { cache } from "react";
import { db, schema } from "@/db";

export type MeetingListItem = Awaited<ReturnType<typeof listMeetings>>[number];

export async function listMeetings() {
  await connection();
  const d = db();
  const meetings = await d
    .select({
      id: schema.meetings.id,
      title: schema.meetings.title,
      startedAt: schema.meetings.startedAt,
      durationMs: schema.meetings.durationMs,
      posterUrl: schema.meetings.posterUrl,
      mediaKind: schema.meetings.mediaKind,
      status: schema.meetings.status,
      source: schema.meetings.source,
    })
    .from(schema.meetings)
    .orderBy(desc(schema.meetings.startedAt));

  if (meetings.length === 0) return [];

  const people = await d
    .select({
      meetingId: schema.participants.meetingId,
      displayName: schema.participants.displayName,
      color: schema.participants.color,
      talkMs: schema.participants.talkMs,
    })
    .from(schema.participants)
    .where(inArray(schema.participants.meetingId, meetings.map((m) => m.id)))
    .orderBy(desc(schema.participants.talkMs));

  return meetings.map((m) => ({ ...m, participants: people.filter((p) => p.meetingId === m.id) }));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type MeetingDetail = NonNullable<Awaited<ReturnType<typeof getMeeting>>>;
export type Participant = MeetingDetail["participants"][number];
export type Segment = MeetingDetail["segments"][number];
export type ActionItem = MeetingDetail["actionItems"][number];
export type Insight = MeetingDetail["insights"][number];
export type Chapter = MeetingDetail["chapters"][number];
export type Summary = MeetingDetail["summaries"][number];
export type QaMessage = MeetingDetail["qa"][number];
export type Highlight = MeetingDetail["highlights"][number];

/** Cached per request: generateMetadata and the page both call it. */
export const getMeeting = cache(async (id: string) => {
  await connection();
  if (!UUID.test(id)) return null;
  const d = db();
  const [meeting] = await d.select().from(schema.meetings).where(eq(schema.meetings.id, id));
  if (!meeting) return null;

  const [participants, segments, actionItems, insights, chapters, summaries, [settings], [shareLink], qa, highlights] =
    await Promise.all([
    d
      .select({
        id: schema.participants.id,
        speakerLabel: schema.participants.speakerLabel,
        displayName: schema.participants.displayName,
        color: schema.participants.color,
        talkMs: schema.participants.talkMs,
        segmentCount: schema.participants.segmentCount,
        isNameGuessed: schema.participants.isNameGuessed,
      })
      .from(schema.participants)
      .where(eq(schema.participants.meetingId, id))
      .orderBy(desc(schema.participants.talkMs)),
    d
      .select({
        idx: schema.transcriptSegments.idx,
        participantId: schema.transcriptSegments.participantId,
        startMs: schema.transcriptSegments.startMs,
        endMs: schema.transcriptSegments.endMs,
        text: schema.transcriptSegments.text,
      })
      .from(schema.transcriptSegments)
      .where(eq(schema.transcriptSegments.meetingId, id))
      .orderBy(asc(schema.transcriptSegments.idx)),
    d
      .select({
        id: schema.actionItems.id,
        text: schema.actionItems.text,
        ownerParticipantId: schema.actionItems.ownerParticipantId,
        ownerText: schema.actionItems.ownerText,
        dueText: schema.actionItems.dueText,
        startMs: schema.actionItems.startMs,
        done: schema.actionItems.done,
      })
      .from(schema.actionItems)
      .where(eq(schema.actionItems.meetingId, id))
      .orderBy(asc(schema.actionItems.startMs)),
    d
      .select({
        id: schema.insights.id,
        kind: schema.insights.kind,
        text: schema.insights.text,
        startMs: schema.insights.startMs,
      })
      .from(schema.insights)
      .where(eq(schema.insights.meetingId, id))
      .orderBy(asc(schema.insights.startMs)),
    d
      .select({
        idx: schema.chapters.idx,
        title: schema.chapters.title,
        summary: schema.chapters.summary,
        startMs: schema.chapters.startMs,
        endMs: schema.chapters.endMs,
      })
      .from(schema.chapters)
      .where(eq(schema.chapters.meetingId, id))
      .orderBy(asc(schema.chapters.idx)),
    d
      .select({
        template: schema.summaries.template,
        status: schema.summaries.status,
        content: schema.summaries.content,
        error: schema.summaries.error,
      })
      .from(schema.summaries)
      .where(eq(schema.summaries.meetingId, id)),
    d
      .select({ defaultTemplate: schema.userSettings.defaultTemplate })
      .from(schema.userSettings)
      .where(eq(schema.userSettings.userId, meeting.ownerId)),
    d
      .select({ token: schema.shareLinks.token, isProtected: schema.shareLinks.isProtected, viewCount: schema.shareLinks.viewCount })
      .from(schema.shareLinks)
      .where(
        and(
          eq(schema.shareLinks.resourceType, "meeting"),
          eq(schema.shareLinks.resourceId, id),
          isNull(schema.shareLinks.revokedAt),
        ),
      ),
    d
      .select({
        id: schema.qaMessages.id,
        question: schema.qaMessages.question,
        answer: schema.qaMessages.answer,
        citations: schema.qaMessages.citations,
        createdAt: schema.qaMessages.createdAt,
      })
      .from(schema.qaMessages)
      .where(eq(schema.qaMessages.meetingId, id))
      .orderBy(asc(schema.qaMessages.createdAt)),
    highlightsQuery().where(eq(schema.highlights.meetingId, id)).orderBy(asc(schema.highlights.startMs)),
  ]);

  return {
    meeting,
    participants,
    segments,
    actionItems,
    insights,
    chapters,
    summaries,
    defaultTemplate: settings?.defaultTemplate ?? "general",
    shareLink: shareLink ?? null,
    qa,
    highlights,
  };
});

/** The meeting behind an active public link, or null if the token is unknown or revoked. */
export const getSharedMeeting = cache(async (token: string) => {
  await connection();
  if (!/^[\w-]{8,64}$/.test(token)) return null;
  const [link] = await db()
    .select({ resourceId: schema.shareLinks.resourceId })
    .from(schema.shareLinks)
    .where(
      and(eq(schema.shareLinks.token, token), eq(schema.shareLinks.resourceType, "meeting"), isNull(schema.shareLinks.revokedAt)),
    );
  return link ? getMeeting(link.resourceId) : null;
});

export async function recordShareView(token: string) {
  await db()
    .update(schema.shareLinks)
    .set({ viewCount: sql`${schema.shareLinks.viewCount} + 1` })
    .where(eq(schema.shareLinks.token, token));
}

// ---------- highlights ----------

/** Highlights with their active share token (if any). */
function highlightsQuery() {
  return db()
    .select({
      id: schema.highlights.id,
      meetingId: schema.highlights.meetingId,
      title: schema.highlights.title,
      note: schema.highlights.note,
      startMs: schema.highlights.startMs,
      endMs: schema.highlights.endMs,
      isProtected: schema.highlights.isProtected,
      createdAt: schema.highlights.createdAt,
      shareToken: schema.shareLinks.token,
    })
    .from(schema.highlights)
    .leftJoin(
      schema.shareLinks,
      and(
        eq(schema.shareLinks.resourceType, "highlight"),
        eq(schema.shareLinks.resourceId, schema.highlights.id),
        isNull(schema.shareLinks.revokedAt),
      ),
    );
}

/** Transcript text inside [startMs, endMs), for clip previews. */
async function excerpts(ranges: { meetingId: string; startMs: number; endMs: number }[]) {
  if (ranges.length === 0) return [];
  const rows = await db()
    .select({
      meetingId: schema.transcriptSegments.meetingId,
      startMs: schema.transcriptSegments.startMs,
      endMs: schema.transcriptSegments.endMs,
      text: schema.transcriptSegments.text,
    })
    .from(schema.transcriptSegments)
    .where(inArray(schema.transcriptSegments.meetingId, [...new Set(ranges.map((r) => r.meetingId))]))
    .orderBy(asc(schema.transcriptSegments.startMs));
  return ranges.map((r) =>
    rows
      .filter((s) => s.meetingId === r.meetingId && s.endMs > r.startMs && s.startMs < r.endMs)
      .map((s) => s.text)
      .join(" "),
  );
}

export type HighlightListItem = Awaited<ReturnType<typeof listHighlights>>[number];

export async function listHighlights() {
  await connection();
  const d = db();
  const rows = await highlightsQuery().orderBy(desc(schema.highlights.createdAt));
  if (rows.length === 0) return [];
  const meetings = await d
    .select({
      id: schema.meetings.id,
      title: schema.meetings.title,
      startedAt: schema.meetings.startedAt,
      posterUrl: schema.meetings.posterUrl,
      mediaKind: schema.meetings.mediaKind,
    })
    .from(schema.meetings)
    .where(inArray(schema.meetings.id, [...new Set(rows.map((r) => r.meetingId))]));
  const byId = new Map(meetings.map((m) => [m.id, m]));
  const texts = await excerpts(rows);
  return rows.map((r, i) => ({ ...r, meeting: byId.get(r.meetingId)!, excerpt: texts[i] }));
}

/** The clip behind an active public link, with just enough of its meeting to play it. */
export const getSharedClip = cache(async (token: string) => {
  await connection();
  if (!/^[\w-]{8,64}$/.test(token)) return null;
  const d = db();
  const [link] = await d
    .select({ resourceId: schema.shareLinks.resourceId })
    .from(schema.shareLinks)
    .where(
      and(eq(schema.shareLinks.token, token), eq(schema.shareLinks.resourceType, "highlight"), isNull(schema.shareLinks.revokedAt)),
    );
  if (!link) return null;
  const [clip] = await d.select().from(schema.highlights).where(eq(schema.highlights.id, link.resourceId));
  if (!clip) return null;
  const [meeting] = await d
    .select({
      title: schema.meetings.title,
      startedAt: schema.meetings.startedAt,
      mediaUrl: schema.meetings.mediaUrl,
      posterUrl: schema.meetings.posterUrl,
      attributionText: schema.meetings.attributionText,
      attributionUrl: schema.meetings.attributionUrl,
    })
    .from(schema.meetings)
    .where(eq(schema.meetings.id, clip.meetingId));
  if (!meeting?.mediaUrl) return null;

  const [people, segments] = await Promise.all([
    d
      .select({ id: schema.participants.id, displayName: schema.participants.displayName, color: schema.participants.color })
      .from(schema.participants)
      .where(eq(schema.participants.meetingId, clip.meetingId)),
    d
      .select({
        idx: schema.transcriptSegments.idx,
        participantId: schema.transcriptSegments.participantId,
        startMs: schema.transcriptSegments.startMs,
        endMs: schema.transcriptSegments.endMs,
        text: schema.transcriptSegments.text,
      })
      .from(schema.transcriptSegments)
      .where(
        and(
          eq(schema.transcriptSegments.meetingId, clip.meetingId),
          gt(schema.transcriptSegments.endMs, clip.startMs),
          lt(schema.transcriptSegments.startMs, clip.endMs),
        ),
      )
      .orderBy(asc(schema.transcriptSegments.idx)),
  ]);
  return { clip, meeting, participants: people, segments };
});

// ---------- global search ----------

/** ts_headline markers: control characters can't appear in transcript text, so snippets are split safely (no HTML). */
export const HIT_START = "\u0001";
export const HIT_END = "\u0002";

export type SearchResult = Awaited<ReturnType<typeof searchTranscripts>>;

/**
 * Full-text search over every transcript (GIN index on the generated tsvector). Supports web-search syntax:
 * "exact phrase", OR, -exclude. Results are grouped by meeting, best meetings first.
 */
export async function searchTranscripts(q: string, limit = 200) {
  await connection();
  const query = q.trim().slice(0, 200);
  if (!query) return { total: 0, meetings: [] };
  const tsq = sql`websearch_to_tsquery('english', ${query})`;
  const s = schema.transcriptSegments;
  const rows = await db()
    .select({
      meetingId: s.meetingId,
      idx: s.idx,
      startMs: s.startMs,
      rank: sql<number>`ts_rank(${s.tsv}, ${tsq})`,
      snippet: sql<string>`ts_headline('english', ${s.text}, ${tsq}, ${`StartSel=${HIT_START}, StopSel=${HIT_END}, MaxWords=35, MinWords=15, MaxFragments=2, FragmentDelimiter=" … "`})`,
      speaker: schema.participants.displayName,
      color: schema.participants.color,
      title: schema.meetings.title,
      startedAt: schema.meetings.startedAt,
      durationMs: schema.meetings.durationMs,
    })
    .from(s)
    .innerJoin(schema.participants, eq(schema.participants.id, s.participantId))
    .innerJoin(schema.meetings, eq(schema.meetings.id, s.meetingId))
    .where(sql`${s.tsv} @@ ${tsq}`)
    .orderBy(sql`ts_rank(${s.tsv}, ${tsq}) desc`)
    .limit(limit);

  const groups = new Map<string, { id: string; title: string; startedAt: Date; durationMs: number | null; score: number; hits: typeof rows }>();
  for (const r of rows) {
    const g = groups.get(r.meetingId) ?? { id: r.meetingId, title: r.title, startedAt: r.startedAt, durationMs: r.durationMs, score: 0, hits: [] };
    g.score += r.rank;
    g.hits.push(r);
    groups.set(r.meetingId, g);
  }
  const meetings = [...groups.values()]
    .sort((a, b) => b.score - a.score)
    .map((g) => ({ ...g, hits: g.hits.sort((a, b) => a.startMs - b.startMs) }));
  return { total: rows.length, meetings };
}
