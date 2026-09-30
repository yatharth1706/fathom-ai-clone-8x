import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { cleanSummary, resolveAnalysis, segmentIndex, toTranscriptForLlm } from "@/lib/analysis";
import { getAsr, getLlm, type AsrResult, type TemplateId } from "@/lib/providers";
import { headObject } from "@/lib/storage";
import { summaryToMarkdown } from "@/lib/summary-format";
import { normalizeUtterances, SPEAKER_COLORS, speakerStats } from "@/lib/transcript";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_DURATION_MS } from "@/lib/upload-limits";
import { webhookConfig } from "@/lib/uploads";

type CompletedAsr = Extract<AsrResult, { status: "completed" }>;

/** Loads a meeting's transcript in the shape the LLM sees, using current speaker names. */
async function loadTranscript(meetingId: string) {
  const d = db();
  const [meeting] = await d
    .select({ title: schema.meetings.title })
    .from(schema.meetings)
    .where(eq(schema.meetings.id, meetingId));
  if (!meeting) return null;

  const [people, rows] = await Promise.all([
    d
      .select({ id: schema.participants.id, label: schema.participants.speakerLabel, name: schema.participants.displayName })
      .from(schema.participants)
      .where(eq(schema.participants.meetingId, meetingId)),
    d
      .select({
        idx: schema.transcriptSegments.idx,
        participantId: schema.transcriptSegments.participantId,
        startMs: schema.transcriptSegments.startMs,
        text: schema.transcriptSegments.text,
      })
      .from(schema.transcriptSegments)
      .where(eq(schema.transcriptSegments.meetingId, meetingId))
      .orderBy(asc(schema.transcriptSegments.idx)),
  ]);
  const labelById = new Map(people.map((p) => [p.id, p.label]));
  const segments = rows.map((r) => ({ ...r, speaker: labelById.get(r.participantId) ?? "?" }));
  return {
    title: meeting.title,
    segments,
    transcript: toTranscriptForLlm(segments, people.map(({ label, name }) => ({ label, name })), meeting.title),
  };
}

/** Answers a question from the transcript and stores it. Citations are validated and mapped to times. */
export async function askMeeting(meetingId: string, question: string) {
  const loaded = await loadTranscript(meetingId);
  if (!loaded) return null;
  const segs = segmentIndex(loaded.segments);
  const res = await getLlm().ask(loaded.transcript, question);
  const citations = [...new Set(res.citations.filter(segs.has))]
    .sort((a, b) => a - b)
    .map((segIdx) => ({ segIdx, startMs: segs.startMs(segIdx)! }));
  const [row] = await db()
    .insert(schema.qaMessages)
    .values({ meetingId, question, answer: res.answer, citations })
    .returning({
      id: schema.qaMessages.id,
      question: schema.qaMessages.question,
      answer: schema.qaMessages.answer,
      citations: schema.qaMessages.citations,
      createdAt: schema.qaMessages.createdAt,
    });
  return row;
}

/** Generates (or regenerates) one template's summary and upserts it. Throws on LLM failure after recording it. */
export async function generateSummary(meetingId: string, template: TemplateId) {
  const loaded = await loadTranscript(meetingId);
  if (!loaded) return null;
  const d = db();
  const llm = getLlm();
  const key = [schema.summaries.meetingId, schema.summaries.template];

  try {
    const segs = segmentIndex(loaded.segments);
    const content = cleanSummary(await llm.summarize(loaded.transcript, template), segs);
    const row = {
      status: "ready" as const,
      content,
      markdown: summaryToMarkdown(content, { title: loaded.title, startMs: segs.startMs }),
      model: llm.model,
      error: null,
    };
    await d
      .insert(schema.summaries)
      .values({ meetingId, template, ...row })
      .onConflictDoUpdate({ target: key, set: row });
    return row;
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await d
      .insert(schema.summaries)
      .values({ meetingId, template, status: "failed", error })
      .onConflictDoUpdate({ target: key, set: { status: "failed", error } });
    throw e;
  }
}

// ---------- upload pipeline: uploaded → transcribing → analyzing → ready | failed ----------
// Every step claims its transition with a conditional UPDATE, so a webhook and a status poll racing each other
// (or two open tabs polling) still run each step once.

const SUMMARY_START_BUDGET_MS = 30_000;

function message(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

async function failMeeting(meetingId: string, error: string, from?: (typeof schema.meetingStatus.enumValues)[number]) {
  await db()
    .update(schema.meetings)
    .set({ status: "failed", error })
    .where(from ? and(eq(schema.meetings.id, meetingId), eq(schema.meetings.status, from)) : eq(schema.meetings.id, meetingId));
}

/** Verifies the uploaded object and submits it for transcription. Returns false if the meeting wasn't awaiting this. */
export async function startTranscription(meetingId: string) {
  const d = db();
  const [m] = await d
    .update(schema.meetings)
    .set({ status: "transcribing" })
    .where(and(eq(schema.meetings.id, meetingId), eq(schema.meetings.source, "upload"), eq(schema.meetings.status, "uploaded")))
    .returning({ mediaKey: schema.meetings.mediaKey, mediaUrl: schema.meetings.mediaUrl });
  if (!m?.mediaKey || !m.mediaUrl) return false;

  const obj = await headObject(m.mediaKey);
  if (!obj) {
    await failMeeting(meetingId, "The upload didn't finish. Please try again.");
    return true;
  }
  if (obj.size > MAX_UPLOAD_BYTES) {
    await failMeeting(meetingId, "Files can be at most 100 MB.");
    return true;
  }

  try {
    const hook = webhookConfig();
    const { jobId } = await getAsr().transcribe({
      audioUrl: m.mediaUrl,
      webhookUrl: hook?.url,
      webhookSecret: hook?.secret,
    });
    await d.update(schema.meetings).set({ asrJobId: jobId }).where(eq(schema.meetings.id, meetingId));
  } catch (e) {
    console.error(`transcribe ${meetingId} failed`, e);
    await failMeeting(meetingId, "Transcription couldn't be started. Please try again later.");
  }
  return true;
}

/**
 * Checks the ASR job. When it has finished, claims `transcribing → analyzing` and returns the transcript for
 * `finishMeeting` (callers run that in `after()`); otherwise returns null. Used by both the webhook and the poller.
 */
export async function claimTranscript(meetingId: string): Promise<CompletedAsr | null> {
  const d = db();
  const [m] = await d
    .select({ status: schema.meetings.status, asrJobId: schema.meetings.asrJobId })
    .from(schema.meetings)
    .where(eq(schema.meetings.id, meetingId));
  if (m?.status !== "transcribing" || !m.asrJobId) return null;

  const res = await getAsr().getResult(m.asrJobId);
  if (res.status === "processing") return null;
  if (res.status === "error") {
    await failMeeting(meetingId, `Transcription failed: ${res.error}`, "transcribing");
    return null;
  }
  // Small tolerance: container metadata (checked in the browser) and decoded audio length differ slightly.
  if (res.durationMs > MAX_UPLOAD_DURATION_MS + 5_000) {
    await failMeeting(meetingId, "Recordings can be at most 15 minutes long.", "transcribing");
    return null;
  }
  if (res.utterances.length === 0) {
    await failMeeting(meetingId, "No speech was detected in this recording.", "transcribing");
    return null;
  }

  const claimed = await d
    .update(schema.meetings)
    .set({ status: "analyzing", durationMs: res.durationMs })
    .where(and(eq(schema.meetings.id, meetingId), eq(schema.meetings.status, "transcribing")))
    .returning({ id: schema.meetings.id });
  return claimed.length ? res : null;
}

/** Stores the transcript, then runs analysis and the default summary. Never throws. */
export async function finishMeeting(meetingId: string, asr: CompletedAsr) {
  const d = db();
  try {
    const segments = normalizeUtterances(asr.utterances);
    const stats = speakerStats(segments);
    const participantIds = new Map(stats.map((st) => [st.speaker, randomUUID()]));
    await d.insert(schema.participants).values(
      stats.map((st, i) => ({
        id: participantIds.get(st.speaker)!,
        meetingId,
        speakerLabel: st.speaker,
        displayName: `Speaker ${st.speaker}`,
        color: SPEAKER_COLORS[i % SPEAKER_COLORS.length],
        talkMs: st.talkMs,
        segmentCount: st.segmentCount,
      })),
    );
    for (let i = 0; i < segments.length; i += 200) {
      await d.insert(schema.transcriptSegments).values(
        segments.slice(i, i + 200).map((seg) => ({
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

    const [meeting] = await d
      .select({ title: schema.meetings.title, ownerId: schema.meetings.ownerId })
      .from(schema.meetings)
      .where(eq(schema.meetings.id, meetingId));
    const [settings] = await d
      .select({ defaultTemplate: schema.userSettings.defaultTemplate, autoActionItems: schema.userSettings.autoActionItems })
      .from(schema.userSettings)
      .where(eq(schema.userSettings.userId, meeting.ownerId));

    // Analysis first, so the summary is written with the guessed speaker names and the AI title.
    let error: string | null = null;
    const started = Date.now();
    try {
      const loaded = (await loadTranscript(meetingId))!;
      const analysis = await getLlm().analyze(loaded.transcript);
      const r = resolveAnalysis(analysis, segmentIndex(segments), asr.durationMs, participantIds);
      const actionItems = settings?.autoActionItems === false ? [] : r.actionItems;
      if (r.chapters.length) await d.insert(schema.chapters).values(r.chapters.map((c) => ({ meetingId, ...c })));
      if (actionItems.length) await d.insert(schema.actionItems).values(actionItems.map((a) => ({ meetingId, ...a })));
      if (r.insights.length) await d.insert(schema.insights).values(r.insights.map((x) => ({ meetingId, ...x })));
      for (const [label, name] of r.speakerNames) {
        await d
          .update(schema.participants)
          .set({ displayName: name, isNameGuessed: true })
          .where(eq(schema.participants.id, participantIds.get(label)!));
      }
      // Replace the filename-derived title, unless someone renamed the meeting meanwhile.
      const title = analysis.title.trim().slice(0, 120);
      if (title)
        await d
          .update(schema.meetings)
          .set({ title })
          .where(and(eq(schema.meetings.id, meetingId), eq(schema.meetings.title, meeting.title)));
    } catch (e) {
      console.error(`analyze ${meetingId} failed`, e);
      error = "AI notes couldn't be generated (the AI provider is busy or out of quota). The transcript is ready.";
    }

    // A summary call can spend up to ~4 min in retries; only start it if that still fits the route's 300 s budget.
    // Otherwise (or if it fails) the Summary tab offers Generate / Try again.
    if (!error && Date.now() - started < SUMMARY_START_BUDGET_MS) {
      await generateSummary(meetingId, settings?.defaultTemplate ?? "general").catch((e) =>
        console.error(`summary ${meetingId} failed`, e),
      );
    }

    await d.update(schema.meetings).set({ status: "ready", error }).where(eq(schema.meetings.id, meetingId));
  } catch (e) {
    console.error(`finish ${meetingId} failed`, e);
    await failMeeting(meetingId, `Processing failed: ${message(e)}`).catch(() => {});
  }
}
