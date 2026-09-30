import { Upload } from "lucide-react";
import { MeetingsBrowser } from "@/components/meetings-browser";
import { StatusPoller } from "@/components/status-poller";
import { UploadDialog } from "@/components/upload-dialog";
import { listMeetings } from "@/lib/queries";
import { dailyUploadLimit } from "@/lib/uploads";

export const metadata = { title: "My meetings · Notetaker" };

export default async function MeetingsPage() {
  const meetings = await listMeetings();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
      <StatusPoller meetings={meetings} />
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My meetings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {meetings.length} {meetings.length === 1 ? "recording" : "recordings"} · drop a file anywhere to upload
          </p>
        </div>
        <UploadDialog dailyLimit={dailyUploadLimit()} />
      </div>

      {meetings.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <Upload className="size-8 text-muted-foreground" />
          <p className="font-medium">Upload your first meeting</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Drop an audio or video recording anywhere on this page, or use Upload recording. You&apos;ll get a transcript,
            a summary and action items in a minute or two.
          </p>
        </div>
      ) : (
        <MeetingsBrowser meetings={meetings} />
      )}
    </div>
  );
}
