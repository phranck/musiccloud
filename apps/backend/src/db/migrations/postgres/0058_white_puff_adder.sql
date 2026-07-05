CREATE TABLE "tiers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"requests_per_minute" integer NOT NULL,
	"requests_per_day" integer NOT NULL,
	"attribution_required" boolean DEFAULT false NOT NULL,
	"price" text,
	"color" text DEFAULT '#64748b' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tiers_name_unique" UNIQUE("name"),
	CONSTRAINT "chk_tiers_requests_per_minute" CHECK ("tiers"."requests_per_minute" > 0),
	CONSTRAINT "chk_tiers_requests_per_day" CHECK ("tiers"."requests_per_day" > 0)
);
--> statement-breakpoint
INSERT INTO "tiers" ("id", "name", "requests_per_minute", "requests_per_day", "attribution_required", "price", "sort_order")
VALUES ('tier_free', 'Free', 60, 10000, false, null, 0);
