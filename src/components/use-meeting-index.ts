"use client";

import { useEffect, useState } from "react";

export type IndexedMeeting = { id: string; title: string; startedAt: string; status: string };

/** Recent meetings for navigation UI. Refetched whenever `key` changes (e.g. the route), so new uploads show up. */
export function useMeetingIndex(key: unknown, enabled = true) {
  const [meetings, setMeetings] = useState<IndexedMeeting[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch("/api/meetings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { meetings: IndexedMeeting[] } | null) => !cancelled && d && setMeetings(d.meetings))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [key, enabled]);
  return meetings;
}
