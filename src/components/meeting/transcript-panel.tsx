"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
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
  const { activeIdx, playing, seekTo } = usePlayer();
  const containerRef = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);
  const byId = new Map(participants.map((p) => [p.id, p]));

  const scrollToIdx = useCallback((idx: number, behavior: ScrollBehavior) => {
    const container = containerRef.current;
    const row = container?.querySelector<HTMLElement>(`[data-idx="${idx}"]`);
    if (!container || !row) return;
    // Keep the active line about a third of the way down, so upcoming lines stay visible.
    container.scrollTo({ top: row.offsetTop - container.clientHeight / 3, behavior });
  }, []);

  // Jump straight to the ?t= position on first render.
  useLayoutEffect(() => {
    if (activeIdx >= 0) scrollToIdx(activeIdx, "instant");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (follow && activeIdx >= 0) scrollToIdx(activeIdx, "smooth");
  }, [activeIdx, follow, scrollToIdx]);

  // Only real user input pauses following; our own programmatic scrolls don't fire these.
  const stopFollowing = useCallback(() => setFollow(false), []);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.target === containerRef.current) setFollow(false); // scrollbar drag
  };

  const onSeek = useCallback(
    (ms: number) => {
      setFollow(true);
      seekTo(ms);
    },
    [seekTo],
  );

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
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

const TranscriptRow = memo(function TranscriptRow({
  seg,
  speaker,
  active,
  onSeek,
}: {
  seg: Segment;
  speaker?: Participant;
  active: boolean;
  onSeek: (ms: number) => void;
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
        <p className={cn("text-sm leading-relaxed text-foreground/80", active && "text-foreground")}>{seg.text}</p>
      </div>
    </div>
  );
});
