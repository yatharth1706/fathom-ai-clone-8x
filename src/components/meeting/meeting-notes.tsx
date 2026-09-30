"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, Copy, Loader2, Sparkles } from "lucide-react";
import { ParticipantAvatar } from "@/components/participant-stack";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatTimestamp } from "@/lib/format";
import type { TemplateId } from "@/lib/providers/types";
import type { ActionItem, Chapter, Insight, Participant, Summary } from "@/lib/queries";
import { summaryToHtml, summaryToMarkdown } from "@/lib/summary-format";
import { TEMPLATE_BY_ID, TEMPLATES } from "@/lib/templates";
import { cn } from "@/lib/utils";
import { usePlayer } from "./player-context";

type Props = {
  meetingId: string;
  title: string;
  /** Start time of each segment, indexed by segment idx; resolves the ids the LLM cited. */
  segStartMs: number[];
  participants: Participant[];
  summaries: Summary[];
  actionItems: ActionItem[];
  insights: Insight[];
  chapters: Chapter[];
  defaultTemplate: TemplateId;
  /** Public share view: only already-generated templates, no generation. */
  readOnly?: boolean;
};

export function MeetingNotes(props: Props) {
  const decisions = props.insights.filter((i) => i.kind === "decision").length;
  return (
    <Tabs defaultValue="summary">
      <TabsList variant="line" className="w-full justify-start overflow-x-auto border-b pb-1">
        <TabsTrigger value="summary" className="flex-none px-2">Summary</TabsTrigger>
        <TabsTrigger value="actions" className="flex-none px-2">
          Action items <Count n={props.actionItems.length} />
        </TabsTrigger>
        <TabsTrigger value="decisions" className="flex-none px-2">
          Decisions <Count n={decisions} />
        </TabsTrigger>
        <TabsTrigger value="chapters" className="flex-none px-2">
          Chapters <Count n={props.chapters.length} />
        </TabsTrigger>
      </TabsList>
      <TabsContent value="summary" className="pt-3">
        <SummaryTab {...props} />
      </TabsContent>
      <TabsContent value="actions" className="pt-3">
        <ActionItemsTab items={props.actionItems} participants={props.participants} />
      </TabsContent>
      <TabsContent value="decisions" className="pt-3">
        <InsightsTab insights={props.insights} />
      </TabsContent>
      <TabsContent value="chapters" className="pt-3">
        <ChaptersTab chapters={props.chapters} segStartMs={props.segStartMs} />
      </TabsContent>
    </Tabs>
  );
}

function Count({ n }: { n: number }) {
  return n > 0 ? <span className="text-xs text-muted-foreground tabular-nums">{n}</span> : null;
}

/** The one way AI output links into the recording. */
function TimeLink({ ms, className }: { ms: number | null; className?: string }) {
  const { seekTo } = usePlayer();
  if (ms == null) return null;
  return (
    <button
      onClick={() => seekTo(ms)}
      className={cn(
        "inline-flex shrink-0 items-center rounded bg-primary/10 px-1.5 py-px align-baseline text-xs font-medium text-primary tabular-nums hover:bg-primary/20",
        className,
      )}
      title="Play from here"
    >
      {formatTimestamp(ms)}
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">{children}</p>;
}

// ---------- Summary ----------

function SummaryTab({ meetingId, title, segStartMs, summaries, defaultTemplate, readOnly }: Props) {
  const router = useRouter();
  const ready = new Set(summaries.filter((s) => s.status === "ready").map((s) => s.template));
  const choices = readOnly ? TEMPLATES.filter((t) => ready.has(t.id)) : TEMPLATES;
  const [template, setTemplate] = useState<TemplateId>(
    readOnly && !ready.has(defaultTemplate) ? (choices[0]?.id ?? defaultTemplate) : defaultTemplate,
  );
  const [generating, setGenerating] = useState<TemplateId | null>(null);
  const [copied, setCopied] = useState(false);
  const summary = summaries.find((s) => s.template === template);
  const content = summary?.status === "ready" ? summary.content : null;
  const startMs = (idx: number) => segStartMs[idx] ?? null;

  async function generate() {
    setGenerating(template);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/summaries/${template}`, { method: "POST" });
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Failed");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not generate summary");
    } finally {
      setGenerating(null);
    }
  }

  async function copy() {
    if (!content) return;
    const opts = { title, startMs, link: `${location.origin}${location.pathname}` };
    const md = summaryToMarkdown(content, opts);
    try {
      // Rich text for Docs/Notion/email, Markdown for plain-text targets.
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([md], { type: "text/plain" }),
          "text/html": new Blob([summaryToHtml(content, opts)], { type: "text/html" }),
        }),
      ]);
    } catch {
      await navigator.clipboard.writeText(md);
    }
    setCopied(true);
    toast.success("Summary copied");
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
            {TEMPLATE_BY_ID[template].name} template <ChevronDown className="text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-60">
            <DropdownMenuRadioGroup value={template} onValueChange={(v) => setTemplate(v as TemplateId)}>
              {choices.map((t) => (
                <DropdownMenuRadioItem key={t.id} value={t.id} className="flex-col items-start gap-0">
                  <span>{t.name}</span>
                  <span className="text-xs text-muted-foreground">{t.description}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="sm" onClick={copy} disabled={!content}>
          {copied ? <Check /> : <Copy />} Copy
        </Button>
      </div>

      {content ? (
        <div className="space-y-5">
          {content.sections.map((sec) => (
            <section key={sec.heading}>
              <h3 className="mb-2 text-sm font-semibold">{sec.heading}</h3>
              <ul className="space-y-1.5">
                {sec.bullets.map((b, i) => (
                  <li key={i} className="flex gap-2 text-sm leading-relaxed text-foreground/85">
                    <span className="mt-[9px] size-1 shrink-0 rounded-full bg-foreground/40" />
                    <span>
                      {b.text} <TimeLink ms={b.segIds.map(startMs).find((v) => v != null) ?? null} />
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : readOnly ? (
        <Empty>No summary is available for this meeting.</Empty>
      ) : (
        <div className="rounded-lg border border-dashed px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            {summary?.status === "failed"
              ? "Generating this summary failed."
              : `No ${TEMPLATE_BY_ID[template].name} summary yet.`}
          </p>
          <Button size="sm" className="mt-3" onClick={generate} disabled={generating !== null}>
            {generating === template ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {generating === template ? "Generating…" : summary?.status === "failed" ? "Try again" : "Generate"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------- Action items ----------

function ActionItemsTab({ items, participants }: { items: ActionItem[]; participants: Participant[] }) {
  if (items.length === 0) return <Empty>No action items were agreed in this meeting.</Empty>;
  const byId = new Map(participants.map((p) => [p.id, p]));
  return (
    <ul className="divide-y">
      {items.map((it) => {
        const owner = it.ownerParticipantId ? byId.get(it.ownerParticipantId) : undefined;
        const ownerName = owner?.displayName ?? it.ownerText;
        return (
          <li key={it.id} className="flex gap-3 py-2.5">
            <span className="mt-0.5 size-4 shrink-0 rounded border border-foreground/30" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-snug">{it.text}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {ownerName && (
                  <span className="inline-flex items-center gap-1.5">
                    {owner && <ParticipantAvatar person={owner} className="size-4 text-[8px] ring-0" />}
                    {ownerName}
                  </span>
                )}
                {it.dueText && <span>Due {it.dueText}</span>}
                <TimeLink ms={it.startMs} />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ---------- Decisions / key points / open questions ----------

const INSIGHT_GROUPS = [
  { kind: "decision", label: "Decisions" },
  { kind: "key_point", label: "Key points" },
  { kind: "open_question", label: "Open questions" },
] as const;

function InsightsTab({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return <Empty>No decisions or key points were identified.</Empty>;
  return (
    <div className="space-y-5">
      {INSIGHT_GROUPS.map(({ kind, label }) => {
        const list = insights.filter((i) => i.kind === kind);
        if (list.length === 0) return null;
        return (
          <section key={kind}>
            <h3 className="mb-2 text-sm font-semibold">{label}</h3>
            <ul className="space-y-1.5">
              {list.map((it) => (
                <li key={it.id} className="flex gap-2 text-sm leading-relaxed text-foreground/85">
                  <span className="mt-[9px] size-1 shrink-0 rounded-full bg-foreground/40" />
                  <span>
                    {it.text} <TimeLink ms={it.startMs} />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

// ---------- Chapters ----------

function ChaptersTab({ chapters, segStartMs }: { chapters: Chapter[]; segStartMs: number[] }) {
  const { activeIdx, seekTo } = usePlayer();
  if (chapters.length === 0) return <Empty>No chapters for this meeting.</Empty>;
  const nowMs = activeIdx >= 0 ? segStartMs[activeIdx] : -1;
  return (
    <ol className="space-y-1">
      {chapters.map((c) => {
        const current = nowMs >= c.startMs && nowMs < c.endMs;
        return (
          <li key={c.idx}>
            <button
              onClick={() => seekTo(c.startMs)}
              className={cn(
                "flex w-full gap-3 rounded-md px-2 py-2 text-left hover:bg-muted/60",
                current && "bg-primary/10 hover:bg-primary/15",
              )}
            >
              <span className={cn("w-12 shrink-0 pt-px text-xs text-muted-foreground tabular-nums", current && "font-medium text-primary")}>
                {formatTimestamp(c.startMs)}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{c.title}</span>
                {c.summary && <span className="mt-0.5 block text-sm text-muted-foreground">{c.summary}</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
