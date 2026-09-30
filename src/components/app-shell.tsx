"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Highlighter, Loader2, PanelLeftClose, PanelLeftOpen, Search, Settings, Video } from "lucide-react";
import { CommandPalette, openCommandPalette } from "@/components/command-palette";
import { useMeetingIndex } from "@/components/use-meeting-index";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/meetings", label: "My meetings", icon: Video },
  { href: "/highlights", label: "Highlights", icon: Highlighter },
  { href: "/search", label: "Search", icon: Search },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

const COLLAPSED_KEY = "notetaker:sidebarCollapsed";
const IN_PROGRESS = new Set(["uploaded", "transcribing", "analyzing"]);

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isShare = pathname.startsWith("/share/");
  const [collapsed, setCollapsed] = useState(false);
  // Refetch on navigation so new uploads and renamed meetings appear.
  const meetings = useMeetingIndex(pathname, !isShare);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage only exists after hydration
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch {}
  }, []);
  const toggleCollapsed = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, c ? "0" : "1");
      } catch {}
      return !c;
    });

  // Public share pages render without the app chrome.
  if (isShare) return <>{children}</>;

  const processing = (meetings ?? []).filter((m) => IN_PROGRESS.has(m.status));
  const recent = (meetings ?? []).filter((m) => m.status === "ready").slice(0, 5);

  return (
    <div className="flex min-h-screen">
      <CommandPalette />
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col border-r bg-muted/30 transition-[width] md:flex",
          collapsed ? "w-14" : "w-60",
        )}
      >
        <Link href="/meetings" className={cn("flex h-14 shrink-0 items-center gap-2 font-semibold", collapsed ? "justify-center" : "px-5")}>
          <span className="grid size-7 place-items-center rounded-md bg-primary text-sm text-primary-foreground">N</span>
          {!collapsed && "Notetaker"}
        </Link>

        <div className={cn("px-3", collapsed && "px-2")}>
          <button
            onClick={openCommandPalette}
            title="Search (⌘K)"
            className={cn(
              "flex w-full items-center gap-2 rounded-md border bg-background text-sm text-muted-foreground transition-colors hover:text-foreground",
              collapsed ? "justify-center py-2" : "px-2.5 py-1.5",
            )}
          >
            <Search className="size-4 shrink-0" />
            {!collapsed && (
              <>
                <span className="flex-1 text-left">Search…</span>
                <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">⌘K</kbd>
              </>
            )}
          </button>
        </div>

        <nav className={cn("flex flex-col gap-0.5 py-2", collapsed ? "px-2" : "px-3")}>
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                collapsed ? "justify-center" : "px-2.5",
                pathname.startsWith(href) && "bg-muted font-medium text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {!collapsed && label}
            </Link>
          ))}
        </nav>

        {!collapsed && (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-2">
            {processing.length > 0 && (
              <SidebarSection title="Processing">
                {processing.map((m) => (
                  <SidebarLink key={m.id} href={`/meetings/${m.id}`} active={pathname === `/meetings/${m.id}`}>
                    <Loader2 className="size-3 shrink-0 animate-spin text-link" />
                    <span className="truncate">{m.title}</span>
                  </SidebarLink>
                ))}
              </SidebarSection>
            )}
            {recent.length > 0 && (
              <SidebarSection title="Recent meetings">
                {recent.map((m) => (
                  <SidebarLink key={m.id} href={`/meetings/${m.id}`} active={pathname === `/meetings/${m.id}`}>
                    <span className="truncate">{m.title}</span>
                  </SidebarLink>
                ))}
              </SidebarSection>
            )}
          </div>
        )}

        <button
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "mt-auto mb-3 flex items-center gap-2 rounded-md py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            collapsed ? "mx-2 justify-center" : "mx-3 px-2.5",
          )}
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          {!collapsed && "Collapse"}
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b px-4 md:hidden">
          <Link
            href="/meetings"
            aria-label="Notetaker"
            className="grid size-7 shrink-0 place-items-center rounded-md bg-primary text-sm font-semibold text-primary-foreground"
          >
            N
          </Link>
          <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto text-sm text-muted-foreground [scrollbar-width:none]">
            {NAV.filter((n) => n.href !== "/search").map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5",
                  pathname.startsWith(href) && "bg-muted font-medium text-foreground",
                )}
              >
                <Icon className="size-4" />
                {label.replace("My meetings", "Meetings")}
              </Link>
            ))}
          </nav>
          <button onClick={openCommandPalette} aria-label="Search" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted">
            <Search className="size-4" />
          </button>
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="px-2.5 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{title}</h2>
      <div className="flex flex-col gap-0.5">{children}</div>
    </section>
  );
}

function SidebarLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        active && "bg-muted text-foreground",
      )}
    >
      {children}
    </Link>
  );
}
