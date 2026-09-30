"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AudioLines, Globe, Video } from "lucide-react";
import { ClipActions } from "@/components/clip-actions";
import { formatDate, formatTimestamp, tParam } from "@/lib/format";
import type { HighlightListItem } from "@/lib/queries";

/** Clip grid with a meeting filter; hovering a thumbnail previews the clip itself (muted). */
export function HighlightsGrid({ clips }: { clips: HighlightListItem[] }) {
  const [meetingId, setMeetingId] = useState("");
  const meetings = [...new Map(clips.map((c) => [c.meetingId, c.meeting.title])).entries()];
  const shown = meetingId ? clips.filter((c) => c.meetingId === meetingId) : clips;

  return (
    <>
      {meetings.length > 1 && (
        <div className="mt-5 flex items-center gap-2">
          <select
            value={meetingId}
            onChange={(e) => setMeetingId(e.target.value)}
            aria-label="Filter by meeting"
            className="h-8 max-w-full rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <option value="">All meetings ({clips.length})</option>
            {meetings.map(([id, title]) => (
              <option key={id} value={id}>
                {title} ({clips.filter((c) => c.meetingId === id).length})
              </option>
            ))}
          </select>
        </div>
      )}
      <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {shown.map((c, i) => (
          <li key={c.id} className="min-w-0">
            <ClipCard clip={c} eager={i < 4} />
          </li>
        ))}
      </ul>
    </>
  );
}

/** True when the quote mostly repeats the title (demo clips are titled from what was said). */
function repeatsTitle(title: string, excerpt: string) {
  const words = (s: string) => new Set(s.toLowerCase().match(/[a-z']{4,}/g) ?? []);
  const t = words(title);
  if (t.size === 0) return false;
  const e = words(excerpt.slice(0, 200));
  return [...t].filter((w) => e.has(w)).length / t.size > 0.6;
}

function ClipCard({ clip: c, eager }: { clip: HighlightListItem; eager: boolean }) {
  const href = `/meetings/${c.meetingId}?t=${tParam(c.startMs)}`;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [activated, setActivated] = useState(false); // the video src is only set once the card is first hovered
  const [previewing, setPreviewing] = useState(false);
  const canPreview = !!c.meeting.mediaUrl && c.meeting.mediaKind === "video";

  const [playing, setPlaying] = useState(false); // keep the poster visible until frames are actually moving

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !activated) return;
    if (!previewing) return void v.pause();
    // play() also triggers loading (preload is "none"); the #t= fragment makes the first load start at the clip.
    if (v.readyState >= 1) v.currentTime = c.startMs / 1000;
    void v.play().catch(() => {});
  }, [previewing, activated, c.startMs]);

  const startPreview = () => {
    if (!canPreview) return;
    setActivated(true);
    setPreviewing(true);
  };
  const stopPreview = () => setPreviewing(false);

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-xl border transition-colors hover:border-foreground/20">
      <Link
        href={href}
        onMouseEnter={startPreview}
        onMouseLeave={stopPreview}
        onFocus={startPreview}
        onBlur={stopPreview}
        className="relative block aspect-video bg-muted"
      >
        {c.meeting.posterUrl ? (
          <Image src={c.meeting.posterUrl} alt="" fill sizes="(min-width: 1280px) 240px, (min-width: 640px) 320px, 100vw" loading={eager ? "eager" : "lazy"} className="object-cover" />
        ) : (
          <div className="grid h-full place-items-center text-muted-foreground">
            {c.meeting.mediaKind === "audio" ? <AudioLines className="size-6" /> : <Video className="size-6" />}
          </div>
        )}
        {canPreview && (
          <video
            ref={videoRef}
            // Media fragment so only the clip's range is fetched and played; metadata loads on first hover.
            src={activated ? `${c.meeting.mediaUrl}#t=${c.startMs / 1000},${c.endMs / 1000}` : undefined}
            muted
            playsInline
            preload="none"
            onPlaying={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onTimeUpdate={(e) => {
              if (e.currentTarget.currentTime * 1000 >= c.endMs) e.currentTarget.currentTime = c.startMs / 1000; // loop
            }}
            className={`absolute inset-0 size-full object-cover transition-opacity ${previewing && playing ? "opacity-100" : "opacity-0"}`}
          />
        )}
        <span className="absolute right-1.5 bottom-1.5 rounded bg-black/75 px-1 py-0.5 text-[11px] font-medium text-white tabular-nums">
          {formatTimestamp(c.endMs - c.startMs)}
        </span>
      </Link>
      <div className="flex flex-1 flex-col p-2.5">
        <div className="flex items-start gap-1">
          <div className="min-w-0 flex-1">
            <Link href={href} className="line-clamp-2 text-sm font-medium leading-snug hover:underline">
              {c.title}
            </Link>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {c.meeting.title} · {formatDate(c.meeting.startedAt)} · {formatTimestamp(c.startMs)}
            </p>
          </div>
          <ClipActions clip={c} />
        </div>
        {c.note && <p className="mt-1.5 line-clamp-2 text-xs">{c.note}</p>}
        {c.excerpt && !repeatsTitle(c.title, c.excerpt) && (
          <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">“{c.excerpt}”</p>
        )}
        {c.shareToken && (
          <p className="mt-auto flex items-center gap-1 pt-2 text-[11px] text-muted-foreground">
            <Globe className="size-3" /> Public link on
          </p>
        )}
      </div>
    </article>
  );
}
