import "./env";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { toTranscriptForLlm, type AnalysisFixture, type SummariesFixture } from "@/lib/analysis";
import { getAsr, getLlm, TEMPLATE_IDS, type AsrResult } from "@/lib/providers";
import { publicUrl } from "@/lib/storage";
import { normalizeUtterances, speakerStats } from "@/lib/transcript";
import { SEED_SOURCES } from "../seed/sources";

// Usage: pnpm build-fixtures [--force-asr] [--force-llm] [slug...]
// Produces seed/fixtures/<slug>/{asr,analysis,summaries}.json from paid APIs, once. The seed loader only ever reads fixtures.
// ASR job ids are kept in media-work/jobs.json so an interrupted run resumes instead of re-submitting;
// summaries.json is written after every template for the same reason (the LLM free tier is rate-limited).

const FIXTURES = "seed/fixtures";
const JOBS = "media-work/jobs.json";

const args = process.argv.slice(2);
const forceAsr = args.includes("--force-asr");
const forceLlm = args.includes("--force-llm");
const only = args.filter((a) => !a.startsWith("--"));

const jobs: Record<string, string> = existsSync(JOBS) ? JSON.parse(readFileSync(JOBS, "utf8")) : {};
const saveJobs = () => writeFileSync(JOBS, JSON.stringify(jobs, null, 2));

type AsrFixture = Extract<AsrResult, { status: "completed" }>;

const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, "utf8"));
const writeJson = (file: string, data: unknown) => writeFileSync(file, JSON.stringify(data, null, 1));

async function buildAsr(slug: string, s: (typeof SEED_SOURCES)[number], out: string) {
  const asr = getAsr();
  if (!jobs[slug] || forceAsr) {
    const { jobId } = await asr.transcribe({
      audioUrl: publicUrl(`seed/${slug}/asr.mp3`),
      speakersExpected: s.speakersExpected,
      speakerRange: s.speakerRange,
    });
    jobs[slug] = jobId;
    saveJobs();
    console.log(`[${slug}] submitted ${jobId}`);
  }

  const started = Date.now();
  for (;;) {
    const r = await asr.getResult(jobs[slug]);
    if (r.status === "error") throw new Error(`[${slug}] ${r.error}`);
    if (r.status === "completed") {
      mkdirSync(path.dirname(out), { recursive: true });
      writeFileSync(out, JSON.stringify({ provider: asr.name, jobId: jobs[slug], ...r }));
      const speakers = new Set(r.utterances.map((u) => u.speaker));
      console.log(`[${slug}] done: ${r.utterances.length} utterances, ${speakers.size} speakers, ${Math.round(r.durationMs / 60000)} min`);
      return;
    }
    console.log(`[${slug}] processing… ${Math.round((Date.now() - started) / 1000)}s`);
    await new Promise((res) => setTimeout(res, 15000));
  }
}

async function buildLlm(slug: string, title: string, dir: string) {
  const llm = getLlm();
  const segments = normalizeUtterances(readJson<AsrFixture>(path.join(dir, "asr.json")).utterances);
  const labels = speakerStats(segments).map((s) => s.speaker);

  const analysisFile = path.join(dir, "analysis.json");
  if (!existsSync(analysisFile) || forceLlm) {
    const t0 = Date.now();
    const analysis = await llm.analyze(
      toTranscriptForLlm(segments, labels.map((l) => ({ label: l, name: `Speaker ${l}` })), title),
    );
    writeJson(analysisFile, { provider: llm.name, model: llm.model, analysis } satisfies AnalysisFixture);
    const named = analysis.speakerNames.filter((n) => n.name).length;
    console.log(
      `[${slug}] analysis: ${analysis.chapters.length} chapters, ${analysis.actionItems.length} action items, ` +
        `${analysis.insights.length} insights, ${named}/${labels.length} names (${Math.round((Date.now() - t0) / 1000)}s)`,
    );
  }

  // Summaries use the guessed names so bullets say "Alice will…" rather than "Speaker B will…".
  const { analysis } = readJson<AnalysisFixture>(analysisFile);
  const guessed = new Map(analysis.speakerNames.map((n) => [n.label, n.name]));
  const transcript = toTranscriptForLlm(
    segments,
    labels.map((l) => ({ label: l, name: guessed.get(l) ?? `Speaker ${l}` })),
    title,
  );

  const summariesFile = path.join(dir, "summaries.json");
  const fixture: SummariesFixture =
    existsSync(summariesFile) && !forceLlm ? readJson(summariesFile) : { provider: llm.name, model: llm.model, summaries: {} };
  for (const template of TEMPLATE_IDS) {
    if (fixture.summaries[template]) continue;
    const t0 = Date.now();
    fixture.summaries[template] = await llm.summarize(transcript, template);
    writeJson(summariesFile, fixture);
    console.log(`[${slug}] summary ${template} (${Math.round((Date.now() - t0) / 1000)}s)`);
  }
}

async function main() {
  for (const s of SEED_SOURCES) {
    if (only.length && !only.includes(s.slug)) continue;
    const dir = path.join(FIXTURES, s.slug);
    const asrFile = path.join(dir, "asr.json");

    if (existsSync(asrFile) && !forceAsr) console.log(`[${s.slug}] asr fixture exists, skipping`);
    else await buildAsr(s.slug, s, asrFile);

    await buildLlm(s.slug, s.title, dir);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
