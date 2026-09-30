"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { formatTimestamp } from "@/lib/format";
import { cn } from "@/lib/utils";

type Seg = { idx: number; participantId: string; startMs: number; endMs: number; text: string };
type Person = { id: string; displayName: string; color: string };

/**
 * Plays only [startMs, endMs] of the meeting's media: playback stops at the end, seeks are clamped, and the
 * controls and transcript are relative to the clip. The media file itself is the full recording (no transcoding).
 */
export function ClipPlayer({
  src,
  poster,
  startMs,
  endMs,
  segments,
  participants,
  className,
}: {
  src: string;
  poster?: string | null;
  startMs: number;
  endMs: number;
  segments: Seg[];
  participants: Person[];
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [ms, setMs] = useState(startMs);
  const [playing, setPlaying] = useState(false);
  const length = endMs - startMs;
  const byId = new Map(participants.map((p) => [p.id, p]));

  const seek = useCallback(
    (to: number) => {
      const el = ref.current;
      if (!el) return;
      el.currentTime = Math.min(Math.max(to, startMs), endMs) / 1000;
      setMs(el.currentTime * 1000);
    },
    [startMs, endMs],
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const tick = () => {
      const t = el.currentTime * 1000;
      if (t >= endMs) {
        el.pause();
        el.currentTime = endMs / 1000;
      }
      setMs(Math.min(t, endMs));
      if (!el.paused) raf = requestAnimationFrame(tick);
    };
    const onPlay = () => {
      if (el.currentTime * 1000 >= endMs - 50) el.currentTime = startMs / 1000; // replay from the top
      setPlaying(true);
      raf = requestAnimationFrame(tick);
    };
    const onPause = () => {
      setPlaying(false);
      cancelAnimationFrame(raf);
    };
    const onLoaded = () => {
      const t = el.currentTime * 1000;
      if (t < startMs || t > endMs) el.currentTime = startMs / 1000;
    };
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("loadedmetadata", onLoaded);
    if (el.readyState >= 1) onLoaded();
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("loadedmetadata", onLoaded);
    };
  }, [startMs, endMs]);

  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => {});
    else el.pause();
  };
  const ended = !playing && ms >= endMs - 50;

  return (
    <div className={className}>
      <div className="overflow-hidden rounded-xl bg-black">
        <video
          ref={ref}
          src={`${src}#t=${startMs / 1000},${endMs / 1000}`}
          poster={poster ?? undefined}
          playsInline
          preload="metadata"
          onClick={toggle}
          className="aspect-video w-full cursor-pointer"
        />
        <div className="flex items-center gap-3 bg-black px-3 py-2 text-white">
          <button onClick={toggle} aria-label={playing ? "Pause" : ended ? "Replay" : "Play"} className="rounded p-1 hover:bg-white/10">
            {playing ? <Pause className="size-4" /> : ended ? <RotateCcw className="size-4" /> : <Play className="size-4" />}
          </button>
          <div
            role="slider"
            aria-label="Clip position"
            aria-valuemin={0}
            aria-valuemax={Math.round(length / 1000)}
            aria-valuenow={Math.round((ms - startMs) / 1000)}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") seek(ms + 5000);
              if (e.key === "ArrowLeft") seek(ms - 5000);
            }}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              seek(startMs + ((e.clientX - r.left) / r.width) * length);
            }}
            className="relative h-1.5 flex-1 cursor-pointer rounded-full bg-white/25"
          >
            <div className="h-full rounded-full bg-white" style={{ width: `${((ms - startMs) / length) * 100}%` }} />
          </div>
          <span className="text-xs tabular-nums">
            {formatTimestamp(ms - startMs)} / {formatTimestamp(length)}
          </span>
        </div>
      </div>

      {segments.length > 0 && (
        <div className="mt-5 space-y-3">
          {segments.map((s) => {
            const who = byId.get(s.participantId);
            const active = ms >= s.startMs && ms < s.endMs;
            return (
              <button
                key={s.idx}
                onClick={() => {
                  seek(s.startMs);
                  void ref.current?.play().catch(() => {});
                }}
                className={cn("block w-full rounded-md px-2 py-1.5 text-left hover:bg-muted/60", active && "bg-primary/10 hover:bg-primary/15")}
              >
                <span className="text-sm font-medium" style={{ color: who?.color }}>
                  {who?.displayName ?? "Speaker"}
                </span>
                <span className="ml-2 text-xs text-muted-foreground tabular-nums">{formatTimestamp(Math.max(0, s.startMs - startMs))}</span>
                <span className="mt-0.5 block text-sm leading-relaxed text-foreground/85">{s.text}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
