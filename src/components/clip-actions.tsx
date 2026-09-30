"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Link2, Link2Off, Loader2, MoreHorizontal, Trash2 } from "lucide-react";
import { deleteHighlight, revokeHighlightLink, shareHighlight } from "@/app/highlights/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Clip = { id: string; title: string; isProtected: boolean; shareToken: string | null };

/** Copy / disable the public clip link, and delete. Demo clips can be shared but not deleted or unshared. */
export function ClipActions({ clip }: { clip: Clip }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const copyLink = () =>
    startTransition(async () => {
      const res = await shareHighlight(clip.id);
      if (!res.ok) return void toast.error(res.error);
      const url = `${location.origin}/share/clip/${res.token}`;
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Clip link copied");
      } catch {
        toast.message("Couldn't copy automatically", { description: url });
      }
    });

  const disable = () =>
    startTransition(async () => {
      const res = await revokeHighlightLink(clip.id);
      if (res.ok) toast.success("Public link disabled");
      else toast.error(res.error);
    });

  const remove = () =>
    startTransition(async () => {
      const res = await deleteHighlight(clip.id);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Clip deleted");
      setConfirming(false);
    });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${clip.title}`} />}>
          {pending ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={copyLink}>
            <Link2 /> {clip.shareToken ? "Copy public link" : "Create public link"}
          </DropdownMenuItem>
          {clip.shareToken && (
            <DropdownMenuItem onClick={disable} disabled={clip.isProtected}>
              <Link2Off /> Disable public link
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setConfirming(true)} disabled={clip.isProtected}>
            <Trash2 /> Delete clip
          </DropdownMenuItem>
          {clip.isProtected && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">Demo clips can&apos;t be deleted or unshared.</p>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this clip?</DialogTitle>
            <DialogDescription>The recording stays; only the clip and its public link are removed.</DialogDescription>
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
