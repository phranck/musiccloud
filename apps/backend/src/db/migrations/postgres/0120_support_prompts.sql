CREATE TABLE "support_prompts" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slot" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"button_label" text DEFAULT '' NOT NULL,
	"button_href" text DEFAULT '/support-me' NOT NULL,
	"button_alignment" text DEFAULT 'trailing' NOT NULL,
	"threshold" integer DEFAULT 3 NOT NULL,
	"threshold_basis" text DEFAULT 'opened' NOT NULL,
	"starts_at" text,
	"ends_at" text,
	"priority" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_support_prompts_threshold" CHECK ("support_prompts"."threshold" >= 0)
);
--> statement-breakpoint
CREATE INDEX "idx_support_prompts_slot" ON "support_prompts" USING btree ("slot");