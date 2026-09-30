"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Highlighter, Search, Settings, Video } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/meetings", label: "My meetings", icon: Video },
  { href: "/highlights", label: "Highlights", icon: Highlighter },
  { href: "/search", label: "Search", icon: Search },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Public share pages render without the app chrome.
  if (pathname.startsWith("/share/")) return <>{children}</>;

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 shrink-0 border-r bg-muted/30 md:flex md:flex-col">
        <Link href="/meetings" className="flex h-14 items-center gap-2 px-5 font-semibold">
          <span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground text-sm">
            N
          </span>
          Notetaker
        </Link>
        <nav className="flex flex-col gap-0.5 px-3 py-2">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
                pathname.startsWith(href) && "bg-muted font-medium text-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b px-4 md:hidden">
          <Link href="/meetings" aria-label="Notetaker" className="grid size-7 shrink-0 place-items-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
            N
          </Link>
          <nav className="flex min-w-0 gap-1 overflow-x-auto text-sm text-muted-foreground [scrollbar-width:none]">
            {NAV.map(({ href, label, icon: Icon }) => (
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
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
