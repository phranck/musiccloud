ALTER TABLE "developer_email_tokens" DROP CONSTRAINT "chk_developer_email_tokens_purpose";--> statement-breakpoint
ALTER TABLE "developer_accounts" ADD COLUMN "pending_email" text;--> statement-breakpoint
ALTER TABLE "developer_accounts" ADD COLUMN "pending_email_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "developer_email_tokens" ADD CONSTRAINT "chk_developer_email_tokens_purpose" CHECK ("developer_email_tokens"."purpose" IN ('verify', 'reset', 'change-email'));