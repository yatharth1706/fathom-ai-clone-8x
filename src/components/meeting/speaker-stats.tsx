import { ParticipantAvatar } from "@/components/participant-stack";
import { formatDuration } from "@/lib/format";
import type { Participant } from "@/lib/queries";

export function SpeakerStats({ participants }: { participants: Participant[] }) {
  const total = participants.reduce((sum, p) => sum + p.talkMs, 0) || 1;
  return (
    <ul className="space-y-2.5">
      {participants.map((p) => {
        const pct = Math.round((p.talkMs / total) * 100);
        return (
          <li key={p.id} className="flex items-center gap-3">
            <ParticipantAvatar person={p} className="ring-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate">{p.displayName}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {pct}% · {formatDuration(p.talkMs)}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: p.color }} />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
