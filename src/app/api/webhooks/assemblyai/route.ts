import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { after } from "next/server";
import { db, schema } from "@/db";
import { claimTranscript, finishMeeting } from "@/lib/pipeline";

// Analysis runs in after() once the transcript is claimed.
export const maxDuration = 300;

function secretMatches(given: string | null) {
  const expected = process.env.ASSEMBLYAI_WEBHOOK_SECRET;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * AssemblyAI calls this when a transcript completes or fails. The payload is only a hint: the result is re-fetched
 * from the API, and the same claim as the status poller makes sure it's processed once.
 */
export async function POST(req: Request) {
  if (!secretMatches(req.headers.get("x-webhook-secret"))) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const payload = (await req.json().catch(() => null)) as { transcript_id?: unknown } | null;
  const jobId = typeof payload?.transcript_id === "string" ? payload.transcript_id : null;
  if (!jobId) return Response.json({ error: "Missing transcript_id" }, { status: 400 });

  const [m] = await db().select({ id: schema.meetings.id }).from(schema.meetings).where(eq(schema.meetings.asrJobId, jobId));
  if (!m) return Response.json({ ok: true, ignored: true }); // e.g. a fixture-building job, or a deleted meeting

  const asr = await claimTranscript(m.id);
  if (asr) after(() => finishMeeting(m.id, asr));
  return Response.json({ ok: true });
}
