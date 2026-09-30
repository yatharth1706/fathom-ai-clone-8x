import Image from "next/image";
import Link from "next/link";
import { AudioLines, Globe, Highlighter, Video } from "lucide-react";
import { ClipActions } from "@/components/clip-actions";
import { formatDate, formatTimestamp, tParam } from "@/lib/format";
import { listHighlights, type HighlightListItem } from "@/lib/queries";

export const metadata = { title: "Highlights · Notetaker" };

export default async function HighlightsPage() {
  const clips = await listHighlights();
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Highlights</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {clips.length} {clips.length === 1 ? "clip" : "clips"} · select lines in any transcript to make one
      </p>

      {clips.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <Highlighter className="size-8 text-muted-foreground" />
          <p className="font-medium">No clips yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Open a meeting, select a few lines of the transcript and choose Create clip.
          </p>
        </div>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {clips.map((c, i) => (
            <li key={c.id} className="min-w-0">
              <ClipCard clip={c} eager={i < 2} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ClipCard({ clip: c, eager }: { clip: HighlightListItem; eager: boolean }) {
  const href = `/meetings/${c.meetingId}?t=${tParam(c.startMs)}`;
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-xl border">
      <Link href={href} className="relative block aspect-video bg-muted">
        {c.meeting.posterUrl ? (
          <Image src={c.meeting.posterUrl} alt="" fill sizes="(min-width: 640px) 480px, 100vw" loading={eager ? "eager" : "lazy"} className="object-cover" />
        ) : (
          <div className="grid h-full place-items-center text-muted-foreground">
            {c.meeting.mediaKind === "audio" ? <AudioLines className="size-8" /> : <Video className="size-8" />}
          </div>
        )}
        <span className="absolute right-2 bottom-2 rounded bg-black/75 px-1.5 py-0.5 text-xs font-medium text-white tabular-nums">
          {formatTimestamp(c.endMs - c.startMs)}
        </span>
      </Link>
      <div className="flex flex-1 flex-col p-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <Link href={href} className="font-medium leading-snug hover:underline">
              {c.title}
            </Link>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {c.meeting.title} · {formatDate(c.meeting.startedAt)} · at {formatTimestamp(c.startMs)}
            </p>
          </div>
          <ClipActions clip={c} />
        </div>
        {c.note && <p className="mt-2 text-sm">{c.note}</p>}
        {c.excerpt && <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">“{c.excerpt}”</p>}
        {c.shareToken && (
          <p className="mt-auto flex items-center gap-1 pt-2 text-xs text-muted-foreground">
            <Globe className="size-3" /> Public link on
          </p>
        )}
      </div>
    </article>
  );
}
