import Link from "next/link";
import { Check, ChevronLeft, Loader2, TriangleAlert } from "lucide-react";
import { StatusPoller } from "@/components/status-poller";
import { formatDate, formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

type Status = "uploaded" | "transcribing" | "analyzing" | "ready" | "failed";

const STEPS = [
  { status: "uploaded", label: "Upload", detail: "Receiving the recording" },
  { status: "transcribing", label: "Transcribe", detail: "Speech to text and who spoke when. Usually under a minute or two." },
  { status: "analyzing", label: "Generate notes", detail: "Summary, action items, decisions and chapters" },
] as const;

/** Shown instead of the meeting page while an upload is processing, or when it failed. */
export function ProcessingView({
  meeting,
  actions,
}: {
  meeting: { id: string; title: string; startedAt: Date; durationMs: number | null; status: Status; error: string | null };
  actions?: React.ReactNode;
}) {
  const failed = meeting.status === "failed";
  const current = STEPS.findIndex((s) => s.status === meeting.status);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:px-8">
      <StatusPoller meetings={[meeting]} />
      <Link href="/meetings" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-3.5" /> My meetings
      </Link>
      <div className="mt-1 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">{meeting.title}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {formatDate(meeting.startedAt)} · {formatDuration(meeting.durationMs)}
          </p>
        </div>
        {actions}
      </div>

      {failed ? (
        <div role="alert" className="mt-8 flex gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
          <div className="text-sm">
            <p className="font-medium">This recording couldn&apos;t be processed</p>
            <p className="mt-1 text-muted-foreground">{meeting.error ?? "Something went wrong."}</p>
            <p className="mt-3 text-muted-foreground">
              You can delete it from the menu above and{" "}
              <Link href="/meetings" className="underline underline-offset-2 hover:text-foreground">
                upload it again
              </Link>
              .
            </p>
          </div>
        </div>
      ) : (
        <ol className="mt-8 space-y-1 rounded-xl border p-2" aria-live="polite">
          {STEPS.map((step, i) => {
            const state = i < current ? "done" : i === current ? "active" : "todo";
            return (
              <li key={step.status} className={cn("flex gap-3 rounded-lg p-3", state === "active" && "bg-muted/60")}>
                <span
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full border text-xs",
                    state === "done" && "border-primary bg-primary text-primary-foreground",
                    state === "todo" && "text-muted-foreground",
                  )}
                >
                  {state === "done" ? <Check className="size-3.5" /> : state === "active" ? <Loader2 className="size-3.5 animate-spin" /> : i + 1}
                </span>
                <div className="text-sm">
                  <p className={cn("font-medium", state === "todo" && "text-muted-foreground")}>{step.label}</p>
                  {state === "active" && <p className="mt-0.5 text-muted-foreground">{step.detail}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {!failed && (
        <p className="mt-4 text-xs text-muted-foreground">
          You can leave this page; the meeting keeps processing and shows up in My meetings when it&apos;s ready.
        </p>
      )}
    </div>
  );
}
