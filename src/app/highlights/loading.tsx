import { Skeleton } from "@/components/ui/skeleton";

export default function HighlightsLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-8" aria-busy="true" aria-label="Loading highlights">
      <Skeleton className="h-7 w-36" />
      <Skeleton className="mt-2 h-4 w-64" />
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <li key={i} className="overflow-hidden rounded-xl border">
            <Skeleton className="aspect-video w-full rounded-none" />
            <div className="space-y-2 p-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-full" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
