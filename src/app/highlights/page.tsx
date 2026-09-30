import { Highlighter } from "lucide-react";
import { HighlightsGrid } from "@/components/highlights-grid";
import { listHighlights } from "@/lib/queries";

export const metadata = { title: "Highlights · Notetaker" };

export default async function HighlightsPage() {
  const clips = await listHighlights();
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Highlights</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {clips.length} {clips.length === 1 ? "clip" : "clips"} · select lines in any transcript to make one
      </p>

      {clips.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <Highlighter className="size-8 text-muted-foreground" />
          <p className="font-medium">No clips yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Open a meeting, select a few lines of the transcript and choose Create clip.
          </p>
        </div>
      ) : (
        <HighlightsGrid clips={clips} />
      )}
    </div>
  );
}
