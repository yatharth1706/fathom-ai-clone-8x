# Notetaker: a Fathom-style AI meeting notetaker

Upload a meeting recording (or open one of the five seeded demos) and get what [Fathom](https://fathom.video) gives you after a call:

- a transcript with diarized, renameable speakers, synced to the video
- an AI summary in six templates, action items with owners, decisions, and chapters
- timestamp links everywhere, so every AI claim can be checked against the recording
- Ask this meeting, clips, global search, and public share links for meetings and clips

**Live demo:** _added after deploy_. No sign-in: everything belongs to one demo user.

| Demo meeting | Why it's there |
|---|---|
| Community Board seats: call for feedback (51 min, 8 speakers) | Long, many-speaker meeting: talk-time lanes, chapters, speaker filter |
| CiviWiki weekly syncs ×3 (11–21 min) | The same small team across weeks, with concrete action items |
| Editor engagement roundtable (17 min, in person) | Many voices in one room, harder diarization |

Each demo meeting also has a public link (`/share/m/<token>`) and a clip (`/share/clip/<token>`). `pnpm seed` prints the tokens; they stay the same across reseeds.

---

## What's built

| Area | Details |
|---|---|
| **Meeting page** | Player ↔ transcript sync (active line highlighted and followed; manual scroll pauses following and shows "Jump to current"); click any line to seek; `?t=<seconds>` deep links; one `seekTo()` behind every timestamp in the app |
| **Timeline** | Chapter bar (hover for the chapter, click to seek) and one lane per speaker showing when they talk |
| **Speakers** | Talk-time bars; inline rename; AI name guesses marked "AI guess"; merge two diarized speakers into one; filter the transcript to chosen speakers |
| **Transcript search** | In-meeting search with n/m counter, Enter/Shift+Enter, `/` to focus, all hits highlighted |
| **AI notes** | Summary (General, Sales, Customer Success, Demo, Q&A, Retrospective; others generated on demand), copy as rich text + Markdown with timestamp links; action items (check off, edit, reassign, add); decisions / key points / open questions; chapters |
| **Ask this meeting** | Q&A over the whole transcript; answers cite the moments they rely on (clickable) |
| **Highlights** | Select transcript lines → Create clip (or start from the current time); clips replay in place, list at `/highlights`, public clip page plays only that range |
| **Global search** | `/search`: Postgres full-text search across every transcript (phrases, OR, `-exclude`), grouped by meeting, jumps to the exact line |
| **Sharing** | Public read-only meeting page and clip page, view counts, revoke; "start at current time" option |
| **Upload** | Drag-and-drop upload straight to storage with progress → transcribe → analyze, with a live status stepper |
| **Settings** | Default summary template, auto action items, auto-share on ready, notetaker name |
| **Polish** | Keyboard shortcuts (Space/K, ←/→, J/L, `<`/`>` speed 1–2×, `?`), mobile layout (sticky player, Notes/Transcript switch), loading skeletons, error and not-found pages |

---

## Architecture

```
Browser ──presigned PUT──▶ Cloudflare R2 (media)
   │                             │ public URL
   ▼                             ▼
Next.js 16 on Vercel ──────▶ AssemblyAI (transcription + diarization)
 (App Router, route handlers,     │ webhook (prod) or status polling (local)
  server actions)                 ▼
   │                         Gemini (structured JSON, validated with zod)
   ▼
Neon Postgres (Drizzle): meetings, participants, segments (+tsvector), summaries,
action items, insights, chapters, highlights, share links, Q&A, quotas
```

**Stack:** Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind 4 + shadcn/ui (Base UI) · Neon Postgres + Drizzle · Cloudflare R2 · AssemblyAI · Google Gemini.

### Pipeline

The meeting bot is replaced by an upload, and the upload feeds the same pipeline a bot would:

1. `POST /api/uploads/sign` checks type, size (≤ 100 MB) and duration (≤ 15 min, read from the file in the browser), takes a per-IP daily slot, creates the meeting (`uploaded`) and returns a presigned R2 PUT with the Content-Length signed.
2. The browser PUTs the file directly to R2 (so Vercel's 4.5 MB body limit never applies), then calls `POST /api/meetings/[id]/process`. That claims `uploaded → transcribing`, checks the object exists, and submits it to AssemblyAI.
3. When the transcript is done, **either** the AssemblyAI webhook (`/api/webhooks/assemblyai`, shared-secret header) **or** the status poll (`GET /api/meetings/[id]/status`, every 3 s) calls the same `claimTranscript()`. It re-fetches the result, enforces the 15-minute cap on the real audio length, and claims `transcribing → analyzing` with a conditional `UPDATE`, so the steps run once even if both paths fire.
4. `finishMeeting()` runs in `after()` (route `maxDuration` 300 s). It stores participants and paragraph-sized segments, runs `analyze` (title, speaker-name guesses, chapters, action items, insights), then the default-template summary, so the summary already uses the guessed names. The summary is skipped if analysis took long enough to threaten the time budget; the Summary tab then offers Generate. Finally the meeting is marked `ready`.
5. Every state change is a conditional `UPDATE`. The status route also fails abandoned uploads (30 min) and releases meetings stuck in `analyzing` (20 min).

Without a public URL (local dev), no webhook is registered and the status poll drives step 3. With webhooks on, the poll still steps in if a webhook is ~10 min late.

### AI output you can verify

The LLM never writes timestamps. The transcript is sent as `[id] (mm:ss) Name: text` lines, and every summary bullet, action item, decision, chapter and Q&A answer cites **segment ids**. The server drops ids that don't exist and maps the rest to `start_ms`. Invented citations can't produce broken links, and every claim links to the moment it came from. All model output is parsed against zod schemas (the same schemas are sent to Gemini as `responseJsonSchema`).

### Providers are swappable

```ts
interface AsrProvider { transcribe(...): Promise<{ jobId }>; getResult(jobId): Promise<AsrResult> }
interface LlmProvider { analyze(t); summarize(t, template); ask(t, question) }
```

Chosen by `ASR_PROVIDER` / `LLM_PROVIDER` (`src/lib/providers/`). Prompts are provider-agnostic (`prompts.ts`), so a Claude or OpenAI provider only has to implement the transport. Gemini is the one implemented now; it retries 429/5xx within a time budget, honors `retryDelay`, fails fast on daily quota, and can fall back to `GEMINI_FALLBACK_MODEL` on 503.

### Other decisions

- **Clips are ranges, not files.** A highlight is `(meeting, start_ms, end_ms)`, and the clip player plays that slice of the original media, so nothing is transcoded.
- **Search is Postgres FTS.** A generated `tsvector` column with a GIN index, `websearch_to_tsquery`, and `ts_headline` snippets (split on control-character markers and rendered as `<mark>`, never as HTML). There's no separate search service.
- **Whole-transcript context, no RAG.** A 1-hour transcript fits in the model's context, so Ask and summaries see everything.
- **Seeds cost nothing to reset.** Transcripts and LLM outputs for the demo meetings are committed fixtures (`seed/fixtures/`). `pnpm seed` rebuilds the database from them with no API calls.

### How a real meeting bot would plug in

A bot (e.g. Recall.ai, or a headless-browser bot joining Zoom/Meet) would replace steps 1–2 only. When the call ends, it uploads the recording to R2 (or hands AssemblyAI a URL) and creates the meeting row, with a new `source` value (today it's `seed | upload`) and the real start time and attendees. Steps 3–5 stay as they are. Calendar OAuth would decide which calls the bot joins, and per-attendee emails would reuse the share links. Speaker names could come from the meeting platform's participant events instead of AI guesses.

---

## Guardrails (public app, no auth)

| Risk | Guard |
|---|---|
| Large or long uploads | ≤ 100 MB (checked at sign time and enforced by the signed Content-Length) and ≤ 15 min (checked in the browser and against AssemblyAI's measured duration) |
| API spend | Per-IP daily limits in `upload_quota` (salted IP hash, atomic upsert): `UPLOAD_DAILY_LIMIT` (3), `ASK_DAILY_LIMIT` (30); spend caps on the provider dashboards |
| Vandalism of the demo | Seeded meetings, clips and share links are `is_protected`: delete, rename, merge and revoke return errors and are disabled in the UI. Non-destructive edits (speaker rename, action-item check-off) are allowed, and a reseed restores everything |
| Share pages | Unguessable 96-bit tokens, `noindex`, revocable; they show the recording and notes read-only, not Ask, clips or editing |

There is no authentication by design (the brief allows it): anyone with a meeting URL can open it.

## Cut, and why

Real meeting bot, calendar integration, auth and multiple users, team spaces and team-only sharing, playlists, CRM/Slack integrations, email delivery, API/MCP, billing, desktop app. None of these change the core loop (recording → transcript → verifiable notes → shared recap), and each would take hours of integration work with no reviewer-visible payoff. The upload path goes through the same pipeline a bot would feed, and the section above shows where a bot connects.

---

## Running locally

Requires Node 20+, pnpm, a Neon (or any Postgres) database, an R2 bucket with public access, and AssemblyAI + Gemini keys. `ffmpeg` is only needed to rebuild seed media.

```bash
pnpm install
cp .env.example .env.local        # fill in DATABASE_URL, R2_*, ASSEMBLYAI_API_KEY, GEMINI_API_KEY
pnpm db:migrate                   # create tables
pnpm check-services               # optional: verifies DB + R2 round trip
pnpm seed                         # load the demo meetings from committed fixtures (no API calls)
pnpm dev                          # http://localhost:3000
```

The R2 bucket needs a CORS rule that allows `PUT` from your origin (e.g. `http://localhost:3000` and the production URL) with the `content-type` header, and `GET`/`HEAD` for playback.

**Reset the demo:** `pnpm seed` wipes all meetings (including uploads) and reloads the five demos with the same ids, share tokens and clips. Run it before handing the app to reviewers.

**Rebuilding the seed data from scratch** (only needed to change the demo set, and it costs API calls): download the sources listed in `seed/sources.ts` into `media-work/raw/`, then `pnpm prepare-media` (ffmpeg → R2) and `pnpm build-fixtures` (AssemblyAI + Gemini → `seed/fixtures/`; resumable).

| Script | What it does |
|---|---|
| `pnpm dev` / `build` / `start` | Next.js |
| `pnpm typecheck` / `lint` | `next typegen` + `tsc`, ESLint |
| `pnpm db:generate` / `db:migrate` | Drizzle migrations |
| `pnpm seed` | Reset the database to the demo state from fixtures |
| `pnpm prepare-media` | Transcode seed media, extract posters, upload to R2 |
| `pnpm build-fixtures` | Transcribe + analyze seed media into fixtures |
| `pnpm check-services` | DB and R2 smoke test |

### Environment

See `.env.example`. For production, also set `PUBLIC_BASE_URL` (enables AssemblyAI webhooks), `ASSEMBLYAI_WEBHOOK_SECRET` and `IP_HASH_SALT`.

## Project layout

```
src/app/                  pages, route handlers (api/), server actions (actions.ts)
src/components/meeting/   meeting page: player context, transcript, timeline, notes tabs, clips
src/lib/pipeline.ts       upload pipeline + on-demand summaries and Q&A
src/lib/providers/        ASR/LLM interfaces, AssemblyAI, Gemini, prompts, zod schemas
src/lib/analysis.ts       validates LLM segment citations, maps them to times
src/lib/queries.ts        read queries (meeting page, lists, search, share pages)
src/db/schema.ts          Drizzle schema
scripts/                  seed, fixture builder, media prep
seed/                     sources + committed fixtures
docs/PLAN.md, PROGRESS.md build plan and progress log
.agent-logs/              AI coding session logs (see CAPTURE-TEST.md)
```

## Testing

There's no automated test suite, a deliberate trade-off for the time box. Each slice was checked by driving the real app in headless Chrome over the DevTools protocol, with real mouse and keyboard input. That covered sync and seeking, search, rename/merge, share and revoke, the full upload pipeline (both webhook and polling paths), Ask, clips (including the stop at the clip's end), global search, settings, the mobile layout and keyboard shortcuts. Server-side guards (protected rows, quotas, validation) were also exercised directly. `docs/PROGRESS.md` records what was verified and the bugs found along the way.

## Media and licenses

| Meeting | Source | License |
|---|---|---|
| Community Board seats: call for feedback | Wikimedia Foundation, [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Call_for_feedback_Community_Board_seats_2021-02-20_-_First_meeting.webm) | CC BY-SA 3.0 (our transcode is shared under the same license) |
| CiviWiki weekly meetings (2018-02-19, 05-14, 05-28) | CiviWiki team, [Internet Archive](https://archive.org/details/CiviWikiWeeklyMeeting20180528) | CC0 |
| Editor engagement roundtable | Wikimedia Foundation, [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Engagement_Roundtable_1_-_Part_1.webm) | CC BY-SA 3.0 |

Attribution is also shown on each meeting page. Transcripts and notes are machine-generated and may contain errors.
