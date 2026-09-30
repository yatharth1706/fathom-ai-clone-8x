import { formatTimestamp, tParam } from "@/lib/format";
import type { SummaryContent } from "@/lib/providers/types";

// Summary → Markdown / HTML for copy-paste. Pure, so it runs on the server (stored markdown) and in the browser (copy).

type Opts = {
  title: string;
  startMs: (segIdx: number) => number | null;
  /** Meeting URL; when given, timestamps become `?t=` deep links. */
  link?: string;
};

function stamps(segIds: number[], o: Opts) {
  // One timestamp per bullet keeps pasted notes readable; the first citation is where the point is made.
  const ms = segIds.map(o.startMs).find((v) => v != null);
  if (ms == null) return null;
  return { label: formatTimestamp(ms), href: o.link ? `${o.link}?t=${tParam(ms)}` : null };
}

export function summaryToMarkdown(content: SummaryContent, o: Opts) {
  const out = [`# ${o.title}`];
  for (const sec of content.sections) {
    out.push("", `## ${sec.heading}`, "");
    for (const b of sec.bullets) {
      const s = stamps(b.segIds, o);
      out.push(`- ${b.text}${s ? ` ${s.href ? `[${s.label}](${s.href})` : `(${s.label})`}` : ""}`);
    }
  }
  return out.join("\n") + "\n";
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function summaryToHtml(content: SummaryContent, o: Opts) {
  const parts = [`<h1>${esc(o.title)}</h1>`];
  for (const sec of content.sections) {
    parts.push(`<h2>${esc(sec.heading)}</h2><ul>`);
    for (const b of sec.bullets) {
      const s = stamps(b.segIds, o);
      const ts = s ? (s.href ? ` <a href="${esc(s.href)}">${s.label}</a>` : ` (${s.label})`) : "";
      parts.push(`<li>${esc(b.text)}${ts}</li>`);
    }
    parts.push("</ul>");
  }
  return parts.join("");
}
