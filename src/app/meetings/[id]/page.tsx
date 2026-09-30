import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { MeetingActions } from "@/components/meeting/meeting-actions";
import { MeetingView, parseStartParam } from "@/components/meeting/meeting-view";
import { ProcessingView } from "@/components/meeting/processing-view";
import { ShareButton } from "@/components/meeting/share-button";
import { getMeeting } from "@/lib/queries";

export async function generateMetadata(props: PageProps<"/meetings/[id]">) {
  const { id } = await props.params;
  const data = await getMeeting(id);
  return { title: data ? `${data.meeting.title} · Notetaker` : "Meeting not found" };
}

export default async function MeetingPage(props: PageProps<"/meetings/[id]">) {
  const [{ id }, searchParams] = await Promise.all([props.params, props.searchParams]);
  const data = await getMeeting(id);
  if (!data) notFound();
  const { meeting } = data;

  if (meeting.status !== "ready")
    return (
      <ProcessingView
        meeting={meeting}
        botName={data.botName}
        actions={<MeetingActions meetingId={meeting.id} title={meeting.title} isProtected={meeting.isProtected} />}
      />
    );

  return (
    <MeetingView
      data={data}
      initialMs={parseStartParam(searchParams.t)}
      eyebrow={
        <Link href="/meetings" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-3.5" /> My meetings
        </Link>
      }
      actions={
        <>
          <ShareButton meetingId={meeting.id} link={data.shareLink} />
          <MeetingActions meetingId={meeting.id} title={meeting.title} isProtected={meeting.isProtected} />
        </>
      }
    />
  );
}
