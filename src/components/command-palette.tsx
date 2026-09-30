"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Highlighter, Search, Settings, TextSearch, Video } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useMeetingIndex } from "./use-meeting-index";

const OPEN_EVENT = "notetaker:command-palette";

/** Opens the command bar from anywhere (e.g. the sidebar's search button). */
export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

type Item = { key: string; group: string; label: string; hint?: string; href: string; icon: React.ElementType };

const PAGES: Item[] = [
  { key: "p-meetings", group: "Go to", label: "My meetings", href: "/meetings", icon: Video },
  { key: "p-highlights", group: "Go to", label: "Highlights", href: "/highlights", icon: Highlighter },
  { key: "p-search", group: "Go to", label: "Search transcripts", href: "/search", icon: TextSearch },
  { key: "p-settings", group: "Go to", label: "Settings", href: "/settings", icon: Settings },
];

/** ⌘K / Ctrl+K: jump to a meeting or page, or search every transcript. The /search page stays for full results. */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const meetings = useMeetingIndex(open, open);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const ready = (meetings ?? []).filter((m) => m.status === "ready");
    const meetingItems: Item[] = ready
      .filter((m) => !q || m.title.toLowerCase().includes(q))
      .slice(0, q ? 8 : 5)
      .map((m) => ({
        key: m.id,
        group: q ? "Meetings" : "Recent meetings",
        label: m.title,
        hint: new Date(m.startedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }),
        href: `/meetings/${m.id}`,
        icon: Video,
      }));
    const pages = PAGES.filter((p) => !q || p.label.toLowerCase().includes(q));
    const search: Item[] = q
      ? [{ key: "search", group: "Transcripts", label: `Search all transcripts for “${query.trim()}”`, href: `/search?q=${encodeURIComponent(query.trim())}`, icon: Search }]
      : [];
    return [...meetingItems, ...search, ...pages];
  }, [meetings, query]);

  const go = (item: Item | undefined) => {
    if (!item) return;
    setOpen(false);
    router.push(item.href);
  };

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setQuery("");
          setActive(0);
        }
      }}
    >
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg" showCloseButton={false}>
        <DialogTitle className="sr-only">Command bar</DialogTitle>
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const d = e.key === "ArrowDown" ? 1 : -1;
                setActive((a) => (items.length ? (a + d + items.length) % items.length : 0));
              }
              if (e.key === "Enter") {
                e.preventDefault();
                go(items[active]);
              }
            }}
            placeholder="Jump to a meeting, or search transcripts…"
            aria-label="Command bar"
            role="combobox"
            aria-expanded
            aria-controls="command-list"
            aria-activedescendant={items[active] ? `cmd-${items[active].key}` : undefined}
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">esc</kbd>
        </div>
        <ul ref={listRef} id="command-list" role="listbox" className="max-h-80 overflow-y-auto p-1.5">
          {meetings === null && <li className="px-3 py-2 text-sm text-muted-foreground">Loading…</li>}
          {items.map((item, i) => (
            <li key={item.key} className="contents">
              {(i === 0 || items[i - 1].group !== item.group) && (
                <p className="px-2.5 pt-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  {item.group}
                </p>
              )}
              <button
                id={`cmd-${item.key}`}
                data-i={i}
                role="option"
                aria-selected={i === active}
                onMouseMove={() => setActive(i)}
                onClick={() => go(item)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm",
                  i === active && "bg-muted",
                )}
              >
                <item.icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.hint && <span className="shrink-0 text-xs text-muted-foreground">{item.hint}</span>}
                {i === active && <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" />}
              </button>
            </li>
          ))}
        </ul>
        <div className="flex gap-3 border-t px-3 py-2 text-[11px] text-muted-foreground">
          <span>↑↓ to move</span>
          <span>↵ to open</span>
          <span className="ml-auto">⌘K to toggle</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
