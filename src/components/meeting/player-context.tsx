"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

type Timed = { startMs: number };

type PlayerState = {
  mediaRef: React.RefObject<HTMLVideoElement | null>;
  /** Index into the segments array of the line being spoken, or -1 before the first line. */
  activeIdx: number;
  playing: boolean;
  /** Increments on every completed seek (scrubber or seekTo), so views can react to explicit navigation. */
  seekCount: number;
  /** Seek to a time and start playing. Every timestamp link in the app goes through this. */
  seekTo: (ms: number) => void;
  /** Play [startMs, endMs) and pause at the end (clips). Any other seek cancels the stop. */
  playRange: (startMs: number, endMs: number) => void;
  currentMs: () => number;
};

const PlayerContext = createContext<PlayerState | null>(null);

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used inside <PlayerProvider>");
  return ctx;
}

/** Last segment whose start is <= ms (segments are sorted by startMs). */
function findActive(segments: Timed[], ms: number) {
  let lo = 0;
  let hi = segments.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segments[mid].startMs <= ms) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

export function PlayerProvider({
  segments,
  initialMs,
  children,
}: {
  segments: Timed[];
  initialMs?: number;
  children: React.ReactNode;
}) {
  const mediaRef = useRef<HTMLVideoElement | null>(null);
  const [activeIdx, setActiveIdx] = useState(() => (initialMs ? findActive(segments, initialMs) : -1));
  const [playing, setPlaying] = useState(false);
  const [seekCount, setSeekCount] = useState(0);
  const range = useRef<{ startMs: number; endMs: number } | null>(null);

  const currentMs = useCallback(() => (mediaRef.current?.currentTime ?? 0) * 1000, []);
  // setState bails out when the value is unchanged, so this only re-renders on segment boundaries.
  const sync = useCallback(() => setActiveIdx(findActive(segments, currentMs())), [segments, currentMs]);

  const seek = useCallback(
    (ms: number, clip: { startMs: number; endMs: number } | null) => {
      const el = mediaRef.current;
      if (!el) return;
      range.current = clip;
      el.currentTime = ms / 1000;
      setActiveIdx(findActive(segments, ms));
      void el.play().catch(() => {}); // autoplay can be blocked; the seek still applies
    },
    [segments],
  );
  const seekTo = useCallback((ms: number) => seek(ms, null), [seek]);
  const playRange = useCallback((startMs: number, endMs: number) => seek(startMs, { startMs, endMs }), [seek]);

  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;
    let raf = 0;
    const loop = () => {
      sync();
      if (range.current && el.currentTime * 1000 >= range.current.endMs) {
        range.current = null;
        el.pause();
      }
      raf = requestAnimationFrame(loop);
    };
    const onPlay = () => {
      setPlaying(true);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    };
    const onPause = () => {
      setPlaying(false);
      cancelAnimationFrame(raf);
      sync();
    };
    const onSeeked = () => {
      // Scrubbing out of a playing clip means the viewer moved on; stop enforcing its end.
      const t = el.currentTime * 1000;
      if (range.current && (t < range.current.startMs - 500 || t > range.current.endMs)) range.current = null;
      sync();
      setSeekCount((n) => n + 1);
    };
    const onLoaded = () => {
      if (initialMs && el.currentTime === 0) el.currentTime = initialMs / 1000;
    };

    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onPause);
    el.addEventListener("seeked", onSeeked);
    el.addEventListener("loadedmetadata", onLoaded);
    if (el.readyState >= 1) onLoaded();
    // This effect re-runs when a refresh brings new props; if the media is already playing, keep the loop alive.
    if (!el.paused) raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onPause);
      el.removeEventListener("seeked", onSeeked);
      el.removeEventListener("loadedmetadata", onLoaded);
    };
  }, [sync, initialMs]);

  const value = useMemo(
    () => ({ mediaRef, activeIdx, playing, seekCount, seekTo, playRange, currentMs }),
    [activeIdx, playing, seekCount, seekTo, playRange, currentMs],
  );
  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}
