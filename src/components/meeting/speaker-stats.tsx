"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Combine, ListFilter, MoreHorizontal, Pencil, Sparkles } from "lucide-react";
import { mergeSpeakers, renameSpeaker, type ActionResult } from "@/app/meetings/[id]/actions";
import { ParticipantAvatar } from "@/components/participant-stack";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDuration } from "@/lib/format";
import type { Participant } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { useSpeakerFilter } from "./speaker-filter";

export function SpeakerStats({
  meetingId,
  participants,
  canMerge,
  readOnly = false,
}: {
  meetingId: string;
  participants: Participant[];
  /** False on protected demo meetings: merging can't be undone without a reseed. */
  canMerge: boolean;
  /** Public share view: talk time only, no editing. */
  readOnly?: boolean;
}) {
  const total = participants.reduce((sum, p) => sum + p.talkMs, 0) || 1;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const filter = useSpeakerFilter();

  const run = (action: () => Promise<ActionResult>, success: string) =>
    startTransition(async () => {
      const res = await action();
      if (res.ok) toast.success(success);
      else toast.error(res.error);
    });

  return (
    <ul className={cn("space-y-1", pending && "opacity-60")}>
      {participants.map((p) => {
        const pct = Math.round((p.talkMs / total) * 100);
        const others = participants.filter((o) => o.id !== p.id);
        return (
          <li
            key={p.id}
            className={cn("group flex items-center gap-3 rounded-md px-1 py-1.5", !filter.isShown(p.id) && "opacity-50")}
          >
            <ParticipantAvatar person={p} className="ring-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2 text-sm">
                {editingId === p.id ? (
                  <RenameInput
                    initial={p.isNameGuessed || !/^Speaker \w+$/.test(p.displayName) ? p.displayName : ""}
                    onDone={(name) => {
                      setEditingId(null);
                      if (name !== null && name !== p.displayName)
                        run(() => renameSpeaker(meetingId, p.id, name), `Renamed to ${name}`);
                    }}
                  />
                ) : (
                  <span className="flex min-w-0 items-center gap-1.5">
                    {readOnly ? (
                      <span className="truncate">{p.displayName}</span>
                    ) : (
                      <button
                        onClick={() => setEditingId(p.id)}
                        className="truncate text-left hover:underline"
                        title="Rename speaker"
                      >
                        {p.displayName}
                      </button>
                    )}
                    {p.isNameGuessed && !readOnly && (
                      <span
                        title="Name suggested by AI from the conversation. Rename to confirm or correct it."
                        className="inline-flex shrink-0 items-center gap-0.5 rounded bg-muted px-1 py-px text-[10px] text-muted-foreground"
                      >
                        <Sparkles className="size-2.5" /> AI guess
                      </span>
                    )}
                  </span>
                )}
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {pct}% · {formatDuration(p.talkMs)}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: p.color }} />
              </div>
            </div>

            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => filter.toggle(p.id)}
              aria-pressed={filter.selected.has(p.id)}
              title={filter.selected.has(p.id) ? "Stop filtering by this speaker" : "Show only this speaker in the transcript"}
              className={cn(
                "opacity-60 group-hover:opacity-100",
                filter.selected.has(p.id) && "bg-muted text-foreground opacity-100",
              )}
            >
              <ListFilter />
            </Button>
            {!readOnly && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="opacity-60 group-hover:opacity-100 aria-expanded:opacity-100"
                      aria-label={`Actions for ${p.displayName}`}
                    />
                  }
                >
                  <MoreHorizontal />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onClick={() => setEditingId(p.id)}>
                    <Pencil /> Rename
                  </DropdownMenuItem>
                  {others.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      {canMerge ? (
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>
                            <Combine /> Merge into…
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent className="w-52">
                            <DropdownMenuGroup>
                              <DropdownMenuLabel>Same person as</DropdownMenuLabel>
                              {others.map((o) => (
                                <DropdownMenuItem
                                  key={o.id}
                                  onClick={() =>
                                    run(() => mergeSpeakers(meetingId, p.id, o.id), `Merged ${p.displayName} into ${o.displayName}`)
                                  }
                                >
                                  <ParticipantAvatar person={o} className="size-4 text-[8px] ring-0" />
                                  <span className="truncate">{o.displayName}</span>
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuGroup>
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      ) : (
                        <DropdownMenuItem disabled>
                          <Combine /> Merge (disabled on demo meetings)
                        </DropdownMenuItem>
                      )}
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function RenameInput({ initial, onDone }: { initial: string; onDone: (name: string | null) => void }) {
  const [value, setValue] = useState(initial);
  // Enter and blur both commit; the flag stops blur from committing again after Enter/Escape unmounts us.
  const closed = useRef(false);
  const finish = (name: string | null) => {
    if (closed.current) return;
    closed.current = true;
    onDone(name?.trim() ? name.trim() : null);
  };
  return (
    <input
      autoFocus
      value={value}
      maxLength={60}
      placeholder="Speaker name"
      onChange={(e) => setValue(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={() => finish(value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish(value);
        if (e.key === "Escape") finish(null);
      }}
      className="h-6 min-w-0 flex-1 rounded border bg-background px-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    />
  );
}
