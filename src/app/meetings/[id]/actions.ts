"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";

export type ActionResult = { ok: true } | { ok: false; error: string };

const uuid = z.uuid();
const name = z.string().trim().min(1, "Name can't be empty").max(60, "Name is too long");

async function getMeeting(meetingId: string) {
  const [m] = await db()
    .select({ id: schema.meetings.id, isProtected: schema.meetings.isProtected })
    .from(schema.meetings)
    .where(eq(schema.meetings.id, meetingId));
  return m;
}

/** Renames a speaker. Allowed on protected (seed) meetings: it's non-destructive and a reseed restores it. */
export async function renameSpeaker(meetingId: string, participantId: string, rawName: string): Promise<ActionResult> {
  const parsed = z.object({ meetingId: uuid, participantId: uuid, name }).safeParse({ meetingId, participantId, name: rawName });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const updated = await db()
    .update(schema.participants)
    .set({ displayName: parsed.data.name, isNameGuessed: false })
    .where(and(eq(schema.participants.id, participantId), eq(schema.participants.meetingId, meetingId)))
    .returning({ id: schema.participants.id });
  if (updated.length === 0) return { ok: false, error: "Speaker not found" };

  refresh();
  return { ok: true };
}

/**
 * Folds one diarized speaker into another: segments and action-item ownership move over, talk time is summed,
 * and the merged speaker is removed. Blocked on protected meetings because it can't be undone without a reseed.
 */
export async function mergeSpeakers(meetingId: string, fromId: string, intoId: string): Promise<ActionResult> {
  const parsed = z.object({ meetingId: uuid, fromId: uuid, intoId: uuid }).safeParse({ meetingId, fromId, intoId });
  if (!parsed.success || fromId === intoId) return { ok: false, error: "Invalid merge" };

  const meeting = await getMeeting(meetingId);
  if (!meeting) return { ok: false, error: "Meeting not found" };
  if (meeting.isProtected) return { ok: false, error: "Demo meetings can't be merged. Try it on a meeting you upload." };

  const d = db();
  const people = await d
    .select({ id: schema.participants.id, talkMs: schema.participants.talkMs, segmentCount: schema.participants.segmentCount })
    .from(schema.participants)
    .where(eq(schema.participants.meetingId, meetingId));
  const from = people.find((p) => p.id === fromId);
  const into = people.find((p) => p.id === intoId);
  if (!from || !into) return { ok: false, error: "Speaker not found" };

  // neon-http batches run as one transaction, so a failed step leaves nothing half-merged.
  await d.batch([
    d
      .update(schema.transcriptSegments)
      .set({ participantId: intoId })
      .where(and(eq(schema.transcriptSegments.meetingId, meetingId), eq(schema.transcriptSegments.participantId, fromId))),
    d
      .update(schema.actionItems)
      .set({ ownerParticipantId: intoId })
      .where(and(eq(schema.actionItems.meetingId, meetingId), eq(schema.actionItems.ownerParticipantId, fromId))),
    d
      .update(schema.participants)
      .set({ talkMs: into.talkMs + from.talkMs, segmentCount: into.segmentCount + from.segmentCount })
      .where(eq(schema.participants.id, intoId)),
    d.delete(schema.participants).where(eq(schema.participants.id, fromId)),
  ]);

  refresh();
  return { ok: true };
}
