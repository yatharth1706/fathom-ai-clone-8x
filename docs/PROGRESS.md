# Progress

Status against the build plan in [PLAN.md](PLAN.md). Update at the end of each session.

## Done (hours 0–8, LLM slice partial)

| Slice | What exists | Key files |
|---|---|---|
| Scaffold | Next.js 16 (App Router, Turbopack), Tailwind 4, shadcn/ui (Base UI preset), app shell + nav | `src/app/layout.tsx`, `src/components/app-shell.tsx` |
| DB | 13-table Drizzle schema on Neon, migration applied | `src/db/schema.ts`, `drizzle/` |
| Storage | R2 client (multipart put, presigned PUT, head/delete); bucket CORS set for `localhost:3000` + `*.vercel.app` | `src/lib/storage.ts` |
| Providers | `AsrProvider` / `LlmProvider` interfaces + zod output schemas; AssemblyAI + **Gemini** (REST, `responseJsonSchema` from zod, zod-validated, backoff on 429/5xx, fails fast on per-day quota, optional `GEMINI_FALLBACK_MODEL` on 503); provider-agnostic prompts | `src/lib/providers/` |
| LLM analysis | `analyze()` (title, speaker-name guesses, chapters, action items, insights) + `summarize()` for 6 templates (`src/lib/templates.ts`). LLM cites segment ids; `src/lib/analysis.ts` drops unknown ids and maps to `start_ms`. `build-fixtures` writes `analysis.json` + `summaries.json` (resumable per template; flags `--force-asr` / `--force-llm`); `seed` loads them and applies name guesses (`is_name_guessed`) | `src/lib/analysis.ts`, `scripts/` |
| Meeting notes UI | Tabs: Summary (template switcher, Copy → rich HTML + Markdown with `?t=` links), Action items (owner, due), Decisions (decisions / key points / open questions), Chapters (current one highlighted). Every item is a `seekTo` timestamp chip. Missing template → Generate (`POST /api/meetings/[id]/summaries/[template]`, `maxDuration` 300, upserts; failures stored as `failed` → "Try again") | `src/components/meeting/meeting-notes.tsx`, `src/lib/pipeline.ts`, `src/app/api/meetings/` |
| Seed data | 5 meetings (51-min 8-speaker Board-seats call, 3 CiviWiki syncs, 1 roundtable), media on R2, transcripts in fixtures | `seed/sources.ts`, `seed/fixtures/*/asr.json` |
| Scripts | `prepare-media` (ffmpeg → R2), `build-fixtures` (ASR once, resumable), `seed` (wipe + reload from fixtures), `check-services` | `scripts/` |
| Meetings list | Server-rendered, grouped by month, poster/duration/speakers/status | `src/app/meetings/page.tsx` |
| Meeting page | Player ↔ transcript sync, click-to-seek, auto-scroll with pause + "Jump to current", scrubber seeks re-follow, `?t=<sec>` deep links, speaker talk-time bars, attribution | `src/app/meetings/[id]/page.tsx`, `src/components/meeting/` |

Verified: DB + R2 round trip; meeting page sync/scroll in headless Chrome and by hand. LLM slice: typecheck + lint clean; Summary tab screenshot-checked on CiviWiki 2018-05-28; summary route returns 400/404/502 correctly. **Not yet eyeballed:** Action items / Decisions / Chapters tabs, the Copy output, and a successful on-demand Generate (quota ran out first).

**LLM fixture status:** only `civiwiki-weekly-2018-05-28` has `analysis.json` + the `general` summary. The other 4 meetings and 5 templates still need generating: **33 calls**.

## Next (in order)

1. **Finish LLM fixtures** once quota allows: `pnpm build-fixtures` (resumes; skips what exists), then `pnpm seed`. Then check the unverified tabs above in the browser.
2. **Hour 8–9** — speaker rename/merge (apply LLM name guesses), in-transcript search.
3. **Hour 9–10** — share links + `/share/m/[token]`; `is_protected` guards on delete/revoke.
4. **Hour 10–12** — upload flow (presign, 100 MB / 15 min caps, per-IP daily limit, webhook + local polling fallback, status UI).

## Blocked on the user

- **Vercel deploy** (overdue from hour 1): needs a GitHub repo + Vercel project with `DATABASE_URL`, `R2_*` env vars.
- **Gemini quota:** the free tier allows **20 requests/day** (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`) on `gemini-flash-latest` (→ gemini-3.8-flash). The other listed models return 404 for this key. That is too little for the seed fixtures (33 calls left) and for a public deploy (each upload needs ≥2 calls). Options: enable billing on the Gemini project (cents at this volume), or add an `ANTHROPIC_API_KEY` and a Claude provider (the prompts are already provider-agnostic).
- Later: `IP_HASH_SALT`, `ASSEMBLYAI_WEBHOOK_SECRET`, `PUBLIC_BASE_URL`.

## Dev notes

- Dev server runs on **port 3100** (`pnpm dev --port 3100`); 3000 is used by an unrelated local project.
- Next 16: async `params`/`searchParams`, `proxy` replaces `middleware`, no `dynamic` segment config — call `await connection()` in data functions. Read `node_modules/next/dist/docs/` before using unfamiliar APIs.
- `pnpm typecheck` runs `next typegen` first (needed for `PageProps` / `LayoutProps`).
- Raw source media lives in `media-work/raw/` (gitignored); re-download links are in `seed/sources.ts`.
- Every commit includes `.agent-logs/` (brief requirement).
- Env: `LLM_PROVIDER` (default `gemini`), `GEMINI_MODEL` (default `gemini-flash-latest`), `GEMINI_FALLBACK_MODEL` (unset).
