/** 3725000 → "1:02:05", 65000 → "1:05" */
export function formatTimestamp(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** 3725000 → "1h 2m", 65000 → "1m", 20000 → "<1m" */
export function formatDuration(ms: number | null | undefined) {
  if (!ms) return "—";
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "<1m";
  const h = Math.floor(mins / 60);
  return h > 0 ? `${h}h ${mins % 60}m` : `${mins}m`;
}

export function formatDate(d: Date) {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function initials(name: string) {
  const speaker = /^Speaker (\w+)$/.exec(name);
  if (speaker) return speaker[1];
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** "1:05" → 65000, "1:02:05" → 3725000, "90" → 90000; null if unparseable. Inverse of formatTimestamp. */
export function parseTimestamp(text: string) {
  const parts = text.trim().split(":");
  if (parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  return Math.round(parts.reduce((acc, p) => acc * 60 + Number(p), 0) * 1000);
}

/**
 * `?t=` value that lands inside the line starting at `ms`: seconds rounded *up* to 0.1 s, since flooring (33126 →
 * "33") would start playback just before the line and highlight the previous one.
 */
export function tParam(ms: number) {
  return String(Math.ceil(ms / 100) / 10);
}
