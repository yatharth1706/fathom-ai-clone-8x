# Progress

Status against the build plan in [PLAN.md](PLAN.md). Update at the end of each session.

## Done (hours 0–12, P0 complete)

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
| Upload flow | "Upload recording" dialog (drag/drop or pick; duration read from media metadata; 15 min / 100 MB / type checked before any request; XHR progress). `POST /api/uploads/sign` re-checks limits, takes a per-IP daily slot (`upload_quota`, salted hash, atomic upsert with `setWhere`, `UPLOAD_DAILY_LIMIT` default 3), creates the meeting (`uploaded`, filename title) and returns a presigned PUT (Content-Length signed). `POST /api/meetings/[id]/process` claims `uploaded → transcribing`, HEADs the object, submits to AssemblyAI (webhook only when `PUBLIC_BASE_URL` is public **and** `ASSEMBLYAI_WEBHOOK_SECRET` is set). `claimTranscript` (shared by `POST /api/webhooks/assemblyai` and `GET /api/meetings/[id]/status`) re-fetches the job, enforces 15 min on ASR duration, claims `transcribing → analyzing`; `finishMeeting` runs in `after()` (maxDuration 300): store participants/segments → `analyze` (names, AI title, chapters, action items, insights) → default-template summary (skipped if analysis took > 30 s, so it fits the budget) → `ready` (analysis failure → `ready` + banner). Status route also fails abandoned uploads (30 min), recovers stuck `analyzing` (20 min), and polls ASR when webhooks are off or > 10 min late. `/meetings/[id]` shows a stepper (Upload → Transcribe → Generate notes) or the failure while not ready; list and stepper poll every 3 s and `router.refresh()` on change | `src/lib/{uploads,upload-limits,pipeline}.ts`, `src/app/api/{uploads,webhooks}/`, `src/app/api/meetings/[id]/{process,status}/`, `src/components/{upload-dialog,status-poller}.tsx`, `src/components/meeting/processing-view.tsx` |
| Meetings list | Server-rendered, grouped by month, poster/duration/speakers/status | `src/app/meetings/page.tsx` |
| Meeting page | Player ↔ transcript sync, click-to-seek, auto-scroll with pause + "Jump to current", scrubber seeks re-follow, `?t=<sec>` deep links, speaker talk-time bars, attribution | `src/app/meetings/[id]/page.tsx`, `src/components/meeting/` |

Verified: DB + R2 round trip; meeting page sync/scroll in headless Chrome and by hand. LLM slice: typecheck + lint clean; all 5 seeds have `analysis.json` + 6 summaries (every cited segment id valid); all four notes tabs checked in headless Chrome on a short and the 51-min meeting; chapter click seeks and transcript follows; summary route returns 400/404/502 correctly. Copy + template switcher confirmed by the user. **Not yet exercised:** a successful on-demand Generate from the UI (uploads now get their default template automatically). Hour 8–9: search, rename (incl. Esc cancel) and merge driven with real input events in headless Chrome; action guards (protected, self-merge, empty name, cross-meeting id) checked directly. Hour 9–10: create → share page 200 → revoke → 404, rename, delete → redirect + 404, all via real input in headless Chrome; guards on protected rows checked directly. Hour 10–12: sign-route validation (bad JSON, non-media type, > 100 MB, > 15 min → 400), quota (4th sign from one IP → 429), wrong-size PUT → 403 from R2, double `process` → 409, `process` with no object → `failed` + error page; a 3-min CC0 CiviWiki clip went through polling (ready in ~30 s) and, separately, webhook-only (bad secret 401, unknown job ignored, repeated deliveries processed once); full UI flow in headless Chrome (16-min file rejected client-side, upload progress → stepper → meeting page, list shows AI title). **Not yet exercised:** a real AssemblyAI webhook delivery (needs a public URL, i.e. the Vercel deploy) and the 5-min prod test from the plan.

## Next (in order)

1. **Hour 12–13** — chapters on scrubber; talk-time + speaker filter.
2. Then P1 in PLAN.md order (Ask → highlights/clips → global search → settings/check-off → polish → README).

## Blocked on the user

- **Vercel deploy** (user decision 2026-09-30: deploy at the end, not per slice): needs a GitHub repo + Vercel project with `DATABASE_URL`, `R2_*` env vars.
- **Gemini:** billing enabled 2026-09-30 (₹500 credit; the full seed run is ~35 calls, well under $1). The free tier was 20 requests/day, and the other listed models 404 for this key, so keep `gemini-flash-latest`.
- **R2 CORS:** the bucket allows `http://localhost:3000` but not `:3100` (the dev port), so browser uploads from `pnpm dev --port 3100` fail the preflight. Add `http://localhost:3100` and the production origin (exact origin; wildcard support unverified) in the Cloudflare dashboard. The R2 token here can't read/write bucket CORS. The UI test used Chrome `--disable-web-security` to get past this.
- Deploy env: `IP_HASH_SALT`, `PUBLIC_BASE_URL`, `ASSEMBLYAI_WEBHOOK_SECRET` (a random one is in `.env.local` now; reuse it on Vercel).

## Dev notes

- Dev server runs on **port 3100** (`pnpm dev --port 3100`); 3000 is used by an unrelated local project.
- Next 16: async `params`/`searchParams`, `proxy` replaces `middleware`, no `dynamic` segment config — call `await connection()` in data functions. Read `node_modules/next/dist/docs/` before using unfamiliar APIs.
- Share-link actions take ~2–4 s locally (several Neon HTTP round trips + page refresh); buttons show a spinner.
- UI tests so far are ad-hoc CDP scripts (headless Chrome + `Input.dispatchMouseEvent`); Base UI submenus ignore synthetic `.click()`, so drive menus with real mouse events. CDP `Enter` without `text: "\r"` doesn't submit forms; click the submit button instead.
- No auth by design: `/meetings/[id]` is reachable by id, so revoking stops the share URL, not access to the app itself.
- `pnpm typecheck` runs `next typegen` first (needed for `PageProps` / `LayoutProps`).
- Raw source media lives in `media-work/raw/` (gitignored); re-download links are in `seed/sources.ts`.
- Every commit includes `.agent-logs/` (brief requirement).
- `pnpm seed` wipes upload rows but not their R2 objects under `uploads/`; the test uploads from hour 10–12 are still in the DB until the next reseed.
- Test media: `media-work/test-upload-3min.mp4` (3-min CC0 CiviWiki cut), `media-work/too-long-16min.mp3` (silent, for the duration check).
- Env: `LLM_PROVIDER` (default `gemini`), `GEMINI_MODEL` (default `gemini-flash-latest`), `GEMINI_FALLBACK_MODEL` (unset).
