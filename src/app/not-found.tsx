import Link from "next/link";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="grid min-h-[60dvh] place-items-center p-6">
      <div className="max-w-sm text-center">
        <FileQuestion className="mx-auto size-8 text-muted-foreground" />
        <h1 className="mt-4 text-lg font-semibold">Page not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">There&apos;s nothing at this address.</p>
        <Link href="/meetings" className="mt-4 inline-block text-sm underline underline-offset-2 hover:text-foreground">
          Go to My meetings
        </Link>
      </div>
    </div>
  );
}
