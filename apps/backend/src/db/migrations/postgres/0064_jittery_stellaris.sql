ALTER TABLE "tiers" ADD COLUMN "icon" text;--> statement-breakpoint
UPDATE "tiers" SET "icon" = 'Medal' WHERE "name" = 'Free' AND "icon" IS NULL;--> statement-breakpoint
UPDATE "tiers" SET "icon" = 'MedalStar' WHERE "name" = 'Club' AND "icon" IS NULL;--> statement-breakpoint
UPDATE "tiers" SET "icon" = 'Cup' WHERE "name" = 'Arena' AND "icon" IS NULL;--> statement-breakpoint
UPDATE "tiers" SET "icon" = 'Crown1' WHERE "name" = 'Stadium' AND "icon" IS NULL;
