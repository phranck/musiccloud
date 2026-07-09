CREATE TABLE "developer_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"tier_id" text NOT NULL,
	"polar_subscription_id" text NOT NULL,
	"polar_customer_id" text NOT NULL,
	"status" text NOT NULL,
	"interval" text NOT NULL,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "developer_subscriptions_polar_subscription_id_unique" UNIQUE("polar_subscription_id"),
	CONSTRAINT "chk_developer_subscriptions_status" CHECK ("developer_subscriptions"."status" IN ('active', 'canceled', 'past_due', 'revoked', 'incomplete')),
	CONSTRAINT "chk_developer_subscriptions_interval" CHECK ("developer_subscriptions"."interval" IN ('month', 'year'))
);
--> statement-breakpoint
ALTER TABLE "developer_subscriptions" ADD CONSTRAINT "developer_subscriptions_account_id_developer_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."developer_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_subscriptions" ADD CONSTRAINT "developer_subscriptions_tier_id_tiers_id_fk" FOREIGN KEY ("tier_id") REFERENCES "public"."tiers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_developer_subscriptions_polar_id" ON "developer_subscriptions" USING btree ("polar_subscription_id");