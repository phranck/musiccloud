ALTER TABLE "developer_accounts" ADD COLUMN "first_name" text;--> statement-breakpoint
ALTER TABLE "developer_accounts" ADD COLUMN "last_name" text;--> statement-breakpoint
ALTER TABLE "developer_accounts" ADD COLUMN "uploaded_avatar_url" text;--> statement-breakpoint
ALTER TABLE "developer_accounts" ADD COLUMN "gravatar_url" text;--> statement-breakpoint
ALTER TABLE "developer_accounts" ADD COLUMN "avatar_source" text;--> statement-breakpoint
ALTER TABLE "developer_accounts" ADD CONSTRAINT "chk_developer_accounts_avatar_source" CHECK ("developer_accounts"."avatar_source" IS NULL OR "developer_accounts"."avatar_source" IN ('provider', 'upload', 'gravatar'));