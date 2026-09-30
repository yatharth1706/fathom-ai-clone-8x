import Image from "next/image";
import Link from "next/link";
import { AudioLines, Loader2, TriangleAlert, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ParticipantStack } from "@/components/participant-stack";
import { StatusPoller } from "@/components/status-poller";
import { UploadDialog } from "@/components/upload-dialog";
import { formatDate, formatDuration } from "@/lib/format";
import { listMeetings, type MeetingListItem } from "@/lib/queries";
import { dailyUploadLimit } from "@/lib/uploads";

export const metadata = { title: "My meetings · Notetaker" };

export default async function MeetingsPage() {
  const meetings = await listMeetings();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
      <StatusPoller meetings={meetings} />
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My meetings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {meetings.length} {meetings.length === 1 ? "recording" : "recordings"}
          </p>
        </div>
        <UploadDialog dailyLimit={dailyUploadLimit()} />
      </div>

      {meetings.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <Video className="size-8 text-muted-foreground" />
          <p className="font-medium">No meetings yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Upload a recording and it will appear here with a transcript, summary and action items.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {groupByMonth(meetings).map(([month, items]) => (
            <section key={month}>
              <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{month}</h2>
              <ul className="divide-y rounded-xl border">
                {items.map((m) => (
                  <li key={m.id}>
                    <MeetingRow meeting={m} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function MeetingRow({ meeting: m }: { meeting: MeetingListItem }) {
  return (
    <Link
      href={`/meetings/${m.id}`}
      className="flex items-center gap-4 p-3 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-muted/50"
    >
      <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-md bg-muted sm:w-40">
        {m.posterUrl ? (
          <Image src={m.posterUrl} alt="" fill sizes="160px" className="object-cover" />
        ) : (
          <div className="grid h-full place-items-center text-muted-foreground">
            {m.mediaKind === "audio" ? <AudioLines className="size-6" /> : <Video className="size-6" />}
          </div>
        )}
        {m.durationMs ? (
          <span className="absolute right-1 bottom-1 rounded bg-black/75 px-1 py-0.5 text-[11px] font-medium text-white tabular-nums">
            {formatDuration(m.durationMs)}
          </span>
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium">{m.title}</p>
          <StatusBadge status={m.status} />
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{formatDate(m.startedAt)}</p>
        {m.participants.length > 0 && (
          <ParticipantStack participants={m.participants} max={5} className="mt-2" />
        )}
      </div>
    </Link>
  );
}

function StatusBadge({ status }: { status: MeetingListItem["status"] }) {
  if (status === "ready") return null;
  if (status === "failed")
    return (
      <Badge variant="destructive">
        <TriangleAlert /> Failed
      </Badge>
    );
  const label = { uploaded: "Uploading", transcribing: "Transcribing", analyzing: "Summarizing" }[status];
  return (
    <Badge variant="secondary">
      <Loader2 className="animate-spin" /> {label}
    </Badge>
  );
}

function groupByMonth(meetings: MeetingListItem[]) {
  const groups = new Map<string, MeetingListItem[]>();
  for (const m of meetings) {
    const key = m.startedAt.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  return [...groups.entries()];
}
