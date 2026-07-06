ALTER TABLE "api_clients" DROP CONSTRAINT "chk_api_clients_requests_per_minute";--> statement-breakpoint
ALTER TABLE "api_clients" DROP CONSTRAINT "chk_api_clients_requests_per_day";--> statement-breakpoint
ALTER TABLE "api_clients" ALTER COLUMN "requests_per_minute" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "api_clients" ALTER COLUMN "requests_per_minute" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "api_clients" ALTER COLUMN "requests_per_day" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "api_clients" ALTER COLUMN "requests_per_day" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "developer_accounts" ADD COLUMN "tier_id" text;--> statement-breakpoint
ALTER TABLE "developer_accounts" ADD CONSTRAINT "developer_accounts_tier_id_tiers_id_fk" FOREIGN KEY ("tier_id") REFERENCES "public"."tiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_clients" ADD CONSTRAINT "chk_api_clients_requests_per_minute" CHECK ("api_clients"."requests_per_minute" IS NULL OR "api_clients"."requests_per_minute" > 0);--> statement-breakpoint
ALTER TABLE "api_clients" ADD CONSTRAINT "chk_api_clients_requests_per_day" CHECK ("api_clients"."requests_per_day" IS NULL OR "api_clients"."requests_per_day" > 0);--> statement-breakpoint
UPDATE "developer_accounts" SET "tier_id" = (SELECT "id" FROM "tiers" WHERE "name" = 'Free' LIMIT 1) WHERE "plan" = 'free';--> statement-breakpoint
UPDATE "api_clients" SET "requests_per_minute" = NULL, "requests_per_day" = NULL WHERE "requests_per_minute" = 60 AND "requests_per_day" = 10000;