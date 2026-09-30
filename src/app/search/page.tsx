import Link from "next/link";
import { Search } from "lucide-react";
import { formatDate, formatDuration, formatTimestamp, tParam } from "@/lib/format";
import { HIT_END, HIT_START, searchTranscripts } from "@/lib/queries";
import { cn } from "@/lib/utils";

export async function generateMetadata(props: PageProps<"/search">) {
  const { q } = await props.searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  return { title: query ? `“${query}” · Search · Notetaker` : "Search · Notetaker" };
}

const EXAMPLES = ["pull request", "board seats", "\"welcome message\"", "election -board"];
/** Hits shown per meeting before "Show all". */
const PREVIEW_HITS = 3;

type Params = { q: string; sort?: string; m?: string; all?: string };

/** Builds a /search URL, keeping the current query and filters unless overridden. */
function searchHref(base: Params, patch: Partial<Params>) {
  const p = { ...base, ...patch };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v) qs.set(k, v);
  return `/search?${qs}`;
}

export default async function SearchPage(props: PageProps<"/search">) {
  const sp = await props.searchParams;
  const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const query = str(sp.q)?.trim() ?? "";
  const sort = str(sp.sort) === "newest" ? "newest" : "relevance";
  const params: Params = { q: query, sort: sort === "newest" ? "newest" : undefined, m: str(sp.m), all: str(sp.all) };
  const result = query ? await searchTranscripts(query) : null;

  const groups = result
    ? [...result.meetings]
        .sort((a, b) => (sort === "newest" ? +b.startedAt - +a.startedAt : 0))
        .filter((m) => !params.m || m.id === params.m)
    : [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
      <form action="/search" className="relative mt-4">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          name="q"
          type="search"
          defaultValue={query}
          autoFocus
          placeholder="Search every transcript…"
          aria-label="Search every transcript"
          className="h-11 w-full rounded-lg border bg-background pr-3 pl-9 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        />
        {params.sort && <input type="hidden" name="sort" value={params.sort} />}
      </form>

      {!result ? (
        <div className="mt-6 text-sm text-muted-foreground">
          <p>
            Find the moment something was said, across all meetings. Use quotes for a phrase, OR, and -word to exclude.
            Tip: press <kbd className="rounded border bg-muted px-1 font-mono text-xs">⌘K</kbd> anywhere to jump.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLES.map((e) => (
              <Link key={e} href={`/search?q=${encodeURIComponent(e)}`} className="rounded-full border px-3 py-1 text-xs transition-colors hover:bg-muted">
                {e}
              </Link>
            ))}
          </div>
        </div>
      ) : result.total === 0 ? (
        <p className="mt-8 rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          Nothing matched “{query}”. Try fewer or different words.
        </p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {result.total} {result.total === 1 ? "moment" : "moments"} in {result.meetings.length}{" "}
              {result.meetings.length === 1 ? "meeting" : "meetings"}
            </p>
            <div role="group" aria-label="Sort" className="flex items-center rounded-md border p-0.5 text-xs">
              {(["relevance", "newest"] as const).map((s) => (
                <Link
                  key={s}
                  href={searchHref(params, { sort: s === "newest" ? "newest" : undefined, all: undefined })}
                  aria-current={sort === s ? "true" : undefined}
                  className={cn(
                    "rounded px-2 py-1 capitalize transition-colors",
                    sort === s ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {s}
                </Link>
              ))}
            </div>
          </div>

          {result.meetings.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Filter by meeting">
              <FilterChip href={searchHref(params, { m: undefined, all: undefined })} active={!params.m}>
                All meetings
              </FilterChip>
              {result.meetings.map((m) => (
                <FilterChip key={m.id} href={searchHref(params, { m: m.id, all: undefined })} active={params.m === m.id}>
                  <span className="max-w-48 truncate">{m.title}</span>
                  <span className="text-muted-foreground tabular-nums">{m.hits.length}</span>
                </FilterChip>
              ))}
            </div>
          )}

          <div className="mt-5 space-y-4">
            {groups.map((m) => {
              const expanded = params.all === m.id || !!params.m;
              const hits = expanded ? m.hits : m.hits.slice(0, PREVIEW_HITS);
              const duration = m.durationMs || Math.max(...m.hits.map((h) => h.startMs)) || 1;
              return (
                <section key={m.id} className="overflow-hidden rounded-xl border">
                  <header className="border-b px-4 py-2.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <Link href={`/meetings/${m.id}`} className="min-w-0 truncate font-medium hover:underline">
                        {m.title}
                      </Link>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDate(m.startedAt)} · {formatDuration(m.durationMs)} · {m.hits.length}{" "}
                        {m.hits.length === 1 ? "hit" : "hits"}
                      </span>
                    </div>
                    {/* Where in the meeting the hits fall; each tick is a link to that moment. */}
                    <div className="relative mt-2 h-2 rounded-full bg-muted" aria-hidden>
                      {m.hits.map((h) => (
                        <Link
                          key={h.idx}
                          href={`/meetings/${m.id}?t=${tParam(h.startMs)}`}
                          tabIndex={-1}
                          title={formatTimestamp(h.startMs)}
                          className="absolute inset-y-0 w-1 -translate-x-1/2 rounded-full bg-link/70 transition-colors hover:bg-link"
                          style={{ left: `${Math.min(100, (h.startMs / duration) * 100)}%` }}
                        />
                      ))}
                    </div>
                  </header>
                  <ul className="divide-y">
                    {hits.map((h) => (
                      <li key={h.idx}>
                        <Link
                          href={`/meetings/${m.id}?t=${tParam(h.startMs)}`}
                          className="flex gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50"
                        >
                          <span className="w-12 shrink-0 pt-px text-xs font-medium text-link tabular-nums">
                            ▶ {formatTimestamp(h.startMs)}
                          </span>
                          <span className="min-w-0 text-sm">
                            <span className="font-medium" style={{ color: h.color }}>
                              {h.speaker}
                            </span>
                            <span className="mt-0.5 block leading-relaxed text-foreground/80">
                              <Snippet text={h.snippet} />
                            </span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {!params.m && m.hits.length > PREVIEW_HITS && (
                    <Link
                      href={searchHref(params, { all: expanded ? undefined : m.id })}
                      scroll={false}
                      className="block border-t px-4 py-2 text-center text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                    >
                      {expanded ? "Show fewer" : `Show all ${m.hits.length} hits`}
                    </Link>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function FilterChip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-colors",
        active ? "border-foreground bg-muted font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

function Snippet({ text }: { text: string }) {
  // ts_headline wraps hits in HIT_START…HIT_END; render them as <mark> without ever treating text as HTML.
  return (
    <>
      {text.split(HIT_START).map((part, i) => {
        if (i === 0) return part;
        const [hit, rest] = part.split(HIT_END);
        return (
          <span key={i}>
            <mark className="rounded-sm bg-yellow-200/80 text-inherit dark:bg-yellow-500/30">{hit}</mark>
            {rest}
          </span>
        );
      })}
    </>
  );
}
