"use client";

import { useEffect, useState } from "react";
import { Keyboard } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RATES, usePlayer } from "./player-context";

const SHORTCUTS = [
  ["Space or K", "Play / pause"],
  ["← / →", "Back / forward 5 seconds"],
  ["J / L", "Back / forward 15 seconds"],
  ["< / >", "Slower / faster (1–2×)"],
  ["/", "Search the transcript"],
  ["?", "Show these shortcuts"],
] as const;

function typingIn(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

function nextRate(rate: number, dir: 1 | -1) {
  const i = Math.max(0, RATES.indexOf(rate as (typeof RATES)[number]));
  return RATES[Math.min(RATES.length - 1, Math.max(0, i + dir))];
}

/** Global player shortcuts, plus the speed button and shortcut help shown under the player. */
export function PlayerShortcuts() {
  const { togglePlay, skip, rate, setRate, mediaRef } = usePlayer();
  const [help, setHelp] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typingIn(e.target)) return;
      // The native controls already handle keys while the video itself has focus.
      if (e.target === mediaRef.current) return;
      // Space on a focused button or link should still activate it.
      const onControl = e.target instanceof HTMLElement && !!e.target.closest("button, a, [role=button], [role=tab], [role=menuitem]");
      const actions: Record<string, (() => void) | undefined> = {
        " ": onControl ? undefined : togglePlay,
        k: togglePlay,
        ArrowLeft: () => skip(-5000),
        ArrowRight: () => skip(5000),
        j: () => skip(-15000),
        l: () => skip(15000),
        "<": () => setRate(nextRate(rate, -1)),
        ">": () => setRate(nextRate(rate, 1)),
        "?": () => setHelp(true),
      };
      const action = actions[e.key];
      if (!action) return;
      e.preventDefault();
      action();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, skip, rate, setRate, mediaRef]);

  return (
    <div className="flex items-center gap-0.5">
      <button
        onClick={() => setRate(RATES[(Math.max(0, RATES.indexOf(rate as (typeof RATES)[number])) + 1) % RATES.length])}
        className="rounded px-1.5 py-0.5 text-xs font-medium tabular-nums hover:bg-muted"
        title="Playback speed (< and >)"
        aria-label={`Playback speed ${rate}×`}
      >
        {rate}×
      </button>
      <button
        onClick={() => setHelp(true)}
        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        title="Keyboard shortcuts (?)"
        aria-label="Keyboard shortcuts"
      >
        <Keyboard className="size-3.5" />
      </button>
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
          </DialogHeader>
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
            {SHORTCUTS.map(([keys, what]) => (
              <div key={keys} className="contents">
                <dt>
                  <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">{keys}</kbd>
                </dt>
                <dd className="text-muted-foreground">{what}</dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>
    </div>
  );
}
