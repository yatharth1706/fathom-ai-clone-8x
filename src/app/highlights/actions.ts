"use server";

import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const MIN_CLIP_MS = 1000;
const MAX_CLIP_MS = 10 * 60_000;

const clipInput = z.object({
  meetingId: z.uuid(),
  title: z.string().trim().min(1, "Give the clip a title").max(120, "Title is too long"),
  note: z.string().trim().max(500, "Note is too long").optional(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
});

/** Creates a clip: just bounds on the meeting's media, so nothing is transcoded. Allowed on demo meetings too. */
export async function createHighlight(input: z.input<typeof clipInput>): Promise<ActionResult<{ id: string }>> {
  const parsed = clipInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { meetingId, title, note, startMs, endMs } = parsed.data;

  const [meeting] = await db()
    .select({ durationMs: schema.meetings.durationMs, status: schema.meetings.status })
    .from(schema.meetings)
    .where(eq(schema.meetings.id, meetingId));
  if (!meeting || meeting.status !== "ready") return { ok: false, error: "Meeting not found" };
  const end = Math.min(endMs, meeting.durationMs ?? endMs);
  if (end - startMs < MIN_CLIP_MS) return { ok: false, error: "Clips must be at least a second long" };
  if (end - startMs > MAX_CLIP_MS) return { ok: false, error: "Clips can be at most 10 minutes long" };

  const [row] = await db()
    .insert(schema.highlights)
    .values({ meetingId, title, note: note || null, startMs, endMs: end })
    .returning({ id: schema.highlights.id });
  refresh();
  return { ok: true, id: row.id };
}

async function getHighlight(id: string) {
  if (!z.uuid().safeParse(id).success) return undefined;
  const [h] = await db()
    .select({ id: schema.highlights.id, isProtected: schema.highlights.isProtected })
    .from(schema.highlights)
    .where(eq(schema.highlights.id, id));
  return h;
}

export async function deleteHighlight(id: string): Promise<ActionResult> {
  const h = await getHighlight(id);
  if (!h) return { ok: false, error: "Clip not found" };
  if (h.isProtected) return { ok: false, error: "Demo clips can't be deleted. Try it on a clip you create." };
  const d = db();
  // share_links has no FK (polymorphic), so its rows go in the same transaction.
  await d.batch([
    d.delete(schema.shareLinks).where(and(eq(schema.shareLinks.resourceType, "highlight"), eq(schema.shareLinks.resourceId, id))),
    d.delete(schema.highlights).where(eq(schema.highlights.id, id)),
  ]);
  refresh();
  return { ok: true };
}

/** Returns the clip's active public link, creating one if needed. */
export async function shareHighlight(id: string): Promise<ActionResult<{ token: string }>> {
  const h = await getHighlight(id);
  if (!h) return { ok: false, error: "Clip not found" };
  const d = db();
  const [existing] = await d
    .select({ token: schema.shareLinks.token })
    .from(schema.shareLinks)
    .where(and(eq(schema.shareLinks.resourceType, "highlight"), eq(schema.shareLinks.resourceId, id), isNull(schema.shareLinks.revokedAt)));
  if (existing) return { ok: true, token: existing.token };

  const token = randomBytes(12).toString("base64url");
  await d.insert(schema.shareLinks).values({ token, resourceType: "highlight", resourceId: id });
  refresh();
  return { ok: true, token };
}

export async function revokeHighlightLink(id: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Link not found" };
  const d = db();
  const active = and(eq(schema.shareLinks.resourceType, "highlight"), eq(schema.shareLinks.resourceId, id), isNull(schema.shareLinks.revokedAt));
  const [link] = await d.select({ id: schema.shareLinks.id, isProtected: schema.shareLinks.isProtected }).from(schema.shareLinks).where(active);
  if (!link) return { ok: false, error: "Link not found" };
  if (link.isProtected) return { ok: false, error: "Demo share links can't be revoked." };
  await d.update(schema.shareLinks).set({ revokedAt: new Date() }).where(eq(schema.shareLinks.id, link.id));
  refresh();
  return { ok: true };
}
