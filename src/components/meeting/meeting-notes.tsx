"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowUp, Check, ChevronDown, Copy, Globe, Loader2, Pencil, Play, Plus, Scissors, Sparkles, Trash2 } from "lucide-react";
import { addActionItem, deleteActionItem, setActionItemDone, updateActionItem } from "@/app/meetings/[id]/actions";
import { ClipActions } from "@/components/clip-actions";
import { ParticipantAvatar } from "@/components/participant-stack";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatTimestamp, tParam } from "@/lib/format";
import type { TemplateId } from "@/lib/providers/types";
import type { ActionItem, Chapter, Highlight, Insight, Participant, QaMessage, Summary } from "@/lib/queries";
import { summaryToHtml, summaryToMarkdown } from "@/lib/summary-format";
import { TEMPLATE_BY_ID, TEMPLATES } from "@/lib/templates";
import { cn } from "@/lib/utils";
import { useClipComposer } from "./clip-composer";
import { MiniPlayer } from "./mini-player";
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
  qa: QaMessage[];
  highlights: Highlight[];
  isProtected: boolean;
  durationMs: number;
  /** Public share view: only already-generated templates, no generation. */
  readOnly?: boolean;
};

export function MeetingNotes(props: Props) {
  const decisions = props.insights.filter((i) => i.kind === "decision").length;
  return (
    <Tabs defaultValue="summary">
      {/* Pinned while the notes scroll (desktop), with a mini player once the video is out of view. */}
      <div className="z-10 bg-background lg:sticky lg:-top-6 lg:pt-3">
        {props.durationMs > 0 && <MiniPlayer durationMs={props.durationMs} />}
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
          {!props.readOnly && (
            <TabsTrigger value="highlights" className="flex-none px-2">
              Highlights <Count n={props.highlights.length} />
            </TabsTrigger>
          )}
          {!props.readOnly && (
            <TabsTrigger value="ask" className="flex-none px-2">
              <Sparkles className="size-3.5" /> Ask
            </TabsTrigger>
          )}
        </TabsList>
      </div>
      <TabsContent value="summary" className="pt-3">
        <SummaryTab {...props} />
      </TabsContent>
      <TabsContent value="actions" className="pt-3">
        <ActionItemsTab
          meetingId={props.meetingId}
          title={props.title}
          items={props.actionItems}
          participants={props.participants}
          readOnly={props.readOnly}
          isProtected={props.isProtected}
        />
      </TabsContent>
      <TabsContent value="decisions" className="pt-3">
        <InsightsTab insights={props.insights} />
      </TabsContent>
      <TabsContent value="chapters" className="pt-3">
        <ChaptersTab chapters={props.chapters} segStartMs={props.segStartMs} />
      </TabsContent>
      {!props.readOnly && (
        <TabsContent value="highlights" className="pt-3">
          <HighlightsTab highlights={props.highlights} />
        </TabsContent>
      )}
      {!props.readOnly && (
        <TabsContent value="ask" className="pt-3">
          <AskTab meetingId={props.meetingId} initial={props.qa} />
        </TabsContent>
      )}
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
        "inline-flex shrink-0 items-center gap-0.5 rounded-sm align-baseline text-xs font-medium whitespace-nowrap text-muted-foreground tabular-nums transition-colors hover:text-link hover:underline hover:underline-offset-2",
        className,
      )}
      title="Play from here"
    >
      <span aria-hidden className="text-[9px]">▶</span>
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

type ItemDraft = { text: string; owner: string; dueText: string };
/** Owner <select> values: "" = unassigned, a participant id, or KEEP_TEXT for the AI's free-text owner. */
const KEEP_TEXT = "__text__";

function ActionItemsTab({
  meetingId,
  title,
  items,
  participants,
  readOnly,
  isProtected,
}: {
  meetingId: string;
  title: string;
  items: ActionItem[];
  participants: Participant[];
  readOnly?: boolean;
  isProtected: boolean;
}) {
  const [optimistic, setDone] = useOptimistic(items, (state, { id, done }: { id: string; done: boolean }) =>
    state.map((it) => (it.id === id ? { ...it, done } : it)),
  );
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null); // item id, or "new"
  const byId = new Map(participants.map((p) => [p.id, p]));
  const doneCount = optimistic.filter((it) => it.done).length;

  const toggle = (id: string, done: boolean) =>
    startTransition(async () => {
      setDone({ id, done });
      const res = await setActionItemDone(meetingId, id, done);
      if (!res.ok) toast.error(res.error);
    });

  // Plain-text exports with a link back to each moment; pasting into Slack / Linear / docs needs no integration.
  async function exportItems(format: "markdown" | "slack") {
    const link = `${location.origin}${location.pathname}`;
    const lines = optimistic.map((it) => {
      const owner = (it.ownerParticipantId && byId.get(it.ownerParticipantId)?.displayName) || it.ownerText;
      const meta = [owner, it.dueText && `due ${it.dueText}`].filter(Boolean).join(", ");
      const at = it.startMs != null ? { label: formatTimestamp(it.startMs), href: `${link}?t=${tParam(it.startMs)}` } : null;
      if (format === "slack")
        return `${it.done ? "☑" : "☐"} ${it.text}${meta ? ` — _${meta}_` : ""}${at ? ` <${at.href}|${at.label}>` : ""}`;
      return `- [${it.done ? "x" : " "}] ${it.text}${meta ? ` — ${meta}` : ""}${at ? ` ([${at.label}](${at.href}))` : ""}`;
    });
    const text = [format === "slack" ? `*Action items: ${title}*` : `## Action items: ${title}`, "", ...lines].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success(format === "slack" ? "Copied for Slack" : "Copied as Markdown");
    } catch {
      toast.error("Couldn't access the clipboard");
    }
  }

  const addButton = !readOnly && editing !== "new" && (
    <Button variant="ghost" size="sm" onClick={() => setEditing("new")}>
      <Plus /> Add action item
    </Button>
  );

  if (optimistic.length === 0 && editing !== "new")
    return (
      <div className="rounded-lg border border-dashed px-4 py-8 text-center">
        <p className="text-sm text-muted-foreground">No action items were agreed in this meeting.</p>
        {addButton && <div className="mt-2">{addButton}</div>}
      </div>
    );

  return (
    <div>
      {optimistic.length > 0 && (
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground tabular-nums">
            {doneCount} of {optimistic.length} done
          </p>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>
              <Copy /> Export <ChevronDown className="text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => exportItems("markdown")}>Copy as Markdown checklist</DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportItems("slack")}>Copy for Slack</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      <ul className="divide-y">
        {optimistic.map((it) => {
          const owner = it.ownerParticipantId ? byId.get(it.ownerParticipantId) : undefined;
          const ownerName = owner?.displayName ?? it.ownerText;
          if (editing === it.id)
            return (
              <li key={it.id} className="py-2.5">
                <ActionItemForm
                  meetingId={meetingId}
                  item={it}
                  participants={participants}
                  canDelete={!isProtected}
                  onDone={() => setEditing(null)}
                />
              </li>
            );
          return (
            <li key={it.id} className="group flex gap-3 py-2.5">
              <button
                role="checkbox"
                aria-checked={it.done}
                aria-label={it.done ? "Mark as not done" : "Mark as done"}
                disabled={readOnly}
                onClick={() => toggle(it.id, !it.done)}
                className={cn(
                  "mt-0.5 grid size-4 shrink-0 place-items-center rounded border border-foreground/30 enabled:hover:border-foreground/60",
                  it.done && "border-primary bg-primary text-primary-foreground",
                )}
              >
                {it.done && <Check className="size-3" />}
              </button>
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm leading-snug", it.done && "text-muted-foreground line-through")}>{it.text}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {ownerName && (
                    <span className="inline-flex items-center gap-1.5">
                      {owner && <ParticipantAvatar person={owner} className="size-4 text-[8px] ring-0" />}
                      {ownerName}
                    </span>
                  )}
                  {it.dueText && <span>Due {it.dueText}</span>}
                  {it.source === "manual" && <span>Added manually</span>}
                  <TimeLink ms={it.startMs} />
                </div>
              </div>
              {!readOnly && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setEditing(it.id)}
                  aria-label={`Edit ${it.text}`}
                  className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <Pencil />
                </Button>
              )}
            </li>
          );
        })}
        {editing === "new" && (
          <li className="py-2.5">
            <ActionItemForm meetingId={meetingId} participants={participants} canDelete={false} onDone={() => setEditing(null)} />
          </li>
        )}
      </ul>
      {addButton && <div className="mt-2">{addButton}</div>}
    </div>
  );
}

function ActionItemForm({
  meetingId,
  item,
  participants,
  canDelete,
  onDone,
}: {
  meetingId: string;
  item?: ActionItem;
  participants: Participant[];
  canDelete: boolean;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState<ItemDraft>({
    text: item?.text ?? "",
    owner: item?.ownerParticipantId ?? (item?.ownerText ? KEEP_TEXT : ""),
    dueText: item?.dueText ?? "",
  });
  const [pending, startTransition] = useTransition();
  const input =
    "h-8 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

  const save = () =>
    startTransition(async () => {
      const fields = {
        text: draft.text,
        ownerParticipantId: draft.owner && draft.owner !== KEEP_TEXT ? draft.owner : null,
        ownerText: draft.owner === KEEP_TEXT ? (item?.ownerText ?? null) : null,
        dueText: draft.dueText || null,
      };
      const res = item ? await updateActionItem(meetingId, item.id, fields) : await addActionItem(meetingId, fields);
      if (!res.ok) return void toast.error(res.error);
      onDone();
    });

  const remove = () =>
    startTransition(async () => {
      if (!item) return;
      const res = await deleteActionItem(meetingId, item.id);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Action item deleted");
      onDone();
    });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      onKeyDown={(e) => e.key === "Escape" && onDone()}
      className="grid gap-2"
    >
      <input
        autoFocus
        value={draft.text}
        maxLength={300}
        placeholder="What needs to happen?"
        aria-label="Action item"
        onChange={(e) => setDraft({ ...draft, text: e.target.value })}
        className={input}
      />
      <div className="flex flex-wrap gap-2">
        <select
          value={draft.owner}
          onChange={(e) => setDraft({ ...draft, owner: e.target.value })}
          aria-label="Owner"
          className={cn(input, "min-w-0 flex-1")}
        >
          <option value="">No owner</option>
          {item?.ownerText && !item.ownerParticipantId && <option value={KEEP_TEXT}>{item.ownerText} (as mentioned)</option>}
          {participants.map((p) => (
            <option key={p.id} value={p.id}>
              {p.displayName}
            </option>
          ))}
        </select>
        <input
          value={draft.dueText}
          maxLength={60}
          placeholder="Due (e.g. Friday)"
          aria-label="Due"
          onChange={(e) => setDraft({ ...draft, dueText: e.target.value })}
          className={cn(input, "w-36")}
        />
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending || !draft.text.trim()}>
          {pending && <Loader2 className="animate-spin" />} {item ? "Save" : "Add"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        {item && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={remove}
            disabled={pending || !canDelete}
            title={canDelete ? undefined : "Items on demo meetings can't be deleted"}
            className="ml-auto text-destructive hover:text-destructive"
          >
            <Trash2 /> Delete
          </Button>
        )}
      </div>
    </form>
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

// ---------- Highlights ----------

function HighlightsTab({ highlights }: { highlights: Highlight[] }) {
  const { playRange, currentMs } = usePlayer();
  const compose = useClipComposer();
  const newClip = () => {
    const now = Math.floor(currentMs());
    compose?.({ startMs: now, endMs: now + 30_000 });
  };
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Select lines in the transcript to clip them, or start from the current time.</p>
        <Button variant="outline" size="sm" onClick={newClip}>
          <Scissors /> New clip
        </Button>
      </div>
      {highlights.length === 0 ? (
        <Empty>No clips yet.</Empty>
      ) : (
        <ul className="divide-y">
          {highlights.map((h) => (
            <li key={h.id} className="flex items-start gap-3 py-2.5">
              <Button variant="outline" size="icon-sm" onClick={() => playRange(h.startMs, h.endMs)} aria-label={`Play ${h.title}`}>
                <Play />
              </Button>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-snug">{h.title}</p>
                <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
                  {formatTimestamp(h.startMs)}–{formatTimestamp(h.endMs)} · {formatTimestamp(h.endMs - h.startMs)}
                  {h.shareToken && (
                    <span className="inline-flex items-center gap-0.5" title="Has a public link">
                      <Globe className="size-3" /> Public
                    </span>
                  )}
                </p>
                {h.note && <p className="mt-1 text-sm text-muted-foreground">{h.note}</p>}
              </div>
              <ClipActions clip={h} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- Ask this meeting ----------

const SUGGESTED_QUESTIONS = [
  "What were the main decisions?",
  "What are the next steps, and who owns them?",
  "Were there any disagreements?",
  "What questions were left unanswered?",
];

function AskTab({ meetingId, initial }: { meetingId: string; initial: QaMessage[] }) {
  const [messages, setMessages] = useState(initial);
  const [draft, setDraft] = useState("");
  const [asking, setAsking] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || asking) return;
    setAsking(q);
    setDraft("");
    try {
      const res = await fetch(`/api/meetings/${meetingId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: QaMessage; error?: string };
      if (!res.ok || !data.message) throw new Error(data.error ?? "Couldn't answer that");
      setMessages((m) => [...m, { ...data.message!, createdAt: new Date(data.message!.createdAt) }]);
    } catch (e) {
      setDraft(q);
      toast.error(e instanceof Error ? e.message : "Couldn't answer that");
    } finally {
      setAsking(null);
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
    }
  }

  return (
    <div className="space-y-4">
      {messages.length === 0 && !asking && (
        <div>
          <p className="text-sm text-muted-foreground">
            Ask anything about this meeting. Answers come only from the transcript and link to the moments they rely on.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button key={q} onClick={() => ask(q)} className="rounded-full border px-3 py-1 text-xs hover:bg-muted">
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {messages.map((m) => (
        <QaPair key={m.id} question={m.question}>
          <p className="whitespace-pre-line">{m.answer}</p>
          {m.citations.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Sources</span>
              {m.citations.map((c) => (
                <TimeLink key={c.segIdx} ms={c.startMs} />
              ))}
            </div>
          )}
        </QaPair>
      ))}
      {asking && (
        <QaPair question={asking}>
          <p className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Reading the transcript…
          </p>
        </QaPair>
      )}
      <div ref={endRef} />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(draft);
        }}
        className="flex items-end gap-2 rounded-lg border bg-background p-1.5 focus-within:ring-2 focus-within:ring-ring/50"
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void ask(draft);
            }
          }}
          rows={1}
          maxLength={500}
          placeholder="Ask about this meeting…"
          aria-label="Ask about this meeting"
          className="max-h-32 min-h-8 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none field-sizing-content placeholder:text-muted-foreground"
        />
        <Button type="submit" size="icon-sm" disabled={!draft.trim() || asking !== null} aria-label="Ask">
          {asking ? <Loader2 className="animate-spin" /> : <ArrowUp />}
        </Button>
      </form>
    </div>
  );
}

function QaPair({ question, children }: { question: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-muted px-3 py-2 text-sm">{question}</p>
      <div className="text-sm leading-relaxed text-foreground/85">{children}</div>
    </div>
  );
}
