"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileAudio, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { uploadProblem } from "@/lib/upload-limits";
import { cn } from "@/lib/utils";

type Phase =
  | { kind: "idle" }
  | { kind: "checking"; name: string }
  | { kind: "uploading"; name: string; pct: number }
  | { kind: "starting"; name: string }
  | { kind: "error"; message: string };

/** Duration from the file's own metadata, or null if the browser can't tell (the server re-checks after ASR). */
function readDurationMs(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const el = document.createElement(file.type.startsWith("audio/") ? "audio" : "video");
    const url = URL.createObjectURL(file);
    const done = (ms: number | null) => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      el.removeAttribute("src");
      resolve(ms);
    };
    const timer = setTimeout(() => done(null), 10_000);
    el.preload = "metadata";
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? Math.round(el.duration * 1000) : null);
    el.onerror = () => done(null);
    el.src = url;
  });
}

function put(url: string, file: File, headers: Record<string, string>, onProgress: (pct: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Storage returned ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("Network error while uploading"));
    xhr.send(file);
  });
}

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export function UploadDialog({ dailyLimit }: { dailyLimit: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  const busy = phase.kind === "checking" || phase.kind === "uploading" || phase.kind === "starting";

  async function upload(file: File) {
    setPhase({ kind: "checking", name: file.name });
    const durationMs = await readDurationMs(file);
    const problem = uploadProblem({ size: file.size, type: file.type, durationMs });
    if (problem) return setPhase({ kind: "error", message: problem });

    let meetingId: string | undefined;
    let uploaded = false;
    try {
      const signed = await postJson<{ meetingId: string; uploadUrl: string; headers: Record<string, string> }>(
        "/api/uploads/sign",
        { filename: file.name, contentType: file.type, size: file.size, durationMs },
      );
      meetingId = signed.meetingId;
      setPhase({ kind: "uploading", name: file.name, pct: 0 });
      await put(signed.uploadUrl, file, signed.headers, (pct) => setPhase({ kind: "uploading", name: file.name, pct }));
      uploaded = true;
      setPhase({ kind: "starting", name: file.name });
      await postJson(`/api/meetings/${meetingId}/process`);
      router.push(`/meetings/${meetingId}`);
      setOpen(false);
      setPhase({ kind: "idle" });
    } catch (e) {
      // Let the server mark a half-created meeting as failed right away (it finds no object in storage).
      if (meetingId && !uploaded) void fetch(`/api/meetings/${meetingId}/process`, { method: "POST" });
      setPhase({ kind: "error", message: e instanceof Error ? e.message : "Upload failed" });
      router.refresh();
    }
  }

  function pick(files: FileList | null) {
    const file = files?.[0];
    if (file && !busy) void upload(file);
  }

  // Drop a file anywhere on the page: show an overlay while dragging, then open the dialog and upload.
  const [pageDrag, setPageDrag] = useState(false);
  const latest = useRef({ busy, upload });
  useEffect(() => {
    latest.current = { busy, upload };
  });
  useEffect(() => {
    let depth = 0; // dragenter/leave fire for every child element crossed
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files");
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setPageDrag(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setPageDrag(false);
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault(); // allow dropping
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setPageDrag(false);
      const file = e.dataTransfer?.files[0];
      if (!file || latest.current.busy) return;
      setOpen(true);
      void latest.current.upload(file);
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  return (
    <>
      {pageDrag && !open && (
        <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-background/80 p-6 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-link px-12 py-10 text-center">
            <Upload className="size-8 text-link" />
            <p className="font-medium">Drop to upload</p>
            <p className="text-sm text-muted-foreground">Audio or video, up to 15 minutes and 100 MB</p>
          </div>
        </div>
      )}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (busy) return; // keep the dialog up until the upload has been handed off
          setOpen(next);
          if (!next) setPhase({ kind: "idle" });
        }}
      >
        <DialogTrigger render={<Button />}>
          <Upload /> Upload recording
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload a recording</DialogTitle>
            <DialogDescription>
              It goes through the same pipeline a meeting bot would feed: transcript, speakers, summary and action items.
            </DialogDescription>
          </DialogHeader>

          {busy ? (
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-3">
                <FileAudio className="size-5 shrink-0 text-muted-foreground" />
                <p className="min-w-0 flex-1 truncate text-sm font-medium">{phase.name}</p>
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${phase.kind === "uploading" ? phase.pct : phase.kind === "starting" ? 100 : 0}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">
                {phase.kind === "checking" && "Checking the file…"}
                {phase.kind === "uploading" && `Uploading… ${phase.pct}%`}
                {phase.kind === "starting" && "Starting transcription…"}
              </p>
            </div>
          ) : (
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation(); // the page-wide drop handler would upload it a second time
                setDragging(false);
                pick(e.dataTransfer.files);
              }}
              className={cn(
                "flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-10 text-center transition-colors hover:bg-muted/50",
                dragging && "border-primary bg-muted/50",
              )}
            >
              <Upload className="size-6 text-muted-foreground" />
              <span className="text-sm font-medium">Drop a file here, or click to choose</span>
              <span className="text-xs text-muted-foreground">
                Audio or video · up to 15 minutes and 100 MB · {dailyLimit} uploads per day
              </span>
              <input
                type="file"
                accept="audio/*,video/*"
                className="sr-only"
                onChange={(e) => {
                  pick(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          )}

          {phase.kind === "error" && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {phase.message}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
