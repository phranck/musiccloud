CREATE TABLE "album_artist_credits" (
	"id" text PRIMARY KEY NOT NULL,
	"album_id" text NOT NULL,
	"artist_entity_id" text NOT NULL,
	"credit_name" text NOT NULL,
	"credit_position" integer DEFAULT 0 NOT NULL,
	"credit_role" text DEFAULT 'main' NOT NULL,
	"confidence" real,
	"match_method" text,
	"source_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_album_artist_credits_role" CHECK ("album_artist_credits"."credit_role" IN ('main', 'featured', 'remixer', 'producer', 'composer', 'lyricist', 'performer', 'unknown'))
);
--> statement-breakpoint
CREATE TABLE "artist_entities" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_type" text DEFAULT 'unknown' NOT NULL,
	"verification_status" text DEFAULT 'candidate' NOT NULL,
	"confidence" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_artist_entities_entity_type" CHECK ("artist_entities"."entity_type" IN ('person', 'group', 'persona', 'unknown')),
	CONSTRAINT "chk_artist_entities_verification_status" CHECK ("artist_entities"."verification_status" IN ('candidate', 'verified', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "artist_entity_events" (
	"id" text PRIMARY KEY NOT NULL,
	"artist_entity_id" text NOT NULL,
	"event_type" text NOT NULL,
	"date_value" date,
	"date_precision" text DEFAULT 'unknown' NOT NULL,
	"event_year" integer,
	"event_month" integer,
	"event_day" integer,
	"place_id" text,
	"source_id" text,
	"confidence" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_artist_entity_events_event_type" CHECK ("artist_entity_events"."event_type" IN ('birth', 'death', 'formed', 'disbanded')),
	CONSTRAINT "chk_artist_entity_events_date_precision" CHECK ("artist_entity_events"."date_precision" IN ('year', 'month', 'day', 'unknown')),
	CONSTRAINT "chk_artist_entity_events_month" CHECK ("artist_entity_events"."event_month" IS NULL OR "artist_entity_events"."event_month" BETWEEN 1 AND 12),
	CONSTRAINT "chk_artist_entity_events_day" CHECK ("artist_entity_events"."event_day" IS NULL OR "artist_entity_events"."event_day" BETWEEN 1 AND 31)
);
--> statement-breakpoint
CREATE TABLE "artist_entity_identifiers" (
	"id" text PRIMARY KEY NOT NULL,
	"artist_entity_id" text NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"external_url" text,
	"source_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artist_entity_names" (
	"id" text PRIMARY KEY NOT NULL,
	"artist_entity_id" text NOT NULL,
	"locale" text,
	"name" text NOT NULL,
	"name_type" text DEFAULT 'alias' NOT NULL,
	"source_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_artist_entity_names_name_type" CHECK ("artist_entity_names"."name_type" IN ('canonical', 'alias', 'legal', 'stage', 'credit', 'sort'))
);
--> statement-breakpoint
CREATE TABLE "artist_entity_texts" (
	"id" text PRIMARY KEY NOT NULL,
	"artist_entity_id" text NOT NULL,
	"locale" text NOT NULL,
	"text_type" text NOT NULL,
	"content" text NOT NULL,
	"source_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_artist_entity_texts_text_type" CHECK ("artist_entity_texts"."text_type" IN ('description', 'short_bio'))
);
--> statement-breakpoint
CREATE TABLE "artist_group_membership_roles" (
	"membership_id" text NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "pk_artist_group_membership_roles" PRIMARY KEY("membership_id","role")
);
--> statement-breakpoint
CREATE TABLE "artist_group_memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"group_artist_entity_id" text NOT NULL,
	"member_artist_entity_id" text NOT NULL,
	"member_name_credit" text,
	"begin_date" date,
	"begin_date_precision" text DEFAULT 'unknown' NOT NULL,
	"begin_year" integer,
	"begin_month" integer,
	"begin_day" integer,
	"end_date" date,
	"end_date_precision" text DEFAULT 'unknown' NOT NULL,
	"end_year" integer,
	"end_month" integer,
	"end_day" integer,
	"is_current" boolean,
	"source_id" text,
	"confidence" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_artist_group_memberships_not_self" CHECK ("artist_group_memberships"."group_artist_entity_id" <> "artist_group_memberships"."member_artist_entity_id"),
	CONSTRAINT "chk_artist_group_memberships_begin_precision" CHECK ("artist_group_memberships"."begin_date_precision" IN ('year', 'month', 'day', 'unknown')),
	CONSTRAINT "chk_artist_group_memberships_end_precision" CHECK ("artist_group_memberships"."end_date_precision" IN ('year', 'month', 'day', 'unknown')),
	CONSTRAINT "chk_artist_group_memberships_begin_month" CHECK ("artist_group_memberships"."begin_month" IS NULL OR "artist_group_memberships"."begin_month" BETWEEN 1 AND 12),
	CONSTRAINT "chk_artist_group_memberships_end_month" CHECK ("artist_group_memberships"."end_month" IS NULL OR "artist_group_memberships"."end_month" BETWEEN 1 AND 12),
	CONSTRAINT "chk_artist_group_memberships_begin_day" CHECK ("artist_group_memberships"."begin_day" IS NULL OR "artist_group_memberships"."begin_day" BETWEEN 1 AND 31),
	CONSTRAINT "chk_artist_group_memberships_end_day" CHECK ("artist_group_memberships"."end_day" IS NULL OR "artist_group_memberships"."end_day" BETWEEN 1 AND 31)
);
--> statement-breakpoint
CREATE TABLE "artist_source_payloads" (
	"source_id" text PRIMARY KEY NOT NULL,
	"raw_payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artist_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"provider_entity_id" text,
	"source_url" text,
	"confidence" real,
	"fetched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "place_identifiers" (
	"id" text PRIMARY KEY NOT NULL,
	"place_id" text NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"external_url" text,
	"source_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "place_names" (
	"id" text PRIMARY KEY NOT NULL,
	"place_id" text NOT NULL,
	"locale" text,
	"name" text NOT NULL,
	"source_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "places" (
	"id" text PRIMARY KEY NOT NULL,
	"country_code" text,
	"latitude" real,
	"longitude" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "track_artist_credits" (
	"id" text PRIMARY KEY NOT NULL,
	"track_id" text NOT NULL,
	"artist_entity_id" text NOT NULL,
	"credit_name" text NOT NULL,
	"credit_position" integer DEFAULT 0 NOT NULL,
	"credit_role" text DEFAULT 'main' NOT NULL,
	"confidence" real,
	"match_method" text,
	"source_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_track_artist_credits_role" CHECK ("track_artist_credits"."credit_role" IN ('main', 'featured', 'remixer', 'producer', 'composer', 'lyricist', 'performer', 'unknown'))
);
--> statement-breakpoint
ALTER TABLE "artists" ADD COLUMN "artist_entity_id" text;--> statement-breakpoint
ALTER TABLE "album_artist_credits" ADD CONSTRAINT "album_artist_credits_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "album_artist_credits" ADD CONSTRAINT "album_artist_credits_artist_entity_id_artist_entities_id_fk" FOREIGN KEY ("artist_entity_id") REFERENCES "public"."artist_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "album_artist_credits" ADD CONSTRAINT "album_artist_credits_source_id_artist_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."artist_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_entity_events" ADD CONSTRAINT "artist_entity_events_artist_entity_id_artist_entities_id_fk" FOREIGN KEY ("artist_entity_id") REFERENCES "public"."artist_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_entity_events" ADD CONSTRAINT "artist_entity_events_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_entity_events" ADD CONSTRAINT "artist_entity_events_source_id_artist_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."artist_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_entity_identifiers" ADD CONSTRAINT "artist_entity_identifiers_artist_entity_id_artist_entities_id_fk" FOREIGN KEY ("artist_entity_id") REFERENCES "public"."artist_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_entity_identifiers" ADD CONSTRAINT "artist_entity_identifiers_source_id_artist_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."artist_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_entity_names" ADD CONSTRAINT "artist_entity_names_artist_entity_id_artist_entities_id_fk" FOREIGN KEY ("artist_entity_id") REFERENCES "public"."artist_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_entity_names" ADD CONSTRAINT "artist_entity_names_source_id_artist_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."artist_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_entity_texts" ADD CONSTRAINT "artist_entity_texts_artist_entity_id_artist_entities_id_fk" FOREIGN KEY ("artist_entity_id") REFERENCES "public"."artist_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_entity_texts" ADD CONSTRAINT "artist_entity_texts_source_id_artist_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."artist_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_group_membership_roles" ADD CONSTRAINT "artist_group_membership_roles_membership_id_artist_group_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."artist_group_memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_group_memberships" ADD CONSTRAINT "artist_group_memberships_group_artist_entity_id_artist_entities_id_fk" FOREIGN KEY ("group_artist_entity_id") REFERENCES "public"."artist_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_group_memberships" ADD CONSTRAINT "artist_group_memberships_member_artist_entity_id_artist_entities_id_fk" FOREIGN KEY ("member_artist_entity_id") REFERENCES "public"."artist_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_group_memberships" ADD CONSTRAINT "artist_group_memberships_source_id_artist_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."artist_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_source_payloads" ADD CONSTRAINT "artist_source_payloads_source_id_artist_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."artist_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_identifiers" ADD CONSTRAINT "place_identifiers_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_identifiers" ADD CONSTRAINT "place_identifiers_source_id_artist_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."artist_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_names" ADD CONSTRAINT "place_names_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_names" ADD CONSTRAINT "place_names_source_id_artist_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."artist_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_artist_credits" ADD CONSTRAINT "track_artist_credits_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_artist_credits" ADD CONSTRAINT "track_artist_credits_artist_entity_id_artist_entities_id_fk" FOREIGN KEY ("artist_entity_id") REFERENCES "public"."artist_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_artist_credits" ADD CONSTRAINT "track_artist_credits_source_id_artist_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."artist_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_album_artist_credits_album" ON "album_artist_credits" USING btree ("album_id","credit_position");--> statement-breakpoint
CREATE INDEX "idx_album_artist_credits_entity" ON "album_artist_credits" USING btree ("artist_entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_album_artist_credits_unique" ON "album_artist_credits" USING btree ("album_id","credit_position","credit_role","artist_entity_id");--> statement-breakpoint
CREATE INDEX "idx_artist_entities_type_status" ON "artist_entities" USING btree ("entity_type","verification_status");--> statement-breakpoint
CREATE INDEX "idx_artist_entity_events_today" ON "artist_entity_events" USING btree ("event_type","event_month","event_day") WHERE "artist_entity_events"."date_precision" = 'day';--> statement-breakpoint
CREATE INDEX "idx_artist_entity_events_entity_type" ON "artist_entity_events" USING btree ("artist_entity_id","event_type");--> statement-breakpoint
CREATE INDEX "idx_artist_entity_events_type_year" ON "artist_entity_events" USING btree ("event_type","event_year");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_artist_entity_identifiers_provider_external" ON "artist_entity_identifiers" USING btree ("provider","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_artist_entity_identifiers_entity_provider_external" ON "artist_entity_identifiers" USING btree ("artist_entity_id","provider","external_id");--> statement-breakpoint
CREATE INDEX "idx_artist_entity_identifiers_entity" ON "artist_entity_identifiers" USING btree ("artist_entity_id");--> statement-breakpoint
CREATE INDEX "idx_artist_entity_names_entity_locale_type" ON "artist_entity_names" USING btree ("artist_entity_id","locale","name_type");--> statement-breakpoint
CREATE INDEX "idx_artist_entity_names_name_type" ON "artist_entity_names" USING btree ("name_type");--> statement-breakpoint
CREATE INDEX "idx_artist_entity_names_lower_name" ON "artist_entity_names" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "idx_artist_entity_texts_unique" ON "artist_entity_texts" USING btree ("artist_entity_id","locale","text_type","source_id");--> statement-breakpoint
CREATE INDEX "idx_artist_entity_texts_entity_locale" ON "artist_entity_texts" USING btree ("artist_entity_id","locale");--> statement-breakpoint
CREATE INDEX "idx_artist_group_memberships_group" ON "artist_group_memberships" USING btree ("group_artist_entity_id");--> statement-breakpoint
CREATE INDEX "idx_artist_group_memberships_member" ON "artist_group_memberships" USING btree ("member_artist_entity_id");--> statement-breakpoint
CREATE INDEX "idx_artist_group_memberships_current_group" ON "artist_group_memberships" USING btree ("group_artist_entity_id","is_current") WHERE "artist_group_memberships"."is_current" = true;--> statement-breakpoint
CREATE INDEX "idx_artist_sources_provider_entity" ON "artist_sources" USING btree ("provider","provider_entity_id");--> statement-breakpoint
CREATE INDEX "idx_artist_sources_fetched_at" ON "artist_sources" USING btree ("fetched_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_place_identifiers_provider_external" ON "place_identifiers" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX "idx_place_identifiers_place" ON "place_identifiers" USING btree ("place_id");--> statement-breakpoint
CREATE INDEX "idx_place_names_place_locale" ON "place_names" USING btree ("place_id","locale");--> statement-breakpoint
CREATE INDEX "idx_place_names_name" ON "place_names" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_track_artist_credits_track" ON "track_artist_credits" USING btree ("track_id","credit_position");--> statement-breakpoint
CREATE INDEX "idx_track_artist_credits_entity" ON "track_artist_credits" USING btree ("artist_entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_track_artist_credits_unique" ON "track_artist_credits" USING btree ("track_id","credit_position","credit_role","artist_entity_id");--> statement-breakpoint
ALTER TABLE "artists" ADD CONSTRAINT "artists_artist_entity_id_artist_entities_id_fk" FOREIGN KEY ("artist_entity_id") REFERENCES "public"."artist_entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_artists_artist_entity_id" ON "artists" USING btree ("artist_entity_id");
