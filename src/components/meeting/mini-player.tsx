"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Pause, Play, RotateCcw, RotateCw } from "lucide-react";
import { formatTimestamp } from "@/lib/format";
import { useCurrentMs } from "./meeting-timeline";
import { usePlayer } from "./player-context";

/**
 * Desktop only: once the video scrolls out of view in the notes column, a compact player (play/pause, ±15 s,
 * a draggable scrubber, back to video) takes its place above the pinned tab bar. On phones the video itself is
 * sticky, so this stays hidden.
 */
export function MiniPlayer({ durationMs }: { durationMs: number }) {
  const { mediaRef, playing, togglePlay, skip } = usePlayer();
  const nowMs = useCurrentMs(mediaRef);
  const [videoVisible, setVideoVisible] = useState(true);
  // While scrubbing, and until the media confirms the seek, the thumb shows this instead of the media time;
  // otherwise it would flick back to the old time for a moment after release.
  const [dragMs, setDragMs] = useState<number | null>(null);
  const dragging = useRef(false);
  const [hoverMs, setHoverMs] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVideoVisible(e.intersectionRatio > 0.25), { threshold: [0, 0.25, 1] });
    io.observe(el);
    return () => io.disconnect();
  }, [mediaRef]);

  if (videoVisible) return null;

  const msAt = (clientX: number) => {
    const r = barRef.current!.getBoundingClientRect();
    return Math.round(Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * durationMs);
  };
  const seek = (ms: number) => {
    const el = mediaRef.current;
    if (el) el.currentTime = ms / 1000; // keeps play/pause state, like the native scrubber
  };
  const shownMs = dragMs ?? nowMs;
  const pct = (ms: number) => `${Math.min(100, (ms / Math.max(1, durationMs)) * 100)}%`;

  return (
    <div className="mb-1 flex items-center gap-2 rounded-lg border bg-background px-2 py-1.5 shadow-sm max-lg:hidden">
      <button
        onClick={() => skip(-15000)}
        aria-label="Back 15 seconds"
        title="Back 15 s (J)"
        className="grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <RotateCcw className="size-3.5" />
      </button>
      <button
        onClick={togglePlay}
        aria-label={playing ? "Pause" : "Play"}
        className="grid size-7 place-items-center rounded-full bg-foreground text-background transition-opacity hover:opacity-85"
      >
        {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5 translate-x-px" />}
      </button>
      <button
        onClick={() => skip(15000)}
        aria-label="Forward 15 seconds"
        title="Forward 15 s (L)"
        className="grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <RotateCw className="size-3.5" />
      </button>

      {/* Scrubber: click or drag anywhere on it; arrow keys step 5 s. The hit area is taller than the visible bar. */}
      <div
        ref={barRef}
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(durationMs / 1000)}
        aria-valuenow={Math.round(shownMs / 1000)}
        aria-valuetext={formatTimestamp(shownMs)}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          dragging.current = true;
          setDragMs(msAt(e.clientX));
        }}
        onPointerMove={(e) => {
          const ms = msAt(e.clientX);
          setHoverMs(ms);
          if (dragging.current) setDragMs(ms);
        }}
        onPointerUp={(e) => {
          if (!dragging.current) return;
          dragging.current = false;
          const ms = msAt(e.clientX);
          setDragMs(ms);
          const el = mediaRef.current;
          if (!el) return setDragMs(null);
          const release = () => {
            clearTimeout(fallback);
            if (!dragging.current) setDragMs(null);
          };
          const fallback = setTimeout(release, 3000); // in case "seeked" never fires (e.g. media error)
          el.addEventListener("seeked", release, { once: true });
          seek(ms);
        }}
        onPointerCancel={() => {
          dragging.current = false;
          setDragMs(null);
        }}
        onPointerLeave={() => setHoverMs(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            e.stopPropagation(); // don't also trigger the page-wide ←/→ shortcut
            skip(e.key === "ArrowRight" ? 5000 : -5000);
          }
        }}
        className="group relative flex h-6 flex-1 cursor-pointer touch-none items-center"
      >
        <div className="relative h-1 w-full rounded-full bg-muted transition-[height] group-hover:h-1.5">
          <div className="absolute inset-y-0 left-0 rounded-full bg-link" style={{ width: pct(shownMs) }} />
          {hoverMs != null && dragMs == null && (
            <div className="absolute inset-y-0 w-px bg-foreground/40" style={{ left: pct(hoverMs) }} />
          )}
        </div>
        <div
          className="absolute size-3 -translate-x-1/2 rounded-full border-2 border-background bg-link shadow opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 data-[dragging=true]:opacity-100"
          data-dragging={dragMs != null}
          style={{ left: pct(shownMs) }}
        />
        {(dragMs ?? hoverMs) != null && (
          <span
            className="pointer-events-none absolute -top-6 -translate-x-1/2 rounded bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background tabular-nums"
            style={{ left: pct((dragMs ?? hoverMs)!) }}
          >
            {formatTimestamp((dragMs ?? hoverMs)!)}
          </span>
        )}
      </div>

      {/* Fixed width: if "0:05" growing to "36:02" resized the scrubber mid-drag, the same pointer x would map to a
          different time on release. */}
      <span
        className="shrink-0 text-right text-xs text-muted-foreground tabular-nums"
        style={{ minWidth: `${formatTimestamp(durationMs).length * 2 + 3}ch` }}
      >
        {formatTimestamp(shownMs)} / {formatTimestamp(durationMs)}
      </span>
      <button
        onClick={() => mediaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}
        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <ArrowUp className="size-3" /> Video
      </button>
    </div>
  );
}
