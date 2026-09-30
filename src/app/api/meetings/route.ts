import { desc } from "drizzle-orm";
import { db, schema } from "@/db";

/** Lightweight meeting index for the sidebar and the ⌘K command bar. */
export async function GET() {
  const meetings = await db()
    .select({
      id: schema.meetings.id,
      title: schema.meetings.title,
      startedAt: schema.meetings.startedAt,
      status: schema.meetings.status,
    })
    .from(schema.meetings)
    .orderBy(desc(schema.meetings.createdAt))
    .limit(100);
  return Response.json({ meetings }, { headers: { "Cache-Control": "no-store" } });
}
