import "./env";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getAsr } from "@/lib/providers";
import { publicUrl } from "@/lib/storage";
import { SEED_SOURCES } from "../seed/sources";

// Usage: pnpm build-fixtures [--force] [slug...]
// Produces seed/fixtures/<slug>/asr.json from paid APIs, once. The seed loader only ever reads fixtures.
// ASR job ids are kept in media-work/jobs.json so an interrupted run resumes instead of re-submitting.

const FIXTURES = "seed/fixtures";
const JOBS = "media-work/jobs.json";

const args = process.argv.slice(2);
const force = args.includes("--force");
const only = args.filter((a) => !a.startsWith("--"));

const jobs: Record<string, string> = existsSync(JOBS) ? JSON.parse(readFileSync(JOBS, "utf8")) : {};
const saveJobs = () => writeFileSync(JOBS, JSON.stringify(jobs, null, 2));

async function main() {
  const asr = getAsr();
  for (const s of SEED_SOURCES) {
    if (only.length && !only.includes(s.slug)) continue;

    const out = path.join(FIXTURES, s.slug, "asr.json");
    if (existsSync(out) && !force) {
      console.log(`[${s.slug}] asr fixture exists, skipping`);
      continue;
    }

    if (!jobs[s.slug] || force) {
      const { jobId } = await asr.transcribe({
        audioUrl: publicUrl(`seed/${s.slug}/asr.mp3`),
        speakersExpected: s.speakersExpected,
        speakerRange: s.speakerRange,
      });
      jobs[s.slug] = jobId;
      saveJobs();
      console.log(`[${s.slug}] submitted ${jobId}`);
    }

    const started = Date.now();
    for (;;) {
      const r = await asr.getResult(jobs[s.slug]);
      if (r.status === "error") throw new Error(`[${s.slug}] ${r.error}`);
      if (r.status === "completed") {
        mkdirSync(path.dirname(out), { recursive: true });
        writeFileSync(out, JSON.stringify({ provider: asr.name, jobId: jobs[s.slug], ...r }));
        const speakers = new Set(r.utterances.map((u) => u.speaker));
        console.log(`[${s.slug}] done: ${r.utterances.length} utterances, ${speakers.size} speakers, ${Math.round(r.durationMs / 60000)} min`);
        break;
      }
      console.log(`[${s.slug}] processing… ${Math.round((Date.now() - started) / 1000)}s`);
      await new Promise((res) => setTimeout(res, 15000));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
