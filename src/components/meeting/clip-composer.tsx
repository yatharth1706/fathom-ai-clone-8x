"use client";

import { createContext, useCallback, useContext, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Play } from "lucide-react";
import { createHighlight } from "@/app/highlights/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatTimestamp, parseTimestamp } from "@/lib/format";
import { usePlayer } from "./player-context";

export type ClipDraft = { startMs: number; endMs: number; title?: string };

const Ctx = createContext<((draft: ClipDraft) => void) | null>(null);

/** Opens the "Create clip" dialog, or null where clips can't be made (public share pages). */
export function useClipComposer() {
  return useContext(Ctx);
}

export function ClipComposerProvider({
  meetingId,
  durationMs,
  children,
}: {
  meetingId: string;
  durationMs: number;
  children: React.ReactNode;
}) {
  const [draft, setDraft] = useState<ClipDraft | null>(null);
  const open = useCallback((d: ClipDraft) => setDraft(d), []);
  return (
    <Ctx.Provider value={open}>
      {children}
      <Dialog open={draft !== null} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent>
          {/* Keyed so each opening starts from its own draft. */}
          {draft && (
            <ClipForm
              key={`${draft.startMs}-${draft.endMs}`}
              meetingId={meetingId}
              durationMs={durationMs}
              draft={draft}
              onDone={() => setDraft(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  );
}

const field =
  "h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

function ClipForm({
  meetingId,
  durationMs,
  draft,
  onDone,
}: {
  meetingId: string;
  durationMs: number;
  draft: ClipDraft;
  onDone: () => void;
}) {
  const { playRange } = usePlayer();
  const [title, setTitle] = useState(draft.title ?? "");
  const [note, setNote] = useState("");
  const [start, setStart] = useState(formatTimestamp(draft.startMs));
  const [end, setEnd] = useState(formatTimestamp(Math.min(draft.endMs, durationMs)));
  const [pending, startTransition] = useTransition();

  const startMs = parseTimestamp(start);
  const endMs = parseTimestamp(end);
  const problem =
    startMs == null || endMs == null
      ? "Use times like 1:05 or 1:02:05"
      : endMs <= startMs
        ? "End must be after start"
        : endMs > durationMs + 999
          ? `The meeting ends at ${formatTimestamp(durationMs)}`
          : null;

  const save = () =>
    startTransition(async () => {
      if (problem || startMs == null || endMs == null) return;
      const res = await createHighlight({ meetingId, title, note, startMs, endMs: Math.min(endMs, durationMs) });
      if (!res.ok) return void toast.error(res.error);
      toast.success("Clip created. Find it under Highlights.");
      onDone();
    });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="grid gap-4"
    >
      <DialogHeader>
        <DialogTitle>Create clip</DialogTitle>
        <DialogDescription>A clip is a moment of this recording you can replay or share on its own.</DialogDescription>
      </DialogHeader>
      <label className="grid gap-1.5 text-sm">
        Title
        <input autoFocus value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} className={field} />
      </label>
      <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
        <label className="grid gap-1.5 text-sm">
          Start
          <input value={start} onChange={(e) => setStart(e.target.value)} inputMode="numeric" className={`${field} tabular-nums`} />
        </label>
        <label className="grid gap-1.5 text-sm">
          End
          <input value={end} onChange={(e) => setEnd(e.target.value)} inputMode="numeric" className={`${field} tabular-nums`} />
        </label>
        <Button
          type="button"
          variant="outline"
          disabled={!!problem}
          onClick={() => startMs != null && endMs != null && playRange(startMs, endMs)}
        >
          <Play /> Preview
        </Button>
      </div>
      {problem ? (
        <p className="-mt-2 text-xs text-destructive">{problem}</p>
      ) : (
        <p className="-mt-2 text-xs text-muted-foreground">Length {formatTimestamp(endMs! - startMs!)}</p>
      )}
      <label className="grid gap-1.5 text-sm">
        Note <span className="sr-only">(optional)</span>
        <textarea
          value={note}
          maxLength={500}
          rows={2}
          placeholder="Optional context for whoever watches it"
          onChange={(e) => setNote(e.target.value)}
          className="w-full resize-none rounded-md border bg-background px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        />
      </label>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
        <Button type="submit" disabled={pending || !!problem || !title.trim()}>
          {pending && <Loader2 className="animate-spin" />} Create clip
        </Button>
      </DialogFooter>
    </form>
  );
}
