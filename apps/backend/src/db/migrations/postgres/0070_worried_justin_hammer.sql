CREATE TABLE "tier_creem_products" (
	"id" text PRIMARY KEY NOT NULL,
	"tier_id" text NOT NULL,
	"interval" text NOT NULL,
	"creem_product_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tier_creem_products_creem_product_id_unique" UNIQUE("creem_product_id"),
	CONSTRAINT "chk_tier_creem_products_interval" CHECK ("tier_creem_products"."interval" IN ('month', 'year'))
);
--> statement-breakpoint
ALTER TABLE "tier_creem_products" ADD CONSTRAINT "tier_creem_products_tier_id_tiers_id_fk" FOREIGN KEY ("tier_id") REFERENCES "public"."tiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_tier_creem_products_tier_interval" ON "tier_creem_products" USING btree ("tier_id","interval");