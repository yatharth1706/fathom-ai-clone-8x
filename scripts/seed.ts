import "./env";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { db, schema } from "@/db";
import type { AsrResult } from "@/lib/providers/types";
import { publicUrl } from "@/lib/storage";
import { normalizeUtterances, SPEAKER_COLORS, speakerStats } from "@/lib/transcript";
import { SEED_SOURCES } from "../seed/sources";

// Usage: pnpm seed
// Resets the database to the demo state using only committed fixtures (no paid API calls).
// Wipes ALL meetings, including reviewer uploads, so run it deliberately (e.g. right before submission).

const FIXTURES = "seed/fixtures";
export const DEMO_USER = { name: "Demo User", email: "demo@notetaker.local" };

/** Deterministic UUID from a string, so seeded URLs survive a reseed. */
function stableId(key: string) {
  const h = createHash("sha1").update(`fathom-clone:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
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

    const participantIds = new Map<string, string>();
    await d.insert(schema.participants).values(
      stats.map((st, i) => {
        const id = stableId(`participant:${s.slug}:${st.speaker}`);
        participantIds.set(st.speaker, id);
        return {
          id,
          meetingId,
          speakerLabel: st.speaker,
          displayName: `Speaker ${st.speaker}`,
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
    console.log(`[${s.slug}] ${segments.length} segments, ${stats.length} speakers`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
