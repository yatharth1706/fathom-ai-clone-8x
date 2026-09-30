import { Link2Off } from "lucide-react";

export default function ShareNotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-6">
      <div className="max-w-sm text-center">
        <Link2Off className="mx-auto size-8 text-muted-foreground" />
        <h1 className="mt-4 text-lg font-semibold">This link isn&apos;t available</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          It may have been revoked by the meeting owner, or the meeting was deleted. Ask them for a new link.
        </p>
      </div>
    </main>
  );
}
