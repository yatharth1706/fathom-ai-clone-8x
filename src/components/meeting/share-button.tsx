"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Copy, Link2, Loader2, Lock, Share2 } from "lucide-react";
import { createShareLink, revokeShareLink } from "@/app/meetings/[id]/actions";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { formatTimestamp } from "@/lib/format";
import { usePlayer } from "./player-context";

type Link = { token: string; isProtected: boolean; viewCount: number };

export function ShareButton({ meetingId, link }: { meetingId: string; link: Link | null }) {
  return (
    <Popover>
      <PopoverTrigger render={<Button size="sm" />}>
        <Share2 /> Share
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-3 p-3">
        <PopoverHeader>
          <PopoverTitle>Share meeting</PopoverTitle>
          <PopoverDescription>Anyone with the link can watch the recording and read the transcript and notes.</PopoverDescription>
        </PopoverHeader>
        {/* Keyed so a new link resets the copy/at-time state. */}
        <ShareBody key={link?.token ?? "none"} meetingId={meetingId} link={link} />
      </PopoverContent>
    </Popover>
  );
}

function ShareBody({ meetingId, link }: { meetingId: string; link: Link | null }) {
  const { currentMs } = usePlayer();
  const [pending, startTransition] = useTransition();
  const [atTime, setAtTime] = useState(false);
  const [copied, setCopied] = useState(false);
  // Read once when the popover opens: the checkbox offers "the moment you're sharing from".
  const [nowMs] = useState(() => Math.floor(currentMs()));

  // Popover content only renders on the client after opening, so `location` is safe here.
  const urlFor = (token: string) =>
    `${location.origin}/share/m/${token}${atTime && nowMs >= 1000 ? `?t=${Math.floor(nowMs / 1000)}` : ""}`;

  // Clipboard access can be refused (permissions, unfocused tab); the link stays visible to copy by hand.
  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(urlFor(token));
    } catch {
      toast.message("Couldn't copy automatically. Select the link to copy it.");
      return;
    }
    setCopied(true);
    toast.success("Link copied");
    setTimeout(() => setCopied(false), 1500);
  }

  if (!link)
    return (
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await createShareLink(meetingId);
            if (!res.ok || !res.token) return void toast.error(res.ok ? "Could not create link" : res.error);
            await copy(res.token);
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : <Link2 />} Create public link
      </Button>
    );

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        <input
          readOnly
          value={urlFor(link.token)}
          onFocus={(e) => e.target.select()}
          aria-label="Share link"
          className="h-8 min-w-0 flex-1 rounded-md border bg-muted/40 px-2 text-xs text-muted-foreground outline-none"
        />
        <Button size="sm" onClick={() => copy(link.token)}>
          {copied ? <Check /> : <Copy />} Copy
        </Button>
      </div>

      {nowMs >= 1000 && (
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={atTime} onChange={(e) => setAtTime(e.target.checked)} className="accent-primary" />
          Start at {formatTimestamp(nowMs)}
        </label>
      )}

      <div className="flex items-center justify-between border-t pt-2.5 text-xs text-muted-foreground">
        <span>
          {link.viewCount} {link.viewCount === 1 ? "view" : "views"}
        </span>
        {link.isProtected ? (
          <span className="inline-flex items-center gap-1" title="Demo meetings keep their public link so reviewers can always open it.">
            <Lock className="size-3" /> Demo link · can&apos;t be revoked
          </span>
        ) : (
          <Button
            variant="ghost"
            size="xs"
            className="text-destructive hover:text-destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await revokeShareLink(meetingId, link.token);
                if (res.ok) toast.success("Link revoked. It no longer works.");
                else toast.error(res.error);
              })
            }
          >
            Revoke link
          </Button>
        )}
      </div>
    </div>
  );
}
