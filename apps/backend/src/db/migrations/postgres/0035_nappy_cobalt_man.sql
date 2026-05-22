CREATE TABLE "analytics_cluster_daily_summaries" (
	"day" date NOT NULL,
	"network_cluster_key" text NOT NULL,
	"confidence" text DEFAULT 'low' NOT NULL,
	"device_count" integer DEFAULT 0 NOT NULL,
	"session_count" integer DEFAULT 0 NOT NULL,
	"event_count" integer DEFAULT 0 NOT NULL,
	"pageview_count" integer DEFAULT 0 NOT NULL,
	"search_count" integer DEFAULT 0 NOT NULL,
	"resolve_count" integer DEFAULT 0 NOT NULL,
	"listen_on_click_count" integer DEFAULT 0 NOT NULL,
	"similar_artist_click_count" integer DEFAULT 0 NOT NULL,
	"popular_track_click_count" integer DEFAULT 0 NOT NULL,
	"upcoming_event_click_count" integer DEFAULT 0 NOT NULL,
	"player_start_count" integer DEFAULT 0 NOT NULL,
	"info_page_click_count" integer DEFAULT 0 NOT NULL,
	"help_page_click_count" integer DEFAULT 0 NOT NULL,
	"ui_click_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_analytics_cluster_daily_summaries" PRIMARY KEY("day","network_cluster_key"),
	CONSTRAINT "chk_analytics_cluster_daily_confidence" CHECK ("analytics_cluster_daily_summaries"."confidence" IN ('low', 'medium', 'high')),
	CONSTRAINT "chk_analytics_cluster_daily_counts_nonnegative" CHECK ("analytics_cluster_daily_summaries"."device_count" >= 0
        AND "analytics_cluster_daily_summaries"."session_count" >= 0
        AND "analytics_cluster_daily_summaries"."event_count" >= 0
        AND "analytics_cluster_daily_summaries"."pageview_count" >= 0
        AND "analytics_cluster_daily_summaries"."search_count" >= 0
        AND "analytics_cluster_daily_summaries"."resolve_count" >= 0
        AND "analytics_cluster_daily_summaries"."listen_on_click_count" >= 0
        AND "analytics_cluster_daily_summaries"."similar_artist_click_count" >= 0
        AND "analytics_cluster_daily_summaries"."popular_track_click_count" >= 0
        AND "analytics_cluster_daily_summaries"."upcoming_event_click_count" >= 0
        AND "analytics_cluster_daily_summaries"."player_start_count" >= 0
        AND "analytics_cluster_daily_summaries"."info_page_click_count" >= 0
        AND "analytics_cluster_daily_summaries"."help_page_click_count" >= 0
        AND "analytics_cluster_daily_summaries"."ui_click_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"event_type" text NOT NULL,
	"session_id" uuid NOT NULL,
	"device_key" text,
	"network_cluster_key" text NOT NULL,
	"confidence" text DEFAULT 'low' NOT NULL,
	"path" text,
	"route_template" text,
	"referrer_domain" text,
	"device_class" text,
	"browser_family" text,
	"os_family" text,
	"platform" text,
	"media_type" text,
	"short_id" text,
	"surface" text,
	"element_key" text,
	"x_pct" real,
	"y_pct" real,
	"viewport_bucket" text,
	"event_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "chk_analytics_events_event_type" CHECK ("analytics_events"."event_type" IN ('page_view', 'search_submitted', 'resolve_started', 'resolve_succeeded', 'resolve_failed', 'listen_on_clicked', 'similar_artist_clicked', 'popular_track_clicked', 'upcoming_event_clicked', 'player_started', 'player_paused', 'player_resumed', 'player_completed', 'player_unavailable', 'info_page_clicked', 'help_page_clicked', 'ui_click')),
	CONSTRAINT "chk_analytics_events_confidence" CHECK ("analytics_events"."confidence" IN ('low', 'medium', 'high')),
	CONSTRAINT "chk_analytics_events_x_pct" CHECK ("analytics_events"."x_pct" IS NULL OR "analytics_events"."x_pct" BETWEEN 0 AND 100),
	CONSTRAINT "chk_analytics_events_y_pct" CHECK ("analytics_events"."y_pct" IS NULL OR "analytics_events"."y_pct" BETWEEN 0 AND 100),
	CONSTRAINT "chk_analytics_events_viewport_bucket" CHECK ("analytics_events"."viewport_bucket" IS NULL OR "analytics_events"."viewport_bucket" IN ('mobile', 'tablet', 'desktop'))
);
--> statement-breakpoint
CREATE TABLE "analytics_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"device_key" text,
	"network_cluster_key" text NOT NULL,
	"confidence" text DEFAULT 'low' NOT NULL,
	"entry_path" text,
	"exit_path" text,
	"pageview_count" integer DEFAULT 0 NOT NULL,
	"event_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "chk_analytics_sessions_confidence" CHECK ("analytics_sessions"."confidence" IN ('low', 'medium', 'high')),
	CONSTRAINT "chk_analytics_sessions_pageviews_nonnegative" CHECK ("analytics_sessions"."pageview_count" >= 0),
	CONSTRAINT "chk_analytics_sessions_events_nonnegative" CHECK ("analytics_sessions"."event_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_session_id_analytics_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."analytics_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_analytics_cluster_daily_day" ON "analytics_cluster_daily_summaries" USING btree ("day" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_analytics_cluster_daily_cluster_day" ON "analytics_cluster_daily_summaries" USING btree ("network_cluster_key","day" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_analytics_events_occurred_at" ON "analytics_events" USING btree ("occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_analytics_events_type_occurred" ON "analytics_events" USING btree ("event_type","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_analytics_events_cluster_occurred" ON "analytics_events" USING btree ("network_cluster_key","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_analytics_events_session_occurred" ON "analytics_events" USING btree ("session_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_analytics_events_route_type_occurred" ON "analytics_events" USING btree ("route_template","event_type","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_analytics_events_platform_occurred" ON "analytics_events" USING btree ("platform","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_analytics_sessions_cluster_first_seen" ON "analytics_sessions" USING btree ("network_cluster_key","first_seen_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_analytics_sessions_device_first_seen" ON "analytics_sessions" USING btree ("device_key","first_seen_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_analytics_sessions_last_seen" ON "analytics_sessions" USING btree ("last_seen_at" DESC NULLS LAST);