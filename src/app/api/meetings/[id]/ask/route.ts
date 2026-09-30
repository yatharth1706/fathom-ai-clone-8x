import { z } from "zod";
import { askMeeting } from "@/lib/pipeline";
import { claimDailyQuota, clientIpHash } from "@/lib/uploads";

export const maxDuration = 120;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const body = z.object({ question: z.string().trim().min(3, "Ask a longer question").max(500, "Keep questions under 500 characters") });

function dailyAskLimit() {
  const n = Number(process.env.ASK_DAILY_LIMIT);
  return Number.isInteger(n) && n > 0 ? n : 30;
}

export async function POST(req: Request, ctx: RouteContext<"/api/meetings/[id]/ask">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: "Meeting not found" }, { status: 404 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid question" }, { status: 400 });

  if (!(await claimDailyQuota(`ask:${clientIpHash(req.headers)}`, dailyAskLimit())))
    return Response.json({ error: "You've asked the daily maximum of questions. Try again tomorrow." }, { status: 429 });

  try {
    const message = await askMeeting(id, parsed.data.question);
    if (!message) return Response.json({ error: "Meeting not found" }, { status: 404 });
    return Response.json({ message });
  } catch (e) {
    console.error(`ask ${id} failed`, e);
    return Response.json({ error: "The AI provider is busy or out of quota. Please try again later." }, { status: 502 });
  }
}
