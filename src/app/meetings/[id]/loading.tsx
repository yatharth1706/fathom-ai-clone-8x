import { Skeleton } from "@/components/ui/skeleton";

export default function MeetingLoading() {
  return (
    <div className="flex flex-col lg:h-dvh" aria-busy="true" aria-label="Loading meeting">
      <header className="border-b px-4 py-3 md:px-6">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-2 h-6 w-2/3 max-w-md" />
        <Skeleton className="mt-2 h-4 w-40" />
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)]">
        <div className="space-y-6 p-4 md:p-6">
          <Skeleton className="aspect-video w-full rounded-xl" />
          <Skeleton className="h-5 w-full" />
          <div className="flex gap-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-5 w-20" />
            ))}
          </div>
          <div className="space-y-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-4" style={{ width: `${90 - i * 8}%` }} />
            ))}
          </div>
        </div>
        <aside className="hidden space-y-5 border-l p-4 lg:block">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}
