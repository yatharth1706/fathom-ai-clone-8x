"use client";

import { createContext, useContext, useState } from "react";
import { cn } from "@/lib/utils";

type PaneId = "notes" | "transcript";

const Ctx = createContext<{ pane: PaneId; setPane: (p: PaneId) => void } | null>(null);

/**
 * Below the lg breakpoint the meeting page shows one pane at a time (notes or transcript) under a sticky player.
 * From lg up both panes are always visible side by side, so this state has no effect there.
 */
export function MobilePanes({ children }: { children: React.ReactNode }) {
  const [pane, setPane] = useState<PaneId>("notes");
  return <Ctx.Provider value={{ pane, setPane }}>{children}</Ctx.Provider>;
}

export function PaneSwitch({ className }: { className?: string }) {
  const ctx = useContext(Ctx)!;
  return (
    <div role="tablist" aria-label="Meeting view" className={cn("grid grid-cols-2 rounded-lg bg-muted p-0.5 lg:hidden", className)}>
      {(["notes", "transcript"] as const).map((p) => (
        <button
          key={p}
          role="tab"
          aria-selected={ctx.pane === p}
          onClick={() => ctx.setPane(p)}
          className={cn(
            "rounded-md py-1.5 text-sm font-medium capitalize text-muted-foreground",
            ctx.pane === p && "bg-background text-foreground shadow-sm",
          )}
        >
          {p}
        </button>
      ))}
    </div>
  );
}

export function Pane({
  id,
  as: Tag = "div",
  className,
  children,
}: {
  id: PaneId;
  as?: "div" | "aside";
  className?: string;
  children: React.ReactNode;
}) {
  const ctx = useContext(Ctx)!;
  return <Tag className={cn(className, ctx.pane !== id && "max-lg:hidden")}>{children}</Tag>;
}
