import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { MeetingNotes } from "@/components/meeting/meeting-notes";
import { MeetingPlayer } from "@/components/meeting/meeting-player";
import { PlayerProvider } from "@/components/meeting/player-context";
import { SpeakerStats } from "@/components/meeting/speaker-stats";
import { TranscriptPanel } from "@/components/meeting/transcript-panel";
import { ParticipantStack } from "@/components/participant-stack";
import { formatDate, formatDuration } from "@/lib/format";
import { getMeeting } from "@/lib/queries";

export async function generateMetadata(props: PageProps<"/meetings/[id]">) {
  const { id } = await props.params;
  const data = await getMeeting(id);
  return { title: data ? `${data.meeting.title} · Notetaker` : "Meeting not found" };
}

export default async function MeetingPage(props: PageProps<"/meetings/[id]">) {
  const [{ id }, searchParams] = await Promise.all([props.params, props.searchParams]);
  const data = await getMeeting(id);
  if (!data) notFound();
  const { meeting, participants, segments } = data;
  const segStartMs: number[] = [];
  for (const s of segments) segStartMs[s.idx] = s.startMs;

  // ?t= accepts seconds ("754") so links stay short and human-readable.
  const t = Number(Array.isArray(searchParams.t) ? searchParams.t[0] : searchParams.t);
  const initialMs = Number.isFinite(t) && t > 0 ? Math.round(t * 1000) : undefined;

  return (
    <PlayerProvider segments={segments.map((s) => ({ startMs: s.startMs }))} initialMs={initialMs}>
      <div className="flex flex-col lg:h-dvh">
        <header className="border-b px-4 py-3 md:px-6">
          <Link
            href="/meetings"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-3.5" /> My meetings
          </Link>
          <div className="mt-1 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold tracking-tight">{meeting.title}</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {formatDate(meeting.startedAt)} · {formatDuration(meeting.durationMs)}
              </p>
            </div>
            <ParticipantStack participants={participants} max={6} />
          </div>
        </header>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)]">
          <div className="min-h-0 space-y-6 overflow-y-auto p-4 md:p-6">
            {meeting.mediaUrl ? (
              <MeetingPlayer src={meeting.mediaUrl} poster={meeting.posterUrl} />
            ) : (
              <div className="grid aspect-video place-items-center rounded-xl bg-muted text-sm text-muted-foreground">
                Recording unavailable
              </div>
            )}

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
            />

            <section>
              <h2 className="mb-3 text-sm font-medium">Speakers</h2>
              <SpeakerStats participants={participants} />
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
    </PlayerProvider>
  );
}
