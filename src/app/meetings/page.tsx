import { Video } from "lucide-react";

export default function MeetingsPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">My meetings</h1>
      <div className="mt-10 flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
        <Video className="size-8 text-muted-foreground" />
        <p className="font-medium">No meetings yet</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Recorded meetings will appear here with transcripts, summaries and action items.
        </p>
      </div>
    </div>
  );
}
