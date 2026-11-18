CREATE TABLE "bank_account_reads" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	"succeeded" boolean DEFAULT false NOT NULL,
	"booked_through" text,
	"failure_reason" text,
	"transactions_read" integer DEFAULT 0 NOT NULL,
	"imported" integer DEFAULT 0 NOT NULL,
	"filled" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "chk_bank_account_reads_kind" CHECK ("bank_account_reads"."kind" IN ('background', 'manual'))
);
--> statement-breakpoint
CREATE TABLE "retired_sponsorship_references" (
	"reference" text PRIMARY KEY NOT NULL,
	"retired_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_bank_account_reads_read_at" ON "bank_account_reads" USING btree ("read_at");