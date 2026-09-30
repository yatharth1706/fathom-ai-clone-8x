import { generateSummary } from "@/lib/pipeline";
import { TEMPLATE_IDS, type TemplateId } from "@/lib/providers";

// A long transcript plus free-tier retries can take a couple of minutes.
export const maxDuration = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(_req: Request, ctx: RouteContext<"/api/meetings/[id]/summaries/[template]">) {
  const { id, template } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: "Meeting not found" }, { status: 404 });
  if (!TEMPLATE_IDS.includes(template as TemplateId)) return Response.json({ error: "Unknown template" }, { status: 400 });

  try {
    const summary = await generateSummary(id, template as TemplateId);
    if (!summary) return Response.json({ error: "Meeting not found" }, { status: 404 });
    return Response.json({ summary });
  } catch (e) {
    console.error(`summary ${id}/${template} failed`, e);
    return Response.json({ error: "The AI provider is busy or out of quota. Please try again later." }, { status: 502 });
  }
}
