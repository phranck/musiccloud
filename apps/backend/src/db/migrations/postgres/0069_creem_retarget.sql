ALTER TABLE "developer_subscriptions" RENAME COLUMN "polar_subscription_id" TO "creem_subscription_id";--> statement-breakpoint
ALTER TABLE "developer_subscriptions" RENAME COLUMN "polar_customer_id" TO "creem_customer_id";--> statement-breakpoint
ALTER TABLE "developer_subscriptions" RENAME CONSTRAINT "developer_subscriptions_polar_subscription_id_unique" TO "developer_subscriptions_creem_subscription_id_unique";--> statement-breakpoint
ALTER INDEX "uq_developer_subscriptions_polar_id" RENAME TO "uq_developer_subscriptions_creem_id";--> statement-breakpoint
ALTER TABLE "developer_subscriptions" DROP CONSTRAINT "chk_developer_subscriptions_status";--> statement-breakpoint
ALTER TABLE "developer_subscriptions" ADD CONSTRAINT "chk_developer_subscriptions_status" CHECK ("developer_subscriptions"."status" IN ('active', 'trialing', 'paused', 'past_due', 'expired', 'canceled', 'scheduled_cancel'));
