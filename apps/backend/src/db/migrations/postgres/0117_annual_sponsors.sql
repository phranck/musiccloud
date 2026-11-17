CREATE TABLE "sponsors" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"claim" text DEFAULT '' NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"paid_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "donations" ADD COLUMN "sponsor_id" text;--> statement-breakpoint
CREATE INDEX "idx_sponsors_paid_on" ON "sponsors" USING btree ("paid_on");--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_sponsor_id_sponsors_id_fk" FOREIGN KEY ("sponsor_id") REFERENCES "public"."sponsors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_donations_sponsor_id" ON "donations" USING btree ("sponsor_id");