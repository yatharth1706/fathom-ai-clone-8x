import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { TEMPLATE_IDS, type AsrWord, type SummaryContent } from "../lib/providers/types";

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// ---------- enums ----------

export const meetingStatus = pgEnum("meeting_status", [
  "uploaded",
  "transcribing",
  "analyzing",
  "ready",
  "failed",
]);
export const meetingSource = pgEnum("meeting_source", ["seed", "upload"]);
export const mediaKind = pgEnum("media_kind", ["video", "audio"]);
export const templateId = pgEnum("template_id", TEMPLATE_IDS);
export const summaryStatus = pgEnum("summary_status", ["pending", "ready", "failed"]);
export const itemSource = pgEnum("item_source", ["ai", "manual"]);
export const insightKind = pgEnum("insight_kind", ["decision", "key_point", "open_question"]);
export const shareResource = pgEnum("share_resource", ["meeting", "highlight"]);

// ---------- users ----------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  avatarUrl: text("avatar_url"),
  createdAt: createdAt(),
});

export const userSettings = pgTable("user_settings", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  defaultTemplate: templateId("default_template").notNull().default("general"),
  autoActionItems: boolean("auto_action_items").notNull().default(true),
  botName: text("bot_name").notNull().default("Notetaker"),
  autoShare: boolean("auto_share").notNull().default(false),
});

// ---------- meetings ----------

export const meetings = pgTable(
  "meetings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    durationMs: integer("duration_ms"),
    mediaUrl: text("media_url"),
    mediaKey: text("media_key"), // R2 object key
    mediaKind: mediaKind("media_kind").notNull().default("video"),
    posterUrl: text("poster_url"),
    status: meetingStatus("status").notNull().default("uploaded"),
    error: text("error"),
    source: meetingSource("source").notNull(),
    isProtected: boolean("is_protected").notNull().default(false),
    asrJobId: text("asr_job_id"),
    uploaderIpHash: text("uploader_ip_hash"),
    attributionText: text("attribution_text"),
    attributionUrl: text("attribution_url"),
    createdAt: createdAt(),
  },
  (t) => [index("meetings_owner_started_idx").on(t.ownerId, t.startedAt), index("meetings_asr_job_idx").on(t.asrJobId)],
);

export const participants = pgTable(
  "participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    speakerLabel: text("speaker_label").notNull(), // provider label, e.g. "A"
    displayName: text("display_name").notNull(),
    color: text("color").notNull(),
    talkMs: integer("talk_ms").notNull().default(0),
    segmentCount: integer("segment_count").notNull().default(0),
    isNameGuessed: boolean("is_name_guessed").notNull().default(false),
  },
  (t) => [uniqueIndex("participants_meeting_label_uq").on(t.meetingId, t.speakerLabel)],
);

export const transcriptSegments = pgTable(
  "transcript_segments",
  {
    id: serial("id").primaryKey(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(), // position within meeting; what the LLM cites
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    text: text("text").notNull(),
    words: jsonb("words").$type<AsrWord[]>(),
    tsv: tsvector("tsv").generatedAlwaysAs(sql`to_tsvector('english', "text")`),
  },
  (t) => [
    uniqueIndex("segments_meeting_idx_uq").on(t.meetingId, t.idx),
    index("segments_meeting_start_idx").on(t.meetingId, t.startMs),
    index("segments_tsv_idx").using("gin", t.tsv),
  ],
);

// ---------- AI outputs ----------

export const summaries = pgTable(
  "summaries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    template: templateId("template").notNull(),
    status: summaryStatus("status").notNull().default("pending"),
    content: jsonb("content").$type<SummaryContent>(),
    markdown: text("markdown"),
    model: text("model"),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("summaries_meeting_template_uq").on(t.meetingId, t.template)],
);

export const actionItems = pgTable(
  "action_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    ownerParticipantId: uuid("owner_participant_id").references(() => participants.id, { onDelete: "set null" }),
    ownerText: text("owner_text"),
    dueText: text("due_text"),
    dueDate: date("due_date"),
    segIdx: integer("seg_idx"),
    startMs: integer("start_ms"),
    done: boolean("done").notNull().default(false),
    source: itemSource("source").notNull().default("ai"),
    createdAt: createdAt(),
  },
  (t) => [index("action_items_meeting_idx").on(t.meetingId)],
);

export const insights = pgTable(
  "insights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    kind: insightKind("kind").notNull(),
    text: text("text").notNull(),
    segIdx: integer("seg_idx"),
    startMs: integer("start_ms"),
  },
  (t) => [index("insights_meeting_idx").on(t.meetingId)],
);

export const chapters = pgTable(
  "chapters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
  },
  (t) => [uniqueIndex("chapters_meeting_idx_uq").on(t.meetingId, t.idx)],
);

export const qaMessages = pgTable(
  "qa_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    citations: jsonb("citations").$type<{ segIdx: number; startMs: number }[]>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("qa_meeting_idx").on(t.meetingId)],
);

// ---------- highlights & sharing ----------

export const highlights = pgTable(
  "highlights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    note: text("note"),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    isProtected: boolean("is_protected").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("highlights_meeting_idx").on(t.meetingId)],
);

// Polymorphic (meeting | highlight), so no FK on resource_id; rows are removed alongside their resource in code.
export const shareLinks = pgTable(
  "share_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    token: text("token").notNull().unique(),
    resourceType: shareResource("resource_type").notNull(),
    resourceId: uuid("resource_id").notNull(),
    isProtected: boolean("is_protected").notNull().default(false),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    viewCount: integer("view_count").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("share_links_resource_idx").on(t.resourceType, t.resourceId)],
);

// ---------- abuse limits ----------

export const uploadQuota = pgTable(
  "upload_quota",
  {
    ipHash: text("ip_hash").notNull(),
    day: date("day").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.ipHash, t.day] })],
);
