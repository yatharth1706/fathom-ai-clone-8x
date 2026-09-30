import Link from "next/link";
import { Search } from "lucide-react";
import { formatDate, formatDuration, formatTimestamp, tParam } from "@/lib/format";
import { HIT_END, HIT_START, searchTranscripts } from "@/lib/queries";

export async function generateMetadata(props: PageProps<"/search">) {
  const { q } = await props.searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  return { title: query ? `“${query}” · Search · Notetaker` : "Search · Notetaker" };
}

const EXAMPLES = ["pull request", "board seats", "\"welcome message\"", "election -board"];
/** Hits shown per meeting before "Show all". */
const PREVIEW_HITS = 5;

export default async function SearchPage(props: PageProps<"/search">) {
  const { q, all } = await props.searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  const result = query ? await searchTranscripts(query) : null;

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
      </form>

      {!result ? (
        <div className="mt-6 text-sm text-muted-foreground">
          <p>Find the moment something was said, across all meetings. Use quotes for a phrase, OR, and -word to exclude.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLES.map((e) => (
              <Link key={e} href={`/search?q=${encodeURIComponent(e)}`} className="rounded-full border px-3 py-1 text-xs hover:bg-muted">
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
          <p className="mt-4 text-sm text-muted-foreground">
            {result.total} {result.total === 1 ? "moment" : "moments"} in {result.meetings.length}{" "}
            {result.meetings.length === 1 ? "meeting" : "meetings"}
          </p>
          <div className="mt-4 space-y-6">
            {result.meetings.map((m) => {
              const expanded = all === m.id;
              const hits = expanded ? m.hits : m.hits.slice(0, PREVIEW_HITS);
              return (
                <section key={m.id} className="rounded-xl border">
                  <header className="flex items-baseline justify-between gap-3 border-b px-4 py-2.5">
                    <Link href={`/meetings/${m.id}`} className="min-w-0 truncate font-medium hover:underline">
                      {m.title}
                    </Link>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDate(m.startedAt)} · {formatDuration(m.durationMs)} · {m.hits.length}{" "}
                      {m.hits.length === 1 ? "hit" : "hits"}
                    </span>
                  </header>
                  <ul className="divide-y">
                    {hits.map((h) => (
                      <li key={h.idx}>
                        <Link
                          href={`/meetings/${m.id}?t=${tParam(h.startMs)}`}
                          className="flex gap-3 px-4 py-2.5 hover:bg-muted/50"
                        >
                          <span className="w-12 shrink-0 pt-px text-xs font-medium text-primary tabular-nums">
                            {formatTimestamp(h.startMs)}
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
                  {m.hits.length > PREVIEW_HITS && (
                    <Link
                      href={expanded ? `/search?q=${encodeURIComponent(query)}` : `/search?q=${encodeURIComponent(query)}&all=${m.id}`}
                      scroll={false}
                      className="block border-t px-4 py-2 text-center text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground"
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
