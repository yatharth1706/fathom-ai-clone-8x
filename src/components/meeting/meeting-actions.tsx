"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { deleteMeeting, renameMeeting } from "@/app/meetings/[id]/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Rename / delete. On protected demo meetings both are shown disabled (and refused server-side). */
export function MeetingActions({ meetingId, title, isProtected }: { meetingId: string; title: string; isProtected: boolean }) {
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);
  const [draft, setDraft] = useState(title);
  const [pending, startTransition] = useTransition();
  const close = () => setDialog(null);

  const rename = () =>
    startTransition(async () => {
      const res = await renameMeeting(meetingId, draft);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Meeting renamed");
      close();
    });

  // On success the action redirects to /meetings, so only failures come back.
  const remove = () =>
    startTransition(async () => {
      const res = await deleteMeeting(meetingId);
      if (res && !res.ok) toast.error(res.error);
    });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="icon-sm" aria-label="Meeting actions" />}>
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            disabled={isProtected}
            onClick={() => {
              setDraft(title);
              setDialog("rename");
            }}
          >
            <Pencil /> Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" disabled={isProtected} onClick={() => setDialog("delete")}>
            <Trash2 /> Delete meeting
          </DropdownMenuItem>
          {isProtected && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              Demo meetings can&apos;t be renamed or deleted. Upload your own to try these.
            </p>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog === "rename"} onOpenChange={(open) => !open && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename meeting</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              rename();
            }}
            className="grid gap-4"
          >
            <input
              autoFocus
              value={draft}
              maxLength={120}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="Meeting title"
              className="h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
            <DialogFooter>
              <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
              <Button type="submit" disabled={pending || !draft.trim()}>
                {pending && <Loader2 className="animate-spin" />} Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "delete"} onOpenChange={(open) => !open && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this meeting?</DialogTitle>
            <DialogDescription>
              The recording, transcript, notes and share links will be permanently deleted. Anyone with a link will lose access.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button variant="destructive" onClick={remove} disabled={pending}>
              {pending && <Loader2 className="animate-spin" />} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
