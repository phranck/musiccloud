ALTER TABLE "admin_users" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "role" text DEFAULT 'admin' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "first_name" text;--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "last_name" text;--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "avatar_url" text;--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "locale" text DEFAULT 'de' NOT NULL;--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "invite_token_hash" text;--> statement-breakpoint
ALTER TABLE "admin_users" ADD COLUMN "invite_expires_at" timestamp with time zone;