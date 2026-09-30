"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { AudioLines, CircleCheck, ListTodo, Search, TriangleAlert, Video, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ParticipantStack } from "@/components/participant-stack";
import { formatDate, formatDuration } from "@/lib/format";
import type { MeetingListItem } from "@/lib/queries";
import { cn } from "@/lib/utils";

type Sort = "newest" | "oldest" | "longest";
const SORTS: { id: Sort; label: string }[] = [
  { id: "newest", label: "Newest" },
  { id: "oldest", label: "Oldest" },
  { id: "longest", label: "Longest" },
];
const STEPS = { uploaded: 1, transcribing: 2, analyzing: 3 } as const;
const STEP_LABEL = { uploaded: "Uploading", transcribing: "Transcribing", analyzing: "Writing notes" } as const;

/** The meetings list: processing uploads pinned on top, then a filterable, sortable list (grouped by month by date). */
export function MeetingsBrowser({ meetings }: { meetings: MeetingListItem[] }) {
  const [query, setQuery] = useState("");
  const [openOnly, setOpenOnly] = useState(false);
  const [sort, setSort] = useState<Sort>("newest");

  const processing = useMemo(() => meetings.filter((m) => m.status in STEPS), [meetings]);
  const done = useMemo(() => meetings.filter((m) => !(m.status in STEPS)), [meetings]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = done.filter(
      (m) =>
        (!openOnly || m.openActionItems > 0) &&
        (!q ||
          m.title.toLowerCase().includes(q) ||
          m.gist?.toLowerCase().includes(q) ||
          m.participants.some((p) => p.displayName.toLowerCase().includes(q))),
    );
    const by = {
      newest: (a: MeetingListItem, b: MeetingListItem) => +b.startedAt - +a.startedAt,
      oldest: (a: MeetingListItem, b: MeetingListItem) => +a.startedAt - +b.startedAt,
      longest: (a: MeetingListItem, b: MeetingListItem) => (b.durationMs ?? 0) - (a.durationMs ?? 0),
    }[sort];
    return [...list].sort(by);
  }, [done, query, openOnly, sort]);

  const filtered = query.trim() !== "" || openOnly;

  return (
    <div className="mt-6 space-y-6">
      {processing.length > 0 && (
        <section aria-label="Processing">
          <h2 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Processing</h2>
          <ul className="space-y-2">
            {processing.map((m) => {
              const step = STEPS[m.status as keyof typeof STEPS];
              return (
                <li key={m.id}>
                  <Link
                    href={`/meetings/${m.id}`}
                    className="block rounded-xl border bg-muted/30 p-3 transition-colors hover:bg-muted/60"
                  >
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate font-medium">{m.title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {STEP_LABEL[m.status as keyof typeof STEP_LABEL]} · step {step} of 3
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full animate-pulse rounded-full bg-link transition-[width] duration-700"
                        style={{ width: `${(step / 3) * 100 - 12}%` }}
                      />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {done.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by title, topic or speaker"
              aria-label="Filter meetings"
              className="h-8 w-full rounded-md border bg-background pr-2 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-search-cancel-button]:hidden"
            />
          </div>
          <button
            onClick={() => setOpenOnly((v) => !v)}
            aria-pressed={openOnly}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm transition-colors",
              openOnly ? "border-foreground bg-muted font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <ListTodo className="size-3.5" /> Open action items
          </button>
          <div role="radiogroup" aria-label="Sort" className="flex h-8 items-center rounded-md border p-0.5">
            {SORTS.map((s) => (
              <button
                key={s.id}
                role="radio"
                aria-checked={sort === s.id}
                onClick={() => setSort(s.id)}
                className={cn(
                  "h-full rounded px-2 text-xs transition-colors",
                  sort === s.id ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {done.length > 0 && shown.length === 0 && (
        <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          No meetings match.{" "}
          <button
            onClick={() => {
              setQuery("");
              setOpenOnly(false);
            }}
            className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-foreground"
          >
            <X className="size-3" /> Clear filters
          </button>
        </p>
      )}

      {/* Month headings only make sense when the list is in date order. */}
      {sort === "longest" ? (
        <MeetingList items={shown} eagerId={shown[0]?.id} />
      ) : (
        groupByMonth(shown).map(([month, items]) => (
          <section key={month}>
            <h2 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{month}</h2>
            <MeetingList items={items} eagerId={shown[0]?.id} />
          </section>
        ))
      )}
      {filtered && shown.length > 0 && (
        <p className="text-center text-xs text-muted-foreground">
          Showing {shown.length} of {done.length}
        </p>
      )}
    </div>
  );
}

function MeetingList({ items, eagerId }: { items: MeetingListItem[]; eagerId?: string }) {
  if (items.length === 0) return null;
  return (
    <ul className="divide-y overflow-hidden rounded-xl border">
      {items.map((m) => (
        <li key={m.id}>
          <MeetingRow meeting={m} eager={m.id === eagerId} />
        </li>
      ))}
    </ul>
  );
}

function MeetingRow({ meeting: m, eager }: { meeting: MeetingListItem; eager: boolean }) {
  return (
    <Link href={`/meetings/${m.id}`} className="flex items-center gap-3 p-2.5 transition-colors hover:bg-muted/50 sm:gap-4">
      <div className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-md bg-muted sm:w-28">
        {m.posterUrl ? (
          <Image src={m.posterUrl} alt="" fill sizes="112px" loading={eager ? "eager" : "lazy"} className="object-cover" />
        ) : (
          <div className="grid h-full place-items-center text-muted-foreground">
            {m.mediaKind === "audio" ? <AudioLines className="size-5" /> : <Video className="size-5" />}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium">{m.title}</p>
          {m.status === "failed" && (
            <Badge variant="destructive">
              <TriangleAlert /> Failed
            </Badge>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{formatDate(m.startedAt)}</span>
          {m.durationMs ? <span>· {formatDuration(m.durationMs)}</span> : null}
          {m.participants.length > 0 && <ParticipantStack participants={m.participants} className="ml-1" />}
        </div>
        {m.gist && <p className="mt-1 truncate text-sm text-muted-foreground">{m.gist}</p>}
      </div>

      {m.status === "ready" && (
        <span
          className={cn(
            "hidden shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs sm:flex",
            m.openActionItems > 0 ? "bg-link/10 text-link" : "text-muted-foreground",
          )}
          title={m.openActionItems > 0 ? "Open action items" : "No open action items"}
        >
          {m.openActionItems > 0 ? (
            <>
              <ListTodo className="size-3.5" /> {m.openActionItems} open
            </>
          ) : (
            <CircleCheck className="size-3.5" />
          )}
        </span>
      )}
    </Link>
  );
}

function groupByMonth(meetings: MeetingListItem[]) {
  const groups = new Map<string, MeetingListItem[]>();
  for (const m of meetings) {
    const key = m.startedAt.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  return [...groups.entries()];
}
