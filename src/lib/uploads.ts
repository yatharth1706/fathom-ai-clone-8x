import "server-only";
import { createHash } from "node:crypto";
import { and, asc, eq, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";

const DEFAULT_DAILY_LIMIT = 3;

export function dailyUploadLimit() {
  const n = Number(process.env.UPLOAD_DAILY_LIMIT);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_DAILY_LIMIT;
}

/** Salted hash of the caller's IP; the raw address is never stored. */
export function clientIpHash(headers: Headers) {
  const ip = headers.get("x-forwarded-for")?.split(",")[0].trim() || headers.get("x-real-ip") || "unknown";
  const salt = process.env.IP_HASH_SALT ?? "dev-salt";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

/** Atomically takes one upload from today's (UTC) allowance. Returns false when it's used up. */
export function claimUploadQuota(ipHash: string) {
  return claimDailyQuota(ipHash, dailyUploadLimit());
}

/**
 * Per-key daily counter in `upload_quota`. Other paid features share the table with a prefixed key
 * (e.g. `ask:<ipHash>`), so each has its own allowance.
 */
export async function claimDailyQuota(ipHash: string, limit: number) {
  const day = new Date().toISOString().slice(0, 10);
  const rows = await db()
    .insert(schema.uploadQuota)
    .values({ ipHash, day, count: 1 })
    .onConflictDoUpdate({
      target: [schema.uploadQuota.ipHash, schema.uploadQuota.day],
      set: { count: sql`${schema.uploadQuota.count} + 1` },
      setWhere: lt(schema.uploadQuota.count, limit),
    })
    .returning({ count: schema.uploadQuota.count });
  return rows.length > 0;
}

/** Hands a quota slot back when the upload never got going (e.g. presigning failed). */
export async function releaseUploadQuota(ipHash: string) {
  const day = new Date().toISOString().slice(0, 10);
  await db()
    .update(schema.uploadQuota)
    .set({ count: sql`greatest(${schema.uploadQuota.count} - 1, 0)` })
    .where(and(eq(schema.uploadQuota.ipHash, ipHash), eq(schema.uploadQuota.day, day)));
}

/** There is no auth: every upload belongs to the single seeded demo user. */
export async function demoUserId() {
  const [u] = await db().select({ id: schema.users.id }).from(schema.users).orderBy(asc(schema.users.createdAt)).limit(1);
  return u?.id ?? null;
}

/** "team-sync_2024-05-01.final.mp4" → "team sync 2024-05-01.final" */
export function titleFromFilename(filename: string) {
  const base = filename.replace(/\.[^./\\]+$/, "").replace(/[_]+/g, " ").trim();
  return (base || "Uploaded recording").slice(0, 120);
}

export function extensionFor(filename: string, contentType: string) {
  const ext = /\.([a-z0-9]{1,5})$/i.exec(filename)?.[1]?.toLowerCase();
  return ext ?? contentType.split("/")[1].replace(/[^a-z0-9]/g, "").slice(0, 5);
}

/**
 * ASR webhooks need a public URL and a shared secret. Without them (e.g. local dev on localhost) no webhook is
 * registered and the status endpoint polls the ASR job instead.
 */
export function webhookConfig() {
  const base = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "");
  const secret = process.env.ASSEMBLYAI_WEBHOOK_SECRET;
  if (!base || !secret) return null;
  try {
    const host = new URL(base).hostname;
    if (host === "localhost" || host === "127.0.0.1") return null;
  } catch {
    return null;
  }
  return { url: `${base}/api/webhooks/assemblyai`, secret };
}
