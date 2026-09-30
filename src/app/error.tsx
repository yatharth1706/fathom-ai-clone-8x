"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Errors inside a page keep the app shell (nav) around this fallback. */
export default function PageError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <div className="grid min-h-[60dvh] place-items-center p-6">
      <div role="alert" className="max-w-sm text-center">
        <TriangleAlert className="mx-auto size-8 text-destructive" />
        <h1 className="mt-4 text-lg font-semibold">Something went wrong</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This page couldn&apos;t load. It&apos;s usually a temporary database or network hiccup.
        </p>
        {error.digest && <p className="mt-2 font-mono text-xs text-muted-foreground">Ref {error.digest}</p>}
        <Button className="mt-4" onClick={() => retry()}>
          Try again
        </Button>
      </div>
    </div>
  );
}
