"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const IN_PROGRESS = new Set(["uploaded", "transcribing", "analyzing"]);
const INTERVAL_MS = 3000;

/**
 * Polls `/api/meetings/[id]/status` for meetings still being processed and refreshes the server-rendered page when
 * any of them changes status. Locally (no webhooks) these polls are also what advance the pipeline.
 */
export function StatusPoller({ meetings }: { meetings: { id: string; status: string }[] }) {
  const router = useRouter();
  const pending = meetings.filter((m) => IN_PROGRESS.has(m.status));
  const key = pending.map((m) => `${m.id}:${m.status}`).join(",");

  useEffect(() => {
    if (!key) return;
    const known = new Map(key.split(",").map((kv) => kv.split(":") as [string, string]));
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      const results = await Promise.all(
        [...known.keys()].map((id) =>
          fetch(`/api/meetings/${id}/status`, { cache: "no-store" })
            .then((r) => (r.ok ? (r.json() as Promise<{ status: string }>) : null))
            .catch(() => null),
        ),
      );
      if (stopped) return;
      const ids = [...known.keys()];
      if (results.some((r, i) => r && r.status !== known.get(ids[i]))) return router.refresh(); // new props restart polling
      timer = setTimeout(tick, INTERVAL_MS);
    };
    timer = setTimeout(tick, INTERVAL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [key, router]);

  return null;
}
