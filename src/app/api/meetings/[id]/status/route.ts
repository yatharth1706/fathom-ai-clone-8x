import { and, eq, lt } from "drizzle-orm";
import { after } from "next/server";
import { db, schema } from "@/db";
import { claimTranscript, finishMeeting } from "@/lib/pipeline";
import { webhookConfig } from "@/lib/uploads";

// When this request is the one that finds the finished transcript, analysis runs in after() under this budget.
export const maxDuration = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A presigned PUT expires after 15 min; an upload still not processed well after that was abandoned. */
const ABANDONED_UPLOAD_MS = 30 * 60_000;
/** With webhooks on, poll the ASR job anyway once it's clearly overdue, in case the webhook was lost. */
const WEBHOOK_GRACE_MS = 10 * 60_000;
/** Analysis runs in after() with a 300 s cap; if that invocation was killed, stop showing "analyzing" forever. */
const STUCK_ANALYSIS_MS = 20 * 60_000;

async function read(id: string) {
  const [m] = await db()
    .select({ status: schema.meetings.status, error: schema.meetings.error, createdAt: schema.meetings.createdAt })
    .from(schema.meetings)
    .where(eq(schema.meetings.id, id));
  return m;
}

/** Polled by processing pages every few seconds. Without webhooks, it also advances the pipeline. */
export async function GET(_req: Request, ctx: RouteContext<"/api/meetings/[id]/status">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: "Meeting not found" }, { status: 404 });
  let m = await read(id);
  if (!m) return Response.json({ error: "Meeting not found" }, { status: 404 });

  const age = Date.now() - m.createdAt.getTime();
  if (m.status === "uploaded" && age > ABANDONED_UPLOAD_MS) {
    await db()
      .update(schema.meetings)
      .set({ status: "failed", error: "The upload didn't finish." })
      .where(and(eq(schema.meetings.id, id), eq(schema.meetings.status, "uploaded"), lt(schema.meetings.createdAt, new Date(Date.now() - ABANDONED_UPLOAD_MS))));
    m = (await read(id))!;
  }

  if (m.status === "analyzing" && age > STUCK_ANALYSIS_MS) {
    await db()
      .update(schema.meetings)
      .set({ status: "ready", error: "AI notes timed out. The transcript is ready; summaries can be generated from the Summary tab." })
      .where(and(eq(schema.meetings.id, id), eq(schema.meetings.status, "analyzing")));
    m = (await read(id))!;
  }

  if (m.status === "transcribing" && (!webhookConfig() || age > WEBHOOK_GRACE_MS)) {
    try {
      const asr = await claimTranscript(id);
      if (asr) after(() => finishMeeting(id, asr));
      m = (await read(id))!;
    } catch (e) {
      console.error(`status poll ${id} failed`, e); // transient ASR/network error: the next poll retries
    }
  }

  return Response.json({ status: m.status, error: m.error }, { headers: { "Cache-Control": "no-store" } });
}
