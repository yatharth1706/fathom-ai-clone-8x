"use client";

import { usePlayer } from "./player-context";

export function MeetingPlayer({ src, poster }: { src: string; poster?: string | null }) {
  const { mediaRef } = usePlayer();
  return (
    <div className="overflow-hidden rounded-xl bg-black">
      {/* <video> also plays audio-only files; the poster (if any) stands in for the picture. */}
      <video
        ref={mediaRef}
        src={src}
        poster={poster ?? undefined}
        controls
        playsInline
        preload="metadata"
        className="aspect-video w-full"
      />
    </div>
  );
}
