CREATE TYPE "public"."insight_kind" AS ENUM('decision', 'key_point', 'open_question');--> statement-breakpoint
CREATE TYPE "public"."item_source" AS ENUM('ai', 'manual');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('video', 'audio');--> statement-breakpoint
CREATE TYPE "public"."meeting_source" AS ENUM('seed', 'upload');--> statement-breakpoint
CREATE TYPE "public"."meeting_status" AS ENUM('uploaded', 'transcribing', 'analyzing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."share_resource" AS ENUM('meeting', 'highlight');--> statement-breakpoint
CREATE TYPE "public"."summary_status" AS ENUM('pending', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."template_id" AS ENUM('general', 'sales', 'customer_success', 'demo', 'qa', 'retrospective');--> statement-breakpoint
CREATE TABLE "action_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"text" text NOT NULL,
	"owner_participant_id" uuid,
	"owner_text" text,
	"due_text" text,
	"due_date" date,
	"seg_idx" integer,
	"start_ms" integer,
	"done" boolean DEFAULT false NOT NULL,
	"source" "item_source" DEFAULT 'ai' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chapters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"idx" integer NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"start_ms" integer NOT NULL,
	"end_ms" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "highlights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"title" text NOT NULL,
	"note" text,
	"start_ms" integer NOT NULL,
	"end_ms" integer NOT NULL,
	"is_protected" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"kind" "insight_kind" NOT NULL,
	"text" text NOT NULL,
	"seg_idx" integer,
	"start_ms" integer
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"duration_ms" integer,
	"media_url" text,
	"media_key" text,
	"media_kind" "media_kind" DEFAULT 'video' NOT NULL,
	"poster_url" text,
	"status" "meeting_status" DEFAULT 'uploaded' NOT NULL,
	"error" text,
	"source" "meeting_source" NOT NULL,
	"is_protected" boolean DEFAULT false NOT NULL,
	"asr_job_id" text,
	"uploader_ip_hash" text,
	"attribution_text" text,
	"attribution_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"speaker_label" text NOT NULL,
	"display_name" text NOT NULL,
	"color" text NOT NULL,
	"talk_ms" integer DEFAULT 0 NOT NULL,
	"segment_count" integer DEFAULT 0 NOT NULL,
	"is_name_guessed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qa_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"citations" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"resource_type" "share_resource" NOT NULL,
	"resource_id" uuid NOT NULL,
	"is_protected" boolean DEFAULT false NOT NULL,
	"revoked_at" timestamp with time zone,
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "share_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"template" "template_id" NOT NULL,
	"status" "summary_status" DEFAULT 'pending' NOT NULL,
	"content" jsonb,
	"markdown" text,
	"model" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcript_segments" (
	"id" serial PRIMARY KEY NOT NULL,
	"meeting_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"idx" integer NOT NULL,
	"start_ms" integer NOT NULL,
	"end_ms" integer NOT NULL,
	"text" text NOT NULL,
	"words" jsonb,
	"tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', "text")) STORED
);
--> statement-breakpoint
CREATE TABLE "upload_quota" (
	"ip_hash" text NOT NULL,
	"day" date NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "upload_quota_ip_hash_day_pk" PRIMARY KEY("ip_hash","day")
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"default_template" "template_id" DEFAULT 'general' NOT NULL,
	"auto_action_items" boolean DEFAULT true NOT NULL,
	"bot_name" text DEFAULT 'Notetaker' NOT NULL,
	"auto_share" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_owner_participant_id_participants_id_fk" FOREIGN KEY ("owner_participant_id") REFERENCES "public"."participants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "highlights" ADD CONSTRAINT "highlights_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa_messages" ADD CONSTRAINT "qa_messages_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "summaries" ADD CONSTRAINT "summaries_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "action_items_meeting_idx" ON "action_items" USING btree ("meeting_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chapters_meeting_idx_uq" ON "chapters" USING btree ("meeting_id","idx");--> statement-breakpoint
CREATE INDEX "highlights_meeting_idx" ON "highlights" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "insights_meeting_idx" ON "insights" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "meetings_owner_started_idx" ON "meetings" USING btree ("owner_id","started_at");--> statement-breakpoint
CREATE INDEX "meetings_asr_job_idx" ON "meetings" USING btree ("asr_job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "participants_meeting_label_uq" ON "participants" USING btree ("meeting_id","speaker_label");--> statement-breakpoint
CREATE INDEX "qa_meeting_idx" ON "qa_messages" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "share_links_resource_idx" ON "share_links" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "summaries_meeting_template_uq" ON "summaries" USING btree ("meeting_id","template");--> statement-breakpoint
CREATE UNIQUE INDEX "segments_meeting_idx_uq" ON "transcript_segments" USING btree ("meeting_id","idx");--> statement-breakpoint
CREATE INDEX "segments_meeting_start_idx" ON "transcript_segments" USING btree ("meeting_id","start_ms");--> statement-breakpoint
CREATE INDEX "segments_tsv_idx" ON "transcript_segments" USING gin ("tsv");