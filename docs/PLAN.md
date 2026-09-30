# Fathom clone — build plan

An AI meeting notetaker in the spirit of fathom.video. Capture is faked: instead of a bot joining the call, a recording is **uploaded** (or pre-seeded) and goes through the same pipeline a bot would feed:

```
media → transcription + diarization → LLM analysis (summary, action items, decisions, chapters) → meeting page / share links
```

No auth, no multi-user, no real bot (all explicitly allowed by the brief). One seeded demo user owns everything.

## Stack

| Layer | Choice | Why |
|---|---|---|
| App | Next.js (App Router) + TypeScript + Tailwind + shadcn/ui on Vercel | One deployable, no separate backend |
| DB | Neon Postgres + Drizzle | Serverless-friendly, full-text search built in |
| Media | Cloudflare R2, presigned direct upload | No egress fees; avoids Vercel 4.5 MB body and Supabase 50 MB file limits |
| ASR | AssemblyAI (behind `AsrProvider`) | Good diarization, `speakers_expected` hint, webhooks |
| LLM | Google Gemini, structured JSON output (behind `LlmProvider`) | Free tier; swappable to Claude/OpenAI via `LLM_PROVIDER` env |

### Provider interfaces

```ts
interface AsrProvider {
  transcribe(input: { audioUrl: string; speakersExpected?: number; webhookUrl?: string }): Promise<{ jobId: string }>;
  getResult(jobId: string): Promise<AsrResult | { status: "processing" } | { status: "error"; error: string }>;
}
interface LlmProvider {
  analyze(t: TranscriptForLlm): Promise<Analysis>;          // title, chapters, action items, decisions, speaker-name guesses
  summarize(t: TranscriptForLlm, template: TemplateId): Promise<SummaryContent>;
  ask(t: TranscriptForLlm, question: string): Promise<{ answer: string; citations: SegmentRef[] }>;
}
```

Selected by `ASR_PROVIDER` (`assemblyai`) and `LLM_PROVIDER` (`gemini` | `claude` | `openai`). All LLM output is validated with zod. The LLM cites **segment IDs**, never raw timestamps; the server validates IDs and maps them to `start_ms`.

## Priorities

### P0 — must ship (hard line at ~hour 12)

| Feature | Reason |
|---|---|
| Meetings list (status, duration, participants) | Entry point / dashboard |
| Meeting page: player ↔ transcript sync (highlight current, click-to-seek, auto-scroll that pauses on manual scroll) | Core experience |
| Speaker labels, colors, rename / merge | Diarization gives "Speaker A–H"; unusable without names |
| AI summary + template switcher + copy (Markdown / rich text) | Headline feature |
| Action items (owner, due, timestamp) + decisions | Most-used output |
| Timestamp deep links everywhere (`?t=`), one `seekTo(ms)` | Makes AI output verifiable |
| In-transcript search | Required for 1-hour transcripts |
| Upload → transcribe → analyze pipeline with status | Proves the bot substitute works; reviewers can test it |
| Public meeting share page `/share/m/[token]` | "Recap reaches attendees" loop |

### P1 — in order

| Feature | Reason |
|---|---|
| Chapters on scrubber + list | Navigating long meetings; free from analysis pass |
| Talk-time stats + filter by speaker | 8-person differentiator |
| Ask this meeting (timestamp citations) | Whole transcript fits in context; no RAG |
| Highlights / clips + `/share/clip/[token]` | Same media with start/end bounds; no transcoding |
| Global search (Postgres FTS) → jump to timestamp | Cross-meeting value |
| Minimal settings (default template, auto action items, bot name) | Only settings the pipeline actually reads |
| Action item check-off / edit | Small, makes it feel alive |
| Keyboard shortcuts, playback speed 1–2× | Long meetings |

### Cut (explained in README)

Real bot, calendar OAuth, auth / multi-user, team-only sharing, Team Meetings, Playlists, desktop app / extension, CRM integrations, API / MCP, billing, email sending, calendar stub.

## Data model

```
users            id, name, email, avatar_url                    -- one seeded demo user
user_settings    user_id PK, default_template, auto_action_items, bot_name, auto_share

meetings         id, owner_id, title, started_at, duration_ms,
                 media_url, media_kind (video|audio), poster_url,
                 status (uploaded|transcribing|analyzing|ready|failed), error,
                 source (seed|upload), is_protected bool, asr_job_id,
                 uploader_ip_hash, attribution_text, attribution_url, created_at

participants     id, meeting_id, speaker_label, display_name, color,
                 talk_ms, segment_count, is_name_guessed

transcript_segments
                 id, meeting_id, participant_id, idx, start_ms, end_ms,
                 text, words jsonb [{w,s,e}], tsv tsvector GENERATED
                 index (meeting_id, start_ms), GIN(tsv)

summaries        id, meeting_id, template, status (pending|ready|failed),
                 content jsonb {sections:[{heading, bullets:[{text, seg_ids[]}]}]},
                 markdown, model, created_at          UNIQUE(meeting_id, template)

action_items     id, meeting_id, text, owner_participant_id NULL, owner_text,
                 due_text, due_date NULL, segment_id, start_ms, done, source (ai|manual)

insights         id, meeting_id, kind (decision|key_point|open_question), text, segment_id, start_ms
chapters         id, meeting_id, idx, title, summary, start_ms, end_ms
highlights       id, meeting_id, title, note, start_ms, end_ms, is_protected, created_at
share_links      id, token, resource_type (meeting|highlight), resource_id,
                 is_protected, revoked_at, view_count, created_at
qa_messages      id, meeting_id, question, answer, citations jsonb, created_at
upload_quota     ip_hash, day, count                    PK(ip_hash, day)
```

Templates (General, Sales, Customer Success, Demo, Q&A, Retrospective) are prompt configs in code. Action items / insights / chapters are template-independent and generated once.

## Guardrails (no auth, public upload)

- **Upload limits:** ≤ 100 MB and ≤ 15 min per file (size checked at presign and by R2 content-length condition; duration checked client-side via media metadata and server-side from ASR `audio_duration` — job aborted and meeting marked failed if exceeded). Per-IP daily limit (default 3/day, `UPLOAD_DAILY_LIMIT`), tracked in `upload_quota` by salted IP hash.
- **Spend caps:** set on AssemblyAI and Gemini/Claude keys in their dashboards. Gemini free tier is rate-limited by design.
- **Seeded content is protected:** `is_protected` on seeded meetings, their highlights and share links. Delete / revoke / rename-meeting return 403 for protected rows (UI hides the buttons). Non-destructive edits on seeds (speaker rename, action item check-off) are allowed; a reset restores them.
- **Reset:** `pnpm seed` is idempotent — wipes and reloads everything from `seed/fixtures/` with no API calls. Run before submission.

## Pipeline

**Uploads (prod):**
1. `POST /api/uploads/sign` → quota + size check → presigned R2 PUT, meeting row `uploaded`.
2. Browser PUTs directly to R2, then `POST /api/meetings/[id]/process`.
3. `asr.transcribe()` with webhook → status `transcribing`.
4. `POST /api/webhooks/assemblyai` (secret header) → store segments / participants → `llm.analyze()` ‖ `llm.summarize(defaultTemplate)` (route `maxDuration` 300) → `ready`.
5. Page polls `GET /api/meetings/[id]/status` every 3 s.

**Polling fallback (local dev):** when `PUBLIC_BASE_URL` is unset or localhost, no webhook is registered; the status endpoint calls `asr.getResult(jobId)` on each poll and advances the pipeline itself when the transcript completes (guarded by a status transition so it runs once). Same code path as the webhook handler.

Other templates generate on demand (`POST /api/meetings/[id]/summaries/[template]`) and are cached.

## Seed data

`scripts/seed.ts` loads only from `seed/fixtures/` (committed). Fixtures are produced once by `scripts/build-fixtures.ts`.

| Slot | Source | Transcript | License |
|---|---|---|---|
| Long meeting (51 min, 8 speakers, video) | [Community Board seats call for feedback, 2021-02-20](https://commons.wikimedia.org/wiki/File:Call_for_feedback_Community_Board_seats_2021-02-20_-_First_meeting.webm) — open Zoom discussion, clean audio; chosen over two presentation-style CC BY calls | AssemblyAI | CC BY-SA 3.0 — attribution on meeting page; our transcode carries the same license |
| 3 short team syncs (11–21 min, video) | CiviWiki weekly meetings [2018-05-28](https://archive.org/details/CiviWikiWeeklyMeeting20180528), [2018-05-14](https://archive.org/details/CiviWikiWeeklyMeeting20180514), [2018-02-19](https://archive.org/details/CiviWikiWeeklyMeeting20180219) (Internet Archive) — same open-source team across weeks, screen-shared PRs / sprint board | AssemblyAI | CC0 |
| 1 in-person roundtable (17 min, video) | [Editor engagement roundtable, 2013-06-22](https://commons.wikimedia.org/wiki/File:Engagement_Roundtable_1_-_Part_1.webm) — many voices, real faces | AssemblyAI | CC BY-SA 3.0 |

**Why not AMI:** originally planned (free human transcripts, recurring team), but the Edinburgh download server was unusable (~3 KB/s, connection resets) and the Hugging Face mirror has no full-meeting audio. CiviWiki gives the recurring-team angle with real video, through the same pipeline, and needs no separate parser.

**Media processing** (`pnpm prepare-media`, local ffmpeg): H.264 ≤540p CRF 28 + AAC 96k, `+faststart`; `loudnorm` (several sources are recorded very quietly); poster frame; 16 kHz mono MP3 for ASR. Upload to R2 under `seed/<slug>/`.

**Transcripts** (`pnpm build-fixtures`): AssemblyAI once per source → `seed/fixtures/<slug>/asr.json`, resumable via saved job ids.

**Long-meeting criteria:** explicit CC license on the source page, clean per-person audio (Zoom), little crosstalk, visible speaker names. A clean 6–7 person meeting beats a messy 8-person one.

## Routes

```
/                       → /meetings
/meetings               list, upload, status chips
/meetings/[id]?t=       meeting page
/search?q=              global search
/highlights             clips
/settings
/share/m/[token]        public read-only meeting
/share/clip/[token]     public clip
/api/uploads/sign  /api/meetings/[id]/process  /api/meetings/[id]/status
/api/webhooks/assemblyai  /api/meetings/[id]/summaries/[template]  /api/meetings/[id]/ask
```

### Meeting page (hour-long, 8 people)

- **Header:** title, date, duration, avatar stack (→ talk-time + rename), Share, "Copy link at current time".
- **Left (~60%):** player; scrubber with chapter segments (+ optional per-speaker lanes); tabs Summary (template dropdown, copy) · Action items · Decisions · Chapters · Highlights · Ask.
- **Right:** transcript — search (n/m), speaker filter chips, active segment pinned ~⅓ from top, manual scroll pauses follow and shows "Jump to current", long turns split into ≤ 30 s paragraphs, text selection → "Create clip".
- One `seekTo(ms)` used by every timestamp. Keyboard: space, ←/→ 5 s, `/`, speed.
- Mobile: sticky player, Transcript as a tab.

## Build plan (~20 h)

| Hour | Slice | Checkpoint |
|---|---|---|
| 0–1 | Scaffold (Next, Tailwind, shadcn, Drizzle, provider interfaces stub), deploy to Vercel. **In parallel:** pick + validate long meeting (license, audio), start downloads | Live in prod; long meeting chosen |
| 1–2 | Schema + migrations; ffmpeg transcode; R2 bucket + CORS; upload seed media | |
| 2–3 | AssemblyAI provider; fixture builder; transcribe all seed meetings | |
| 3–4 | Fixture builder + idempotent seed loader; meetings list with real data | |
| 4–6 | Meeting page: player, transcript, sync, seek, auto-scroll, speakers | **E2E slice in prod** |
| 6–8 | Gemini provider: analyze + summarize (zod), segment-linked summary, action items, decisions, chapters; all templates in fixtures; switcher + copy | |
| 8–9 | Speaker rename/merge + name guesses; in-transcript search | |
| 9–10 | Share links + `/share/m/[token]`; protected-row guards | |
| 10–12 | Upload: presign, quota, process, webhook + polling fallback, status UI; test 5-min file in prod | **P0 complete** |
| 12–13 | Chapters on scrubber; talk-time + speaker filter | |
| 13–14 | Ask this meeting | |
| 14–15 | Highlights / clips + clip share page | |
| 15–16 | Global search | |
| 16–17 | Settings; action item check-off | |
| 17–18 | Polish: empty/loading/error states, keyboard, mobile | |
| 18–19 | README: architecture, cuts, how a real bot plugs in, reset instructions | |
| 19–20 | Buffer, demo video, reset seeds, final push | |

Every slice commit includes `.agent-logs/`.

## Risks

| Risk | Mitigation |
|---|---|
| Diarization on many speakers | Pick clean audio in hour 0–1; `speakers_expected`; rename/merge UI |
| Large media | R2 presigned direct upload; seeds transcoded to 540p faststart; uploads capped at 100 MB and played as-is |
| Serverless timeouts | Webhook-driven ASR; parallel LLM calls in a `maxDuration` 300 route; extra templates on demand |
| Webhooks unreachable locally | Polling fallback through the status endpoint |
| Gemini free-tier rate limits | Seeds pre-generated into fixtures; on-demand calls retry with backoff and surface a clear error; provider swap via env |
| Player sync jank | rAF while playing, binary search, re-render only on active-segment change; faststart for instant seek |
| Hallucinated timestamps / owners | Segment-ID citations validated server-side; unknown owners kept as plain text |
| Cost / abuse from public upload | 15 min / 100 MB caps, per-IP daily limit, provider spend caps |
| Destructive actions on seeds | `is_protected` guards + idempotent reset from fixtures |
| Licensing | CC BY sources only, attribution on page + README; YouTube download noted as ToS grey area |
| Time | Hard P0 line at hour 12; everything after is optional |
