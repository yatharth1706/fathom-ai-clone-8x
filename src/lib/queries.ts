import "server-only";
import { desc, inArray } from "drizzle-orm";
import { connection } from "next/server";
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
