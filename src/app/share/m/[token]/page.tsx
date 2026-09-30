import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { MeetingView, parseStartParam } from "@/components/meeting/meeting-view";
import { formatDate } from "@/lib/format";
import { getSharedMeeting, recordShareView } from "@/lib/queries";

export async function generateMetadata(props: PageProps<"/share/m/[token]">): Promise<Metadata> {
  const { token } = await props.params;
  const data = await getSharedMeeting(token);
  if (!data) return { title: "Link unavailable · Notetaker", robots: { index: false } };
  return {
    title: `${data.meeting.title} · Notetaker`,
    description: `Meeting recap from ${formatDate(data.meeting.startedAt)}: recording, transcript, summary and action items.`,
    // Unlisted by design: reachable only by people who were given the link.
    robots: { index: false, follow: false },
  };
}

export default async function SharedMeetingPage(props: PageProps<"/share/m/[token]">) {
  const [{ token }, searchParams] = await Promise.all([props.params, props.searchParams]);
  const data = await getSharedMeeting(token);
  if (!data) notFound();

  after(() => recordShareView(token)); // don't make the viewer wait on a counter

  return (
    <MeetingView
      data={data}
      initialMs={parseStartParam(searchParams.t)}
      readOnly
      eyebrow={
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="grid size-4 place-items-center rounded bg-primary text-[9px] font-semibold text-primary-foreground">N</span>
          Shared with you via Notetaker
        </span>
      }
    />
  );
}
