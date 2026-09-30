import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { ExternalLink } from "lucide-react";
import { ClipPlayer } from "@/components/clip-player";
import { formatDate, formatTimestamp } from "@/lib/format";
import { getSharedClip, recordShareView } from "@/lib/queries";

export async function generateMetadata(props: PageProps<"/share/clip/[token]">): Promise<Metadata> {
  const { token } = await props.params;
  const data = await getSharedClip(token);
  if (!data) return { title: "Link unavailable · Notetaker", robots: { index: false } };
  return {
    title: `${data.clip.title} · Notetaker`,
    description: `A ${formatTimestamp(data.clip.endMs - data.clip.startMs)} clip from “${data.meeting.title}”.`,
    robots: { index: false, follow: false },
  };
}

export default async function SharedClipPage(props: PageProps<"/share/clip/[token]">) {
  const { token } = await props.params;
  const data = await getSharedClip(token);
  if (!data) notFound();
  const { clip, meeting } = data;

  after(() => recordShareView(token));

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 md:py-10">
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="grid size-4 place-items-center rounded bg-primary text-[9px] font-semibold text-primary-foreground">N</span>
        Clip shared with you via Notetaker
      </span>
      <h1 className="mt-2 text-xl font-semibold tracking-tight">{clip.title}</h1>
      <p className="mt-0.5 text-sm text-muted-foreground">
        From {meeting.title} · {formatDate(meeting.startedAt)} · at {formatTimestamp(clip.startMs)}
      </p>
      {clip.note && <p className="mt-3 text-sm">{clip.note}</p>}

      <ClipPlayer
        className="mt-5"
        src={meeting.mediaUrl!}
        poster={meeting.posterUrl}
        startMs={clip.startMs}
        endMs={clip.endMs}
        segments={data.segments}
        participants={data.participants}
      />

      {meeting.attributionUrl && (
        <p className="mt-6 border-t pt-4 text-xs text-muted-foreground">
          {meeting.attributionText}{" "}
          <a
            href={meeting.attributionUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-foreground"
          >
            Source <ExternalLink className="size-3" />
          </a>
        </p>
      )}
    </main>
  );
}
