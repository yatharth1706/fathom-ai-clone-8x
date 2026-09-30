import { startTranscription } from "@/lib/pipeline";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Step 2 of an upload, called by the browser once its PUT to storage has finished. */
export async function POST(_req: Request, ctx: RouteContext<"/api/meetings/[id]/process">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: "Meeting not found" }, { status: 404 });
  const started = await startTranscription(id);
  if (!started) return Response.json({ error: "This meeting isn't waiting for an upload" }, { status: 409 });
  return Response.json({ ok: true });
}
