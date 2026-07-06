ALTER TABLE "tiers" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tiers" ADD COLUMN "disable_reason" text DEFAULT '' NOT NULL;