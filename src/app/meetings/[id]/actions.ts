"use server";

import { randomBytes } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { deleteObject } from "@/lib/storage";

export type ActionResult = { ok: true } | { ok: false; error: string };

const uuid = z.uuid();
const name = z.string().trim().min(1, "Name can't be empty").max(60, "Name is too long");

const PROTECTED = "This is a demo meeting, so it can't be changed. Try it on a meeting you upload.";

async function getMeeting(meetingId: string) {
  if (!uuid.safeParse(meetingId).success) return undefined;
  const [m] = await db()
    .select({
      id: schema.meetings.id,
      isProtected: schema.meetings.isProtected,
      mediaKey: schema.meetings.mediaKey,
      source: schema.meetings.source,
    })
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
  if (meeting.isProtected) return { ok: false, error: PROTECTED };

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

// ---------- meeting ----------

export async function renameMeeting(meetingId: string, rawTitle: string): Promise<ActionResult> {
  const title = z.string().trim().min(1, "Title can't be empty").max(120, "Title is too long").safeParse(rawTitle);
  if (!title.success) return { ok: false, error: title.error.issues[0].message };
  const meeting = await getMeeting(meetingId);
  if (!meeting) return { ok: false, error: "Meeting not found" };
  if (meeting.isProtected) return { ok: false, error: PROTECTED };

  await db().update(schema.meetings).set({ title: title.data }).where(eq(schema.meetings.id, meetingId));
  refresh();
  return { ok: true };
}

/** Deletes the meeting, its share links (no FK, so by hand) and its uploaded media. Redirects to the list on success. */
export async function deleteMeeting(meetingId: string): Promise<ActionResult> {
  const meeting = await getMeeting(meetingId);
  if (!meeting) return { ok: false, error: "Meeting not found" };
  if (meeting.isProtected) return { ok: false, error: PROTECTED };

  const d = db();
  const highlightIds = (
    await d.select({ id: schema.highlights.id }).from(schema.highlights).where(eq(schema.highlights.meetingId, meetingId))
  ).map((h) => h.id);
  await d.batch([
    d
      .delete(schema.shareLinks)
      .where(and(eq(schema.shareLinks.resourceType, "meeting"), eq(schema.shareLinks.resourceId, meetingId))),
    ...(highlightIds.length
      ? [
          d
            .delete(schema.shareLinks)
            .where(and(eq(schema.shareLinks.resourceType, "highlight"), inArray(schema.shareLinks.resourceId, highlightIds))),
        ]
      : []),
    d.delete(schema.meetings).where(eq(schema.meetings.id, meetingId)), // cascades to everything else
  ]);
  // Seed media is shared across reseeds, so only uploads own their object.
  if (meeting.source === "upload" && meeting.mediaKey) await deleteObject(meeting.mediaKey).catch(() => {});

  redirect("/meetings");
}

// ---------- share links ----------

/** Returns the meeting's active public link, creating one if needed. */
export async function createShareLink(meetingId: string): Promise<ActionResult & { token?: string }> {
  const meeting = await getMeeting(meetingId);
  if (!meeting) return { ok: false, error: "Meeting not found" };

  const d = db();
  const active = and(
    eq(schema.shareLinks.resourceType, "meeting"),
    eq(schema.shareLinks.resourceId, meetingId),
    isNull(schema.shareLinks.revokedAt),
  );
  const [existing] = await d.select({ token: schema.shareLinks.token }).from(schema.shareLinks).where(active);
  if (existing) return { ok: true, token: existing.token };

  // 96 random bits: unguessable, and short enough to paste.
  const token = randomBytes(12).toString("base64url");
  await d.insert(schema.shareLinks).values({ token, resourceType: "meeting", resourceId: meetingId });
  refresh();
  return { ok: true, token };
}

export async function revokeShareLink(meetingId: string, token: string): Promise<ActionResult> {
  if (!uuid.safeParse(meetingId).success) return { ok: false, error: "Link not found" };
  const d = db();
  const [link] = await d
    .select({ id: schema.shareLinks.id, isProtected: schema.shareLinks.isProtected })
    .from(schema.shareLinks)
    .where(
      and(
        eq(schema.shareLinks.token, token),
        eq(schema.shareLinks.resourceType, "meeting"),
        eq(schema.shareLinks.resourceId, meetingId),
        isNull(schema.shareLinks.revokedAt),
      ),
    );
  if (!link) return { ok: false, error: "Link not found" };
  if (link.isProtected) return { ok: false, error: "Demo share links can't be revoked." };

  await d.update(schema.shareLinks).set({ revokedAt: new Date() }).where(eq(schema.shareLinks.id, link.id));
  refresh();
  return { ok: true };
}

// ---------- action items ----------
// Check-off and edits are allowed on demo meetings (non-destructive; a reseed restores them). Deleting isn't.

const itemFields = z.object({
  text: z.string().trim().min(1, "Action item can't be empty").max(300, "Action item is too long"),
  ownerParticipantId: uuid.nullable(),
  /** Free-text owner (e.g. the AI heard a name that isn't a speaker); ignored when ownerParticipantId is set. */
  ownerText: z.string().trim().max(60).nullable().optional(),
  dueText: z.string().trim().max(60, "Due date is too long").nullable(),
});

async function ownerBelongs(meetingId: string, participantId: string | null) {
  if (!participantId) return true;
  const [p] = await db()
    .select({ id: schema.participants.id })
    .from(schema.participants)
    .where(and(eq(schema.participants.id, participantId), eq(schema.participants.meetingId, meetingId)));
  return !!p;
}

export async function setActionItemDone(meetingId: string, itemId: string, done: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(meetingId).success || !uuid.safeParse(itemId).success) return { ok: false, error: "Action item not found" };
  const updated = await db()
    .update(schema.actionItems)
    .set({ done: done === true })
    .where(and(eq(schema.actionItems.id, itemId), eq(schema.actionItems.meetingId, meetingId)))
    .returning({ id: schema.actionItems.id });
  if (updated.length === 0) return { ok: false, error: "Action item not found" };
  refresh();
  return { ok: true };
}

export async function updateActionItem(
  meetingId: string,
  itemId: string,
  fields: z.input<typeof itemFields>,
): Promise<ActionResult> {
  const parsed = itemFields.safeParse(fields);
  if (!parsed.success || !uuid.safeParse(itemId).success)
    return { ok: false, error: parsed.error?.issues[0].message ?? "Action item not found" };
  if (!(await ownerBelongs(meetingId, parsed.data.ownerParticipantId))) return { ok: false, error: "Unknown owner" };
  const { text, ownerParticipantId, ownerText, dueText } = parsed.data;
  const updated = await db()
    .update(schema.actionItems)
    .set({ text, ownerParticipantId, ownerText: ownerParticipantId ? null : ownerText || null, dueText: dueText || null })
    .where(and(eq(schema.actionItems.id, itemId), eq(schema.actionItems.meetingId, meetingId)))
    .returning({ id: schema.actionItems.id });
  if (updated.length === 0) return { ok: false, error: "Action item not found" };
  refresh();
  return { ok: true };
}

export async function addActionItem(meetingId: string, fields: z.input<typeof itemFields>): Promise<ActionResult> {
  const parsed = itemFields.safeParse(fields);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const meeting = await getMeeting(meetingId);
  if (!meeting) return { ok: false, error: "Meeting not found" };
  if (!(await ownerBelongs(meetingId, parsed.data.ownerParticipantId))) return { ok: false, error: "Unknown owner" };
  await db()
    .insert(schema.actionItems)
    .values({
      meetingId,
      text: parsed.data.text,
      ownerParticipantId: parsed.data.ownerParticipantId,
      dueText: parsed.data.dueText || null,
      source: "manual",
    });
  refresh();
  return { ok: true };
}

export async function deleteActionItem(meetingId: string, itemId: string): Promise<ActionResult> {
  const meeting = await getMeeting(meetingId);
  if (!meeting || !uuid.safeParse(itemId).success) return { ok: false, error: "Action item not found" };
  if (meeting.isProtected) return { ok: false, error: PROTECTED };
  const deleted = await db()
    .delete(schema.actionItems)
    .where(and(eq(schema.actionItems.id, itemId), eq(schema.actionItems.meetingId, meetingId)))
    .returning({ id: schema.actionItems.id });
  if (deleted.length === 0) return { ok: false, error: "Action item not found" };
  refresh();
  return { ok: true };
}
