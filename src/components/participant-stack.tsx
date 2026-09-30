import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";

type Person = { displayName: string; color: string };

export function ParticipantAvatar({ person, className }: { person: Person; className?: string }) {
  return (
    <span
      title={person.displayName}
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold text-white ring-2 ring-background",
        className,
      )}
      style={{ backgroundColor: person.color }}
    >
      {initials(person.displayName)}
    </span>
  );
}

export function ParticipantStack({
  participants,
  max = 5,
  className,
}: {
  participants: Person[];
  max?: number;
  className?: string;
}) {
  const shown = participants.slice(0, max);
  const rest = participants.length - shown.length;
  return (
    <div className={cn("flex items-center", className)}>
      <div className="flex -space-x-1.5">
        {shown.map((p, i) => (
          <ParticipantAvatar key={i} person={p} />
        ))}
        {rest > 0 && (
          <span className="grid size-6 place-items-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground ring-2 ring-background">
            +{rest}
          </span>
        )}
      </div>
      <span className="ml-2 text-xs text-muted-foreground">
        {participants.length} {participants.length === 1 ? "speaker" : "speakers"}
      </span>
    </div>
  );
}
