"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { updateSettings } from "@/app/settings/actions";
import { Button } from "@/components/ui/button";
import type { TemplateId } from "@/lib/providers/types";
import { TEMPLATES } from "@/lib/templates";
import { cn } from "@/lib/utils";

type Settings = { defaultTemplate: TemplateId; autoActionItems: boolean; autoShare: boolean; botName: string };

export function SettingsForm({ initial }: { initial: Settings }) {
  const [s, setS] = useState(initial);
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify(s) !== JSON.stringify(initial);
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setS((prev) => ({ ...prev, [key]: value }));

  const save = () =>
    startTransition(async () => {
      const res = await updateSettings(s);
      if (res.ok) toast.success("Settings saved");
      else toast.error(res.error);
    });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="mt-6 divide-y rounded-xl border"
    >
      <Row
        title="Default summary template"
        description="Generated automatically for new uploads and shown first on every meeting. Others can be generated on demand."
      >
        <select
          value={s.defaultTemplate}
          onChange={(e) => set("defaultTemplate", e.target.value as TemplateId)}
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
      <Row title="Action items" description="Extract action items with owners and due dates from new recordings.">
        <Switch checked={s.autoActionItems} onChange={(v) => set("autoActionItems", v)} label="Extract action items automatically" />
      </Row>
      <Row title="Share automatically" description="Create a public link as soon as a new recording is ready, so the recap can go straight to attendees.">
        <Switch checked={s.autoShare} onChange={(v) => set("autoShare", v)} label="Create a public link automatically" />
      </Row>
      <Row title="Notetaker name" description="What the notetaker is called while it processes a recording.">
        <input
          value={s.botName}
          maxLength={40}
          onChange={(e) => set("botName", e.target.value)}
          aria-label="Notetaker name"
          className="h-9 w-48 rounded-md border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        />
      </Row>
      <div className="flex justify-end gap-2 p-3">
        <Button type="button" variant="ghost" disabled={!dirty || pending} onClick={() => setS(initial)}>
          Reset
        </Button>
        <Button type="submit" disabled={!dirty || pending || !s.botName.trim()}>
          {pending && <Loader2 className="animate-spin" />} Save
        </Button>
      </div>
    </form>
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
      className={cn(
        "relative h-6 w-10 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
        checked ? "bg-primary" : "bg-muted-foreground/30",
      )}
    >
      <span
        className={cn("absolute top-0.5 left-0.5 size-5 rounded-full bg-background shadow transition-transform", checked && "translate-x-4")}
      />
    </button>
  );
}
