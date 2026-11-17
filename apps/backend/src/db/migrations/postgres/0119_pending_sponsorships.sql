CREATE TABLE "pending_sponsorships" (
	"id" text PRIMARY KEY NOT NULL,
	"reference" text NOT NULL,
	"name" text NOT NULL,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"claim" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_pending_sponsorships_amount" CHECK ("pending_sponsorships"."amount_cents" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_pending_sponsorships_reference" ON "pending_sponsorships" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "idx_pending_sponsorships_created_at" ON "pending_sponsorships" USING btree ("created_at");