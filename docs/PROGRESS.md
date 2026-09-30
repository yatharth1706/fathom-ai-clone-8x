# Progress

Status against the build plan in [PLAN.md](PLAN.md). Update at the end of each session.

## Done (hours 0–6)

| Slice | What exists | Key files |
|---|---|---|
| Scaffold | Next.js 16 (App Router, Turbopack), Tailwind 4, shadcn/ui (Base UI preset), app shell + nav | `src/app/layout.tsx`, `src/components/app-shell.tsx` |
| DB | 13-table Drizzle schema on Neon, migration applied | `src/db/schema.ts`, `drizzle/` |
| Storage | R2 client (multipart put, presigned PUT, head/delete); bucket CORS set for `localhost:3000` + `*.vercel.app` | `src/lib/storage.ts` |
| Providers | `AsrProvider` / `LlmProvider` interfaces + zod output schemas; AssemblyAI implemented; LLM **not yet** | `src/lib/providers/` |
| Seed data | 5 meetings (51-min 8-speaker Board-seats call, 3 CiviWiki syncs, 1 roundtable), media on R2, transcripts in fixtures | `seed/sources.ts`, `seed/fixtures/*/asr.json` |
| Scripts | `prepare-media` (ffmpeg → R2), `build-fixtures` (ASR once, resumable), `seed` (wipe + reload from fixtures), `check-services` | `scripts/` |
| Meetings list | Server-rendered, grouped by month, poster/duration/speakers/status | `src/app/meetings/page.tsx` |
| Meeting page | Player ↔ transcript sync, click-to-seek, auto-scroll with pause + "Jump to current", scrubber seeks re-follow, `?t=<sec>` deep links, speaker talk-time bars, attribution | `src/app/meetings/[id]/page.tsx`, `src/components/meeting/` |

Verified: DB + R2 round trip; meeting page sync/scroll in headless Chrome and by hand.

## Next (in order)

1. **Hour 6–8 — LLM analysis.** Implement Gemini `LlmProvider` (structured JSON output, validated with the zod schemas in `types.ts`; LLM cites segment `idx`, server maps to `startMs`). Pipeline: `analyze()` (title, speaker-name guesses, chapters, action items, insights) + `summarize()` per template. Extend `build-fixtures` to write `seed/fixtures/<slug>/analysis.json` + `summaries.json` for all 6 templates; extend `seed` to load them. Meeting page: Summary tab (template switcher, copy as Markdown), Action items, Decisions — every item a timestamp link via `seekTo`.
2. **Hour 8–9** — speaker rename/merge (apply LLM name guesses), in-transcript search.
3. **Hour 9–10** — share links + `/share/m/[token]`; `is_protected` guards on delete/revoke.
4. **Hour 10–12** — upload flow (presign, 100 MB / 15 min caps, per-IP daily limit, webhook + local polling fallback, status UI).

## Blocked on the user

- **Vercel deploy** (overdue from hour 1): needs a GitHub repo + Vercel project with `DATABASE_URL`, `R2_*` env vars.
- **`GEMINI_API_KEY`** in `.env.local` (needed for next slice). Later: `IP_HASH_SALT`, `ASSEMBLYAI_WEBHOOK_SECRET`, `PUBLIC_BASE_URL`.

## Dev notes

- Dev server runs on **port 3100** (`pnpm dev --port 3100`); 3000 is used by an unrelated local project.
- Next 16: async `params`/`searchParams`, `proxy` replaces `middleware`, no `dynamic` segment config — call `await connection()` in data functions. Read `node_modules/next/dist/docs/` before using unfamiliar APIs.
- `pnpm typecheck` runs `next typegen` first (needed for `PageProps` / `LayoutProps`).
- Raw source media lives in `media-work/raw/` (gitignored); re-download links are in `seed/sources.ts`.
- Every commit includes `.agent-logs/` (brief requirement).
