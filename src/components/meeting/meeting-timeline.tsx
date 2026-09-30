"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { formatTimestamp } from "@/lib/format";
import type { Chapter, Participant, Segment } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { usePlayer } from "./player-context";
import { PlayerShortcuts } from "./player-shortcuts";
import { useSpeakerFilter } from "./speaker-filter";

/** Gaps shorter than this between one speaker's lines are drawn as one block (fewer DOM nodes, easier to read). */
const MERGE_GAP_MS = 1500;

/**
 * Chapter bar and a combined speaker lane (expandable to one lane per speaker) under the player. Everything is positioned as a fraction of the meeting,
 * and clicking anywhere seeks there.
 */
export function MeetingTimeline({
  durationMs,
  chapters,
  participants,
  segments,
}: {
  durationMs: number;
  chapters: Chapter[];
  participants: Participant[];
  segments: Segment[];
}) {
  const { mediaRef, seekTo } = usePlayer();
  const { isShown, toggle, selected } = useSpeakerFilter();
  const nowMs = useCurrentMs(mediaRef);
  const [hoverMs, setHoverMs] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const pct = (ms: number) => `${Math.min(100, Math.max(0, (ms / durationMs) * 100))}%`;

  const lanes = useMemo(() => {
    const blocks = new Map<string, { startMs: number; endMs: number }[]>();
    for (const s of segments) {
      const list = blocks.get(s.participantId) ?? [];
      const last = list.at(-1);
      if (last && s.startMs - last.endMs < MERGE_GAP_MS) last.endMs = Math.max(last.endMs, s.endMs);
      else list.push({ startMs: s.startMs, endMs: s.endMs });
      blocks.set(s.participantId, list);
    }
    return participants.map((p) => ({ person: p, blocks: blocks.get(p.id) ?? [] }));
  }, [segments, participants]);

  const msAt = (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * durationMs);
  };
  const track = {
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => setHoverMs(msAt(e)),
    onPointerLeave: () => setHoverMs(null),
    onClick: (e: React.MouseEvent<HTMLDivElement>) => seekTo(msAt(e)),
  };

  const currentChapter = chapters.find((c) => nowMs >= c.startMs && nowMs < c.endMs);
  const hoverChapter = hoverMs != null ? chapters.find((c) => hoverMs >= c.startMs && hoverMs < c.endMs) : undefined;
  const showLanes = participants.length > 1;

  return (
    <div className="select-none">
      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
        <span className="min-w-0 truncate text-muted-foreground">
          {hoverMs != null ? (
            <>
              <span className="text-foreground tabular-nums">{formatTimestamp(hoverMs)}</span>
              {hoverChapter && <> · {hoverChapter.title}</>}
            </>
          ) : currentChapter ? (
            <>
              Chapter {currentChapter.idx + 1} of {chapters.length} ·{" "}
              <span className="text-foreground">{currentChapter.title}</span>
            </>
          ) : (
            "Timeline"
          )}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-muted-foreground tabular-nums">
            {formatTimestamp(nowMs)} / {formatTimestamp(durationMs)}
          </span>
          <PlayerShortcuts />
        </span>
      </div>

      <div className="grid grid-cols-[minmax(0,6.5rem)_1fr] items-center gap-x-2 gap-y-1">
        {chapters.length > 0 && (
          <>
            <span className="text-[11px] text-muted-foreground">Chapters</span>
            <div className="relative h-5 cursor-pointer" {...track} role="presentation">
              {chapters.map((c) => {
                const played = Math.min(1, Math.max(0, (nowMs - c.startMs) / Math.max(1, c.endMs - c.startMs)));
                return (
                  <div
                    key={c.idx}
                    title={c.title}
                    className={cn(
                      "absolute inset-y-1 overflow-hidden rounded-[3px] bg-muted-foreground/20 transition-[top,bottom]",
                      (hoverChapter ?? currentChapter)?.idx === c.idx && "inset-y-0.5",
                    )}
                    style={{ left: `calc(${pct(c.startMs)} + 1px)`, width: `calc(${pct(c.endMs - c.startMs)} - 2px)` }}
                  >
                    <div className="h-full bg-primary/70" style={{ width: `${played * 100}%` }} />
                  </div>
                );
              })}
              <Playhead left={pct(nowMs)} />
              {hoverMs != null && <Playhead left={pct(hoverMs)} ghost />}
            </div>
          </>
        )}

        {showLanes && (
          <>
            <button
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="flex items-center gap-0.5 text-left text-[11px] text-muted-foreground hover:text-foreground max-md:pointer-events-none"
            >
              <ChevronRight className={cn("size-3 shrink-0 transition-transform max-md:hidden", expanded && "rotate-90")} />
              {expanded ? "Speakers" : `${participants.length} speakers`}
            </button>
            {/* Everyone on one lane, each in their own color; expand for a lane per person. */}
            <div className="relative h-2.5 cursor-pointer rounded-sm bg-muted/60" {...track} role="presentation">
              {lanes.flatMap(({ person, blocks }) =>
                blocks.map((b, i) => (
                  <div
                    key={`${person.id}-${i}`}
                    title={person.displayName}
                    className="absolute inset-y-0 rounded-[1px]"
                    style={{
                      left: pct(b.startMs),
                      width: `max(1px, ${pct(b.endMs - b.startMs)})`,
                      backgroundColor: person.color,
                      opacity: isShown(person.id) ? 0.9 : 0.15,
                    }}
                  />
                )),
              )}
              <Playhead left={pct(nowMs)} />
            </div>
          </>
        )}

        {showLanes &&
          expanded &&
          lanes.map(({ person, blocks }) => {
            const on = isShown(person.id);
            return (
              // Per-person lanes are hidden on phones (too many rows); the transcript's speaker chips filter there.
              <div key={person.id} className="contents max-md:hidden">
                <button
                  onClick={() => toggle(person.id)}
                  aria-pressed={selected.has(person.id)}
                  title={selected.has(person.id) ? "Show everyone" : `Show only ${person.displayName} in the transcript`}
                  className={cn(
                    "truncate text-left text-[11px] hover:text-foreground",
                    selected.has(person.id) ? "font-medium text-foreground" : "text-muted-foreground",
                    !on && "opacity-50",
                  )}
                >
                  {person.displayName}
                </button>
                <div className="relative h-2.5 cursor-pointer rounded-sm bg-muted/60" {...track} role="presentation">
                  {blocks.map((b, i) => (
                    <div
                      key={i}
                      className="absolute inset-y-0 rounded-[1px]"
                      style={{
                        left: pct(b.startMs),
                        width: `max(1px, ${pct(b.endMs - b.startMs)})`,
                        backgroundColor: person.color,
                        opacity: on ? 0.9 : 0.2,
                      }}
                    />
                  ))}
                  <Playhead left={pct(nowMs)} />
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}

function Playhead({ left, ghost = false }: { left: string; ghost?: boolean }) {
  return (
    <div
      className={cn("pointer-events-none absolute -inset-y-0.5 w-0.5 -translate-x-1/2 rounded-full", ghost ? "bg-foreground/30" : "bg-foreground")}
      style={{ left }}
    />
  );
}

/** Media time, updated on timeupdate (~4×/s) and seeks; enough for a playhead without a render per frame. */
export function useCurrentMs(mediaRef: React.RefObject<HTMLVideoElement | null>) {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;
    const update = () => setMs(el.currentTime * 1000);
    update();
    el.addEventListener("timeupdate", update);
    el.addEventListener("seeked", update);
    el.addEventListener("loadedmetadata", update);
    return () => {
      el.removeEventListener("timeupdate", update);
      el.removeEventListener("seeked", update);
      el.removeEventListener("loadedmetadata", update);
    };
  }, [mediaRef]);
  return ms;
}
