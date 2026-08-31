DROP INDEX "uq_tier_creem_products_tier_interval";--> statement-breakpoint
ALTER TABLE "tier_creem_products" ADD COLUMN "mode" text DEFAULT 'test' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_tier_creem_products_tier_interval_mode" ON "tier_creem_products" USING btree ("tier_id","interval","mode");--> statement-breakpoint
ALTER TABLE "tier_creem_products" ADD CONSTRAINT "chk_tier_creem_products_mode" CHECK ("tier_creem_products"."mode" IN ('test', 'live'));