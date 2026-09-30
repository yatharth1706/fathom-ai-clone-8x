import "server-only";
import { asc, desc, eq, inArray } from "drizzle-orm";
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

/** Cached per request: generateMetadata and the page both call it. */
export const getMeeting = cache(async (id: string) => {
  await connection();
  if (!UUID.test(id)) return null;
  const d = db();
  const [meeting] = await d.select().from(schema.meetings).where(eq(schema.meetings.id, id));
  if (!meeting) return null;

  const [participants, segments] = await Promise.all([
    d
      .select({
        id: schema.participants.id,
        speakerLabel: schema.participants.speakerLabel,
        displayName: schema.participants.displayName,
        color: schema.participants.color,
        talkMs: schema.participants.talkMs,
        segmentCount: schema.participants.segmentCount,
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
  ]);

  return { meeting, participants, segments };
});
