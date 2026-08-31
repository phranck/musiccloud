CREATE TABLE "tier_offers" (
	"id" text PRIMARY KEY NOT NULL,
	"tier_id" text NOT NULL,
	"billing_period" text NOT NULL,
	"price_cents" integer NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"tax_mode" text,
	"tax_category" text,
	"image_url" text,
	"success_url" text,
	"custom_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"abandoned_cart_recovery" boolean DEFAULT false NOT NULL,
	"pay_what_you_want" boolean DEFAULT false NOT NULL,
	"suggested_price_cents" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_tier_offers_billing_period" CHECK ("tier_offers"."billing_period" IN ('once', 'every-day', 'every-month', 'every-three-months', 'every-six-months', 'every-year')),
	CONSTRAINT "chk_tier_offers_currency" CHECK ("tier_offers"."currency" IN ('EUR', 'USD')),
	CONSTRAINT "chk_tier_offers_tax_mode" CHECK ("tier_offers"."tax_mode" IS NULL OR "tier_offers"."tax_mode" IN ('inclusive', 'exclusive')),
	CONSTRAINT "chk_tier_offers_tax_category" CHECK ("tier_offers"."tax_category" IS NULL OR "tier_offers"."tax_category" IN ('saas', 'digital-goods-service', 'ebooks')),
	CONSTRAINT "chk_tier_offers_price" CHECK ("tier_offers"."price_cents" >= 100),
	CONSTRAINT "chk_tier_offers_pay_what_you_want" CHECK ("tier_offers"."pay_what_you_want" = false OR "tier_offers"."billing_period" = 'once')
);
--> statement-breakpoint
ALTER TABLE "tier_creem_products" DROP CONSTRAINT "chk_tier_creem_products_interval";--> statement-breakpoint
ALTER TABLE "tier_creem_products" DROP CONSTRAINT "tier_creem_products_tier_id_tiers_id_fk";
--> statement-breakpoint
ALTER TABLE "tier_offers" ADD CONSTRAINT "tier_offers_tier_id_tiers_id_fk" FOREIGN KEY ("tier_id") REFERENCES "public"."tiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_tier_offers_tier_period" ON "tier_offers" USING btree ("tier_id","billing_period");--> statement-breakpoint
ALTER TABLE "tier_creem_products" ADD CONSTRAINT "fk_tier_creem_products_offer" FOREIGN KEY ("tier_id","interval") REFERENCES "public"."tier_offers"("tier_id","billing_period") ON DELETE cascade ON UPDATE no action;