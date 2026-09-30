"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

type SpeakerFilter = {
  /** Participant ids to show; empty means everyone. */
  selected: ReadonlySet<string>;
  isShown: (participantId: string) => boolean;
  toggle: (participantId: string) => void;
  clear: () => void;
};

const Ctx = createContext<SpeakerFilter | null>(null);

export function useSpeakerFilter() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSpeakerFilter must be used inside <SpeakerFilterProvider>");
  return ctx;
}

/** Shared by the transcript chips, talk-time list and timeline lanes, so filtering in one place shows everywhere. */
export function SpeakerFilterProvider({ children }: { children: React.ReactNode }) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const toggle = useCallback(
    (id: string) =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (!next.delete(id)) next.add(id);
        return next;
      }),
    [],
  );
  const clear = useCallback(() => setSelected(new Set()), []);
  const value = useMemo(
    () => ({ selected, isShown: (id: string) => selected.size === 0 || selected.has(id), toggle, clear }),
    [selected, toggle, clear],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
