"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { updateSettings } from "@/app/settings/actions";
import type { TemplateId } from "@/lib/providers/types";
import { TEMPLATES } from "@/lib/templates";
import { cn } from "@/lib/utils";

type Settings = { defaultTemplate: TemplateId; autoActionItems: boolean; autoShare: boolean; botName: string };
type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

/** Every change saves itself (the name after a short pause), with a quiet status instead of a Save button. */
export function SettingsForm({ initial }: { initial: Settings }) {
  const [s, setS] = useState(initial);
  const [status, setStatus] = useState<SaveState>({ kind: "idle" });
  const saved = useRef(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  async function save(next: Settings) {
    if (JSON.stringify(next) === JSON.stringify(saved.current)) return;
    if (!next.botName.trim()) return setStatus({ kind: "error", message: "Give the notetaker a name" });
    setStatus({ kind: "saving" });
    const res = await updateSettings(next);
    if (!res.ok) return setStatus({ kind: "error", message: res.error });
    saved.current = next;
    setStatus({ kind: "saved" });
  }

  const change = <K extends keyof Settings>(key: K, value: Settings[K], delay = 0) => {
    const next = { ...s, [key]: value };
    setS(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(next), delay);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div className="relative mt-6 space-y-8">
      {/* Floats beside the first heading, so it takes no space when there's nothing to report. */}
      <p aria-live="polite" className="absolute top-0 right-0 flex items-center gap-1.5 text-xs text-muted-foreground">
        {status.kind === "saving" && (
          <>
            <Loader2 className="size-3.5 animate-spin" /> Saving…
          </>
        )}
        {status.kind === "saved" && (
          <>
            <Check className="size-3.5 text-green-600" /> Saved
          </>
        )}
        {status.kind === "error" && <span className="text-destructive">{status.message}</span>}
      </p>

      <Group title="Processing" description="What happens to every new recording.">
        <Row title="Default summary template" description="Written automatically for new uploads and shown first on every meeting. Other templates can be generated on demand.">
          <select
            value={s.defaultTemplate}
            onChange={(e) => change("defaultTemplate", e.target.value as TemplateId)}
            aria-label="Default summary template"
            className="h-9 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Row>
        <Row title="Action items" description="Pull out action items with owners and due dates.">
          <Switch checked={s.autoActionItems} onChange={(v) => change("autoActionItems", v)} label="Extract action items automatically" />
        </Row>
      </Group>

      <Group title="Sharing" description="How recaps reach attendees.">
        <Row title="Share automatically" description="Create a public link as soon as a new recording is ready.">
          <Switch checked={s.autoShare} onChange={(v) => change("autoShare", v)} label="Create a public link automatically" />
        </Row>
      </Group>

      <Group title="Identity" description="How the notetaker introduces itself.">
        <Row title="Notetaker name" description="Shown while a recording is being processed.">
          <input
            value={s.botName}
            maxLength={40}
            onChange={(e) => change("botName", e.target.value, 700)}
            onBlur={() => {
              clearTimeout(timer.current);
              void save(s);
            }}
            aria-label="Notetaker name"
            className="h-9 w-48 rounded-md border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        </Row>
        <div className="px-4 pb-4">
          <p className="mb-1.5 text-xs text-muted-foreground">Preview</p>
          <div className="flex items-center gap-2.5 rounded-lg border bg-muted/40 px-3 py-2.5 text-sm">
            <Loader2 className="size-4 shrink-0 animate-spin text-link" />
            <span>
              <span className="font-medium">{s.botName.trim() || "Notetaker"}</span> is taking notes…
            </span>
          </div>
        </div>
      </Group>
    </div>
  );
}

function Group({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-0.5 mb-3 text-sm text-muted-foreground">{description}</p>
      <div className="divide-y rounded-xl border">{children}</div>
    </section>
  );
}

function Row({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn("relative h-6 w-10 rounded-full transition-colors", checked ? "bg-primary" : "bg-muted-foreground/30")}
    >
      <span
        className={cn("absolute top-0.5 left-0.5 size-5 rounded-full bg-background shadow transition-transform", checked && "translate-x-4")}
      />
    </button>
  );
}
