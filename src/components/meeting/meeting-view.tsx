import { ExternalLink, TriangleAlert } from "lucide-react";
import { ClipComposerProvider } from "@/components/meeting/clip-composer";
import { MeetingNotes } from "@/components/meeting/meeting-notes";
import { MeetingPlayer } from "@/components/meeting/meeting-player";
import { MeetingTimeline } from "@/components/meeting/meeting-timeline";
import { SpeakerFilterProvider } from "@/components/meeting/speaker-filter";
import { PlayerProvider } from "@/components/meeting/player-context";
import { SpeakerStats } from "@/components/meeting/speaker-stats";
import { TranscriptPanel } from "@/components/meeting/transcript-panel";
import { ParticipantStack } from "@/components/participant-stack";
import { formatDate, formatDuration } from "@/lib/format";
import type { MeetingDetail } from "@/lib/queries";

/** `?t=` accepts seconds ("754") so links stay short and human-readable. */
export function parseStartParam(t: string | string[] | undefined) {
  const n = Number(Array.isArray(t) ? t[0] : t);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) : undefined;
}

/** The meeting page body, shared by the owner page and the public share page (`readOnly`). */
export function MeetingView({
  data,
  initialMs,
  readOnly = false,
  eyebrow,
  actions,
}: {
  data: MeetingDetail;
  initialMs?: number;
  readOnly?: boolean;
  /** Small line above the title (back link, or "shared" label). */
  eyebrow?: React.ReactNode;
  /** Header controls next to the participant stack. */
  actions?: React.ReactNode;
}) {
  const { meeting, participants, segments } = data;
  const segStartMs: number[] = [];
  for (const s of segments) segStartMs[s.idx] = s.startMs;
  const durationMs = meeting.durationMs ?? segments.at(-1)?.endMs ?? 0;

  const content = (
    <div className="flex flex-col lg:h-dvh">
      <header className="border-b px-4 py-3 md:px-6">
        {eyebrow}
        <div className="mt-1 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight">{meeting.title}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {formatDate(meeting.startedAt)} · {formatDuration(meeting.durationMs)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <ParticipantStack participants={participants} max={6} />
            {actions}
          </div>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)]">
        <div className="min-h-0 space-y-6 overflow-y-auto p-4 md:p-6">
          {meeting.error && !readOnly && (
            <p role="status" className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {meeting.error}
            </p>
          )}
          <div className="space-y-3">
            {meeting.mediaUrl ? (
              <MeetingPlayer src={meeting.mediaUrl} poster={meeting.posterUrl} />
            ) : (
              <div className="grid aspect-video place-items-center rounded-xl bg-muted text-sm text-muted-foreground">
                Recording unavailable
              </div>
            )}
            {durationMs > 0 && (
              <MeetingTimeline
                durationMs={durationMs}
                chapters={data.chapters}
                participants={participants}
                segments={segments}
              />
            )}
          </div>

          <MeetingNotes
            meetingId={meeting.id}
            title={meeting.title}
            segStartMs={segStartMs}
            participants={participants}
            summaries={data.summaries}
            actionItems={data.actionItems}
            insights={data.insights}
            chapters={data.chapters}
            defaultTemplate={data.defaultTemplate}
            qa={readOnly ? [] : data.qa}
            highlights={readOnly ? [] : data.highlights}
            readOnly={readOnly}
          />

          <section>
            <h2 className="mb-3 text-sm font-medium">Speakers</h2>
            <SpeakerStats
              meetingId={meeting.id}
              participants={participants}
              canMerge={!meeting.isProtected}
              readOnly={readOnly}
            />
          </section>

          {meeting.attributionUrl && (
            <p className="border-t pt-4 text-xs text-muted-foreground">
              {meeting.attributionText}{" "}
              <a
                href={meeting.attributionUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-foreground"
              >
                Source <ExternalLink className="size-3" />
              </a>
            </p>
          )}
        </div>

        <aside className="flex h-[70vh] min-h-0 flex-col border-t lg:h-auto lg:border-t-0 lg:border-l">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <h2 className="text-sm font-medium">Transcript</h2>
            <span className="text-xs text-muted-foreground">{segments.length} lines</span>
          </div>
          <TranscriptPanel segments={segments} participants={participants} />
        </aside>
      </div>
    </div>
  );

  return (
    <PlayerProvider segments={segments.map((s) => ({ startMs: s.startMs }))} initialMs={initialMs}>
      <SpeakerFilterProvider>
        {readOnly ? (
          content
        ) : (
          <ClipComposerProvider meetingId={meeting.id} durationMs={durationMs}>
            {content}
          </ClipComposerProvider>
        )}
      </SpeakerFilterProvider>
    </PlayerProvider>
  );
}
