# Progress

Status against the build plan in [PLAN.md](PLAN.md). Update at the end of each session.

## Done (hours 0–10)

| Slice | What exists | Key files |
|---|---|---|
| Scaffold | Next.js 16 (App Router, Turbopack), Tailwind 4, shadcn/ui (Base UI preset), app shell + nav | `src/app/layout.tsx`, `src/components/app-shell.tsx` |
| DB | 13-table Drizzle schema on Neon, migration applied | `src/db/schema.ts`, `drizzle/` |
| Storage | R2 client (multipart put, presigned PUT, head/delete); bucket CORS set for `localhost:3000` + `*.vercel.app` | `src/lib/storage.ts` |
| Providers | `AsrProvider` / `LlmProvider` interfaces + zod output schemas; AssemblyAI + **Gemini** (REST, `responseJsonSchema` from zod, zod-validated, backoff on 429/5xx, fails fast on per-day quota, optional `GEMINI_FALLBACK_MODEL` on 503); provider-agnostic prompts | `src/lib/providers/` |
| LLM analysis | `analyze()` (title, speaker-name guesses, chapters, action items, insights) + `summarize()` for 6 templates (`src/lib/templates.ts`). LLM cites segment ids; `src/lib/analysis.ts` drops unknown ids and maps to `start_ms`. `build-fixtures` writes `analysis.json` + `summaries.json` (resumable per template; flags `--force-asr` / `--force-llm`); `seed` loads them and applies name guesses (`is_name_guessed`) | `src/lib/analysis.ts`, `scripts/` |
| Speakers | Inline rename (server action, clears `is_name_guessed`; allowed on seeds), "AI guess" chip on LLM-suggested names, merge-into (atomic `db.batch`: segments + action-item owners + talk time, deletes merged row; blocked on `is_protected` meetings in UI and server) | `src/app/meetings/[id]/actions.ts`, `src/components/meeting/speaker-stats.tsx` |
| Transcript search | Client-side, case-insensitive, ≥2 chars; n/m counter, Enter / Shift+Enter / arrows, `/` to focus, Esc clears; highlights all hits, current hit scrolled into view (pauses follow) | `src/components/meeting/transcript-panel.tsx` |
| Sharing | Share popover (create/reuse link, copy, "start at current time", view count, revoke); `/share/m/[token]` renders the same `MeetingView` read-only (no edits/generation, noindex, views counted via `after()`); revoked/unknown → segment `not-found`. Seed adds one protected link per demo meeting (stable tokens, printed by `pnpm seed`) | `src/components/meeting/{share-button,meeting-view}.tsx`, `src/app/share/m/[token]/` |
| Protected-row guards | Server actions refuse revoke on protected links and rename/delete/merge on protected meetings; UI shows these disabled with a reason. Delete removes share links (no FK) + uploaded media, then redirects | `src/app/meetings/[id]/actions.ts`, `src/components/meeting/meeting-actions.tsx` |
| Meeting notes UI | Tabs: Summary (template switcher, Copy → rich HTML + Markdown with `?t=` links), Action items (owner, due), Decisions (decisions / key points / open questions), Chapters (current one highlighted). Every item is a `seekTo` timestamp chip. Missing template → Generate (`POST /api/meetings/[id]/summaries/[template]`, `maxDuration` 300, upserts; failures stored as `failed` → "Try again") | `src/components/meeting/meeting-notes.tsx`, `src/lib/pipeline.ts`, `src/app/api/meetings/` |
| Seed data | 5 meetings (51-min 8-speaker Board-seats call, 3 CiviWiki syncs, 1 roundtable), media on R2, transcripts in fixtures | `seed/sources.ts`, `seed/fixtures/*/asr.json` |
| Scripts | `prepare-media` (ffmpeg → R2), `build-fixtures` (ASR once, resumable), `seed` (wipe + reload from fixtures), `check-services` | `scripts/` |
| Meetings list | Server-rendered, grouped by month, poster/duration/speakers/status | `src/app/meetings/page.tsx` |
| Meeting page | Player ↔ transcript sync, click-to-seek, auto-scroll with pause + "Jump to current", scrubber seeks re-follow, `?t=<sec>` deep links, speaker talk-time bars, attribution | `src/app/meetings/[id]/page.tsx`, `src/components/meeting/` |

Verified: DB + R2 round trip; meeting page sync/scroll in headless Chrome and by hand. LLM slice: typecheck + lint clean; all 5 seeds have `analysis.json` + 6 summaries (every cited segment id valid); all four notes tabs checked in headless Chrome on a short and the 51-min meeting; chapter click seeks and transcript follows; summary route returns 400/404/502 correctly. Copy + template switcher confirmed by the user. **Not yet exercised:** a successful on-demand Generate (all seeds already have every template; it will first run for uploads). Hour 8–9: search, rename (incl. Esc cancel) and merge driven with real input events in headless Chrome; action guards (protected, self-merge, empty name, cross-meeting id) checked directly. Hour 9–10: create → share page 200 → revoke → 404, rename, delete → redirect + 404, all via real input in headless Chrome; guards on protected rows checked directly.

## Next (in order)

1. **Hour 10–12** — upload flow (presign, 100 MB / 15 min caps, per-IP daily limit, webhook + local polling fallback, status UI).

## Blocked on the user

- **Vercel deploy** (user decision 2026-09-30: deploy at the end, not per slice): needs a GitHub repo + Vercel project with `DATABASE_URL`, `R2_*` env vars.
- **Gemini:** billing enabled 2026-09-30 (₹500 credit; the full seed run is ~35 calls, well under $1). The free tier was 20 requests/day, and the other listed models 404 for this key, so keep `gemini-flash-latest`.
- Later: `IP_HASH_SALT`, `ASSEMBLYAI_WEBHOOK_SECRET`, `PUBLIC_BASE_URL`.

## Dev notes

- Dev server runs on **port 3100** (`pnpm dev --port 3100`); 3000 is used by an unrelated local project.
- Next 16: async `params`/`searchParams`, `proxy` replaces `middleware`, no `dynamic` segment config — call `await connection()` in data functions. Read `node_modules/next/dist/docs/` before using unfamiliar APIs.
- Share-link actions take ~2–4 s locally (several Neon HTTP round trips + page refresh); buttons show a spinner.
- UI tests so far are ad-hoc CDP scripts (headless Chrome + `Input.dispatchMouseEvent`); Base UI submenus ignore synthetic `.click()`, so drive menus with real mouse events. CDP `Enter` without `text: "\r"` doesn't submit forms; click the submit button instead.
- No auth by design: `/meetings/[id]` is reachable by id, so revoking stops the share URL, not access to the app itself.
- `pnpm typecheck` runs `next typegen` first (needed for `PageProps` / `LayoutProps`).
- Raw source media lives in `media-work/raw/` (gitignored); re-download links are in `seed/sources.ts`.
- Every commit includes `.agent-logs/` (brief requirement).
- Env: `LLM_PROVIDER` (default `gemini`), `GEMINI_MODEL` (default `gemini-flash-latest`), `GEMINI_FALLBACK_MODEL` (unset).
