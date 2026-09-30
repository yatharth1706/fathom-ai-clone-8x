"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { ParticipantAvatar } from "@/components/participant-stack";
import { formatTimestamp } from "@/lib/format";
import type { Participant, Segment } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { usePlayer } from "./player-context";

export function TranscriptPanel({
  segments,
  participants,
}: {
  segments: Segment[];
  participants: Participant[];
}) {
  const { activeIdx, playing, seekCount, seekTo } = usePlayer();
  const containerRef = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);
  const byId = new Map(participants.map((p) => [p.id, p]));

  const scrollToIdx = useCallback((idx: number, behavior: ScrollBehavior) => {
    const container = containerRef.current;
    const row = container?.querySelector<HTMLElement>(`[data-idx="${idx}"]`);
    if (!container || !row) return;
    // Keep the active line about a third of the way down, so upcoming lines stay visible.
    const top = row.offsetTop - container.clientHeight / 3;
    // Animate short moves only; long jumps (e.g. scrubbing across the meeting) would take seconds to animate.
    const far = Math.abs(top - container.scrollTop) > container.clientHeight * 2;
    container.scrollTo({ top, behavior: far ? "instant" : behavior });
  }, []);

  // Jump straight to the ?t= position on first render.
  useLayoutEffect(() => {
    if (activeIdx >= 0) scrollToIdx(activeIdx, "instant");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (follow && activeIdx >= 0) scrollToIdx(activeIdx, "smooth");
  }, [activeIdx, follow, scrollToIdx]);

  // Any seek (player scrubber, keyboard, or a timestamp link) is explicit navigation, so resume following;
  // the effect above then scrolls to the new line. Adjusting state during render avoids an extra effect pass.
  const [seenSeekCount, setSeenSeekCount] = useState(seekCount);
  if (seekCount !== seenSeekCount) {
    setSeenSeekCount(seekCount);
    setFollow(true);
  }

  // Only real user input pauses following; our own programmatic scrolls don't fire these.
  const stopFollowing = useCallback(() => setFollow(false), []);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.target === containerRef.current) setFollow(false); // scrollbar drag
  };

  // ---- search ----
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [matchPos, setMatchPos] = useState(0);
  const needle = query.trim().toLowerCase();
  const matches = useMemo(() => findMatches(segments, needle), [segments, needle]);
  const current = matches.length ? matches[Math.min(matchPos, matches.length - 1)] : undefined;
  // Rows re-render only if they contain a hit (memo), so typing stays cheap on long transcripts.
  const rowsWithHits = useMemo(() => new Set(matches.map((m) => m.i)), [matches]);

  // Reading search results is manual navigation, so searching stops following playback.
  const step = (dir: 1 | -1) => {
    if (!matches.length) return;
    setFollow(false);
    setMatchPos((p) => (Math.min(p, matches.length - 1) + dir + matches.length) % matches.length);
  };

  useEffect(() => {
    if (current) scrollToIdx(segments[current.i].idx, "smooth");
  }, [current, segments, scrollToIdx]);

  // "/" focuses search, as in Fathom and most web apps; ignored while typing elsewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onSeek = useCallback(
    (ms: number) => {
      setFollow(true);
      seekTo(ms);
    },
    [seekTo],
  );

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 border-b px-3 py-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setMatchPos(0);
              if (e.target.value.trim()) setFollow(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                step(e.shiftKey ? -1 : 1);
              }
              if (e.key === "Escape") {
                setQuery("");
                e.currentTarget.blur();
              }
            }}
            placeholder="Search transcript  ( / )"
            aria-label="Search transcript"
            className="h-8 w-full rounded-md border bg-background pr-2 pl-7 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-search-cancel-button]:hidden"
          />
        </div>
        {needle && (
          <>
            <span className="w-14 shrink-0 text-center text-xs text-muted-foreground tabular-nums" aria-live="polite">
              {matches.length ? `${Math.min(matchPos, matches.length - 1) + 1}/${matches.length}` : "0/0"}
            </span>
            <button onClick={() => step(-1)} disabled={!matches.length} className="rounded p-1 hover:bg-muted disabled:opacity-40" aria-label="Previous match">
              <ChevronUp className="size-4" />
            </button>
            <button onClick={() => step(1)} disabled={!matches.length} className="rounded p-1 hover:bg-muted disabled:opacity-40" aria-label="Next match">
              <ChevronDown className="size-4" />
            </button>
            <button onClick={() => setQuery("")} className="rounded p-1 hover:bg-muted" aria-label="Clear search">
              <X className="size-4" />
            </button>
          </>
        )}
      </div>

      <div
        ref={containerRef}
        onWheel={stopFollowing}
        onTouchMove={stopFollowing}
        onPointerDown={onPointerDown}
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-3"
      >
        {segments.map((seg, i) => {
          const speaker = byId.get(seg.participantId);
          const showSpeaker = i === 0 || segments[i - 1].participantId !== seg.participantId;
          return (
            <TranscriptRow
              key={seg.idx}
              seg={seg}
              speaker={showSpeaker ? speaker : undefined}
              active={i === activeIdx}
              onSeek={onSeek}
              needle={rowsWithHits.has(i) ? needle : undefined}
              currentHit={current?.i === i ? current.start : undefined}
            />
          );
        })}
      </div>

      {!follow && activeIdx >= 0 && (
        <button
          onClick={() => {
            setFollow(true);
            scrollToIdx(activeIdx, "smooth");
          }}
          className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background shadow-lg hover:opacity-90"
        >
          <ArrowDown className="size-3.5" />
          {playing ? "Jump to current" : "Back to current line"}
        </button>
      )}
    </div>
  );
}

type Match = { i: number; start: number };

/** Every case-insensitive occurrence of `needle`, in transcript order. */
function findMatches(segments: Segment[], needle: string): Match[] {
  if (needle.length < 2) return [];
  const out: Match[] = [];
  segments.forEach((seg, i) => {
    const hay = seg.text.toLowerCase();
    for (let at = hay.indexOf(needle); at !== -1; at = hay.indexOf(needle, at + needle.length)) out.push({ i, start: at });
  });
  return out;
}

function Highlighted({ text, needle, currentHit }: { text: string; needle: string; currentHit?: number }) {
  const hay = text.toLowerCase();
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (let at = hay.indexOf(needle); at !== -1; at = hay.indexOf(needle, at + needle.length)) {
    parts.push(text.slice(last, at));
    parts.push(
      <mark
        key={at}
        className={cn(
          "rounded-sm bg-yellow-200/80 text-inherit dark:bg-yellow-500/30",
          at === currentHit && "bg-orange-300 ring-2 ring-orange-400 dark:bg-orange-500/60",
        )}
      >
        {text.slice(at, at + needle.length)}
      </mark>,
    );
    last = at + needle.length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}

const TranscriptRow = memo(function TranscriptRow({
  seg,
  speaker,
  active,
  onSeek,
  needle,
  currentHit,
}: {
  seg: Segment;
  speaker?: Participant;
  active: boolean;
  onSeek: (ms: number) => void;
  /** Set only on rows containing a search hit. */
  needle?: string;
  /** Offset of the selected hit, when it's in this row. */
  currentHit?: number;
}) {
  const onClick = () => {
    // Let people select text (for copying / clips) without jumping the player.
    if (window.getSelection()?.isCollapsed === false) return;
    onSeek(seg.startMs);
  };

  return (
    <div data-idx={seg.idx} className={cn(speaker && "mt-4 first:mt-0")}>
      {speaker && (
        <div className="mb-1 flex items-center gap-2 px-2">
          <ParticipantAvatar person={speaker} className="size-5 text-[9px] ring-0" />
          <span className="text-sm font-medium" style={{ color: speaker.color }}>
            {speaker.displayName}
          </span>
        </div>
      )}
      <div
        onClick={onClick}
        className={cn(
          "group flex cursor-pointer gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/60",
          active && "bg-primary/10 hover:bg-primary/15",
        )}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSeek(seg.startMs);
          }}
          className={cn(
            "mt-0.5 w-12 shrink-0 text-left text-xs text-muted-foreground tabular-nums hover:text-foreground hover:underline",
            active && "font-medium text-primary",
          )}
        >
          {formatTimestamp(seg.startMs)}
        </button>
        <p className={cn("text-sm leading-relaxed text-foreground/80", active && "text-foreground")}>
          {needle ? <Highlighted text={seg.text} needle={needle} currentHit={currentHit} /> : seg.text}
        </p>
      </div>
    </div>
  );
});
