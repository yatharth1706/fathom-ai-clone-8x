import Link from "next/link";
import { VideoOff } from "lucide-react";

export default function MeetingNotFound() {
  return (
    <div className="grid min-h-[60dvh] place-items-center p-6">
      <div className="max-w-sm text-center">
        <VideoOff className="mx-auto size-8 text-muted-foreground" />
        <h1 className="mt-4 text-lg font-semibold">Meeting not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">It may have been deleted, or the link is incomplete.</p>
        <Link href="/meetings" className="mt-4 inline-block text-sm underline underline-offset-2 hover:text-foreground">
          Back to My meetings
        </Link>
      </div>
    </div>
  );
}
