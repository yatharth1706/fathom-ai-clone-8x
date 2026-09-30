import "./env";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { db, schema } from "@/db";
import { cleanSummary, resolveAnalysis, segmentIndex, type AnalysisFixture, type SummariesFixture } from "@/lib/analysis";
import type { AsrResult, TemplateId } from "@/lib/providers/types";
import { publicUrl } from "@/lib/storage";
import { summaryToMarkdown } from "@/lib/summary-format";
import { normalizeUtterances, SPEAKER_COLORS, speakerStats } from "@/lib/transcript";
import { SEED_SOURCES } from "../seed/sources";

// Usage: pnpm seed
// Resets the database to the demo state using only committed fixtures (no paid API calls).
// Wipes ALL meetings, including reviewer uploads, so run it deliberately (e.g. right before submission).

const FIXTURES = "seed/fixtures";

function readOptional<T>(file: string): T | null {
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : null;
}
export const DEMO_USER = { name: "Demo User", email: "demo@notetaker.local" };

/** Deterministic UUID from a string, so seeded URLs survive a reseed. */
function stableId(key: string) {
  const h = createHash("sha1").update(`fathom-clone:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Stable, URL-safe share token per seed meeting, so demo links survive a reseed. */
function stableToken(key: string) {
  return createHash("sha256").update(`fathom-clone:share:${key}`).digest("base64url").slice(0, 16);
}

function chunks<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const d = db();

  // share_links has no FK (polymorphic); everything else cascades from users.
  await d.delete(schema.shareLinks);
  await d.delete(schema.users);

  const userId = stableId("user:demo");
  await d.insert(schema.users).values({ id: userId, ...DEMO_USER });
  await d.insert(schema.userSettings).values({ userId });

  for (const s of SEED_SOURCES) {
    const file = path.join(FIXTURES, s.slug, "asr.json");
    if (!existsSync(file)) {
      console.warn(`[${s.slug}] no fixture, skipping`);
      continue;
    }
    const asr = JSON.parse(readFileSync(file, "utf8")) as Extract<AsrResult, { status: "completed" }>;
    const segments = normalizeUtterances(asr.utterances);
    const stats = speakerStats(segments);
    const segs = segmentIndex(segments);
    const analysisFx = readOptional<AnalysisFixture>(path.join(FIXTURES, s.slug, "analysis.json"));
    const summariesFx = readOptional<SummariesFixture>(path.join(FIXTURES, s.slug, "summaries.json"));

    const meetingId = stableId(`meeting:${s.slug}`);
    const mediaKey = `seed/${s.slug}/${s.kind === "video" ? "media.mp4" : "media.m4a"}`;
    await d.insert(schema.meetings).values({
      id: meetingId,
      ownerId: userId,
      title: s.title,
      startedAt: new Date(s.startedAt),
      durationMs: asr.durationMs,
      mediaKey,
      mediaUrl: publicUrl(mediaKey),
      mediaKind: s.kind,
      posterUrl: s.kind === "video" ? publicUrl(`seed/${s.slug}/poster.jpg`) : null,
      status: "ready",
      source: "seed",
      isProtected: true,
      attributionText: s.attribution,
      attributionUrl: s.sourceUrl,
    });

    const participantIds = new Map(stats.map((st) => [st.speaker, stableId(`participant:${s.slug}:${st.speaker}`)]));
    const resolved = analysisFx && resolveAnalysis(analysisFx.analysis, segs, asr.durationMs, participantIds);
    await d.insert(schema.participants).values(
      stats.map((st, i) => {
        const guess = resolved?.speakerNames.get(st.speaker);
        return {
          id: participantIds.get(st.speaker)!,
          meetingId,
          speakerLabel: st.speaker,
          displayName: guess ?? `Speaker ${st.speaker}`,
          isNameGuessed: !!guess,
          color: SPEAKER_COLORS[i % SPEAKER_COLORS.length],
          talkMs: st.talkMs,
          segmentCount: st.segmentCount,
        };
      }),
    );

    for (const batch of chunks(segments, 200)) {
      await d.insert(schema.transcriptSegments).values(
        batch.map((seg) => ({
          meetingId,
          participantId: participantIds.get(seg.speaker)!,
          idx: seg.idx,
          startMs: seg.startMs,
          endMs: seg.endMs,
          text: seg.text,
          words: seg.words,
        })),
      );
    }

    if (resolved) {
      if (resolved.chapters.length) await d.insert(schema.chapters).values(resolved.chapters.map((c) => ({ meetingId, ...c })));
      if (resolved.actionItems.length)
        await d.insert(schema.actionItems).values(resolved.actionItems.map((a) => ({ meetingId, ...a })));
      if (resolved.insights.length) await d.insert(schema.insights).values(resolved.insights.map((x) => ({ meetingId, ...x })));
    }

    // A protected demo clip per meeting: the first decision (else key point), extended to whole lines (~40 s).
    const pick = resolved && (resolved.insights.find((x) => x.kind === "decision" && x.startMs != null) ?? resolved.insights.find((x) => x.startMs != null));
    let clipToken: string | null = null;
    if (pick?.startMs != null) {
      const start = pick.startMs;
      const lines = segments.filter((seg) => seg.startMs >= start && seg.startMs < start + 40_000);
      const end = Math.min(Math.max(...lines.map((seg) => seg.endMs), start + 15_000), start + 90_000, asr.durationMs);
      const words = pick.text.split(" ");
      const highlightId = stableId(`highlight:${s.slug}`);
      await d.insert(schema.highlights).values({
        id: highlightId,
        meetingId,
        title: words.length > 12 ? `${words.slice(0, 12).join(" ")}…` : pick.text,
        startMs: start,
        endMs: end,
        isProtected: true,
      });
      clipToken = stableToken(`clip:${s.slug}`);
      await d.insert(schema.shareLinks).values({ token: clipToken, resourceType: "highlight", resourceId: highlightId, isProtected: true });
    }

    const summaries = Object.entries(summariesFx?.summaries ?? {}).map(([template, raw]) => {
      const content = cleanSummary(raw, segs);
      return {
        meetingId,
        template: template as TemplateId,
        status: "ready" as const,
        content,
        markdown: summaryToMarkdown(content, { title: s.title, startMs: segs.startMs }),
        model: summariesFx!.model,
      };
    });
    if (summaries.length) await d.insert(schema.summaries).values(summaries);

    // A protected public link per demo meeting, so reviewers can open a share page without creating one.
    const shareToken = stableToken(s.slug);
    await d.insert(schema.shareLinks).values({ token: shareToken, resourceType: "meeting", resourceId: meetingId, isProtected: true });

    console.log(
      `[${s.slug}] ${segments.length} segments, ${stats.length} speakers (${resolved?.speakerNames.size ?? 0} named), ` +
        `${resolved?.chapters.length ?? 0} chapters, ${resolved?.actionItems.length ?? 0} action items, ` +
        `${resolved?.insights.length ?? 0} insights, ${summaries.length} summaries, share /share/m/${shareToken}` +
        (clipToken ? `, clip /share/clip/${clipToken}` : ""),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
