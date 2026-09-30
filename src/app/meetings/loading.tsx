import { Skeleton } from "@/components/ui/skeleton";

export default function MeetingsLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-8" aria-busy="true" aria-label="Loading meetings">
      <div className="flex items-end justify-between gap-4">
        <div>
          <Skeleton className="h-7 w-44" />
          <Skeleton className="mt-2 h-4 w-24" />
        </div>
        <Skeleton className="h-9 w-40" />
      </div>
      <Skeleton className="mt-8 h-3 w-28" />
      <ul className="mt-2 divide-y rounded-xl border">
        {Array.from({ length: 5 }, (_, i) => (
          <li key={i} className="flex items-center gap-4 p-3">
            <Skeleton className="aspect-video w-32 shrink-0 sm:w-40" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
