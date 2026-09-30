"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { TEMPLATE_IDS } from "@/lib/providers/types";
import { demoUserId } from "@/lib/uploads";

export type ActionResult = { ok: true } | { ok: false; error: string };

const settingsInput = z.object({
  defaultTemplate: z.enum(TEMPLATE_IDS),
  autoActionItems: z.boolean(),
  autoShare: z.boolean(),
  botName: z.string().trim().min(1, "Give the notetaker a name").max(40, "Name is too long"),
});

/** Settings belong to the single demo user (no auth), so they apply to everyone using this deployment. */
export async function updateSettings(input: z.input<typeof settingsInput>): Promise<ActionResult> {
  const parsed = settingsInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const userId = await demoUserId();
  if (!userId) return { ok: false, error: "The app hasn't been seeded yet" };
  await db()
    .insert(schema.userSettings)
    .values({ userId, ...parsed.data })
    .onConflictDoUpdate({ target: schema.userSettings.userId, set: parsed.data });
  refresh();
  return { ok: true };
}
