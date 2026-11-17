CREATE TABLE "donations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"received_on" date NOT NULL,
	"provider" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"external_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_donations_amount" CHECK ("donations"."amount_cents" > 0),
	CONSTRAINT "chk_donations_currency" CHECK ("donations"."currency" IN ('EUR')),
	CONSTRAINT "chk_donations_provider" CHECK ("donations"."provider" IN ('bank-transfer', 'paypal', 'github-sponsors', 'other'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_donations_external_ref" ON "donations" USING btree ("external_ref");--> statement-breakpoint
CREATE INDEX "idx_donations_received_on" ON "donations" USING btree ("received_on");