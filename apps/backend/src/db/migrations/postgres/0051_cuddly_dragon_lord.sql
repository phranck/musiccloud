ALTER TABLE "email_templates" ALTER COLUMN "blocks" SET DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "email_templates" ALTER COLUMN "blocks" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "email_templates" ALTER COLUMN "required_variables" SET DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "email_templates" ALTER COLUMN "required_variables" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "email_templates" DROP COLUMN "header_banner_url";--> statement-breakpoint
ALTER TABLE "email_templates" DROP COLUMN "header_text";--> statement-breakpoint
ALTER TABLE "email_templates" DROP COLUMN "body_text";--> statement-breakpoint
ALTER TABLE "email_templates" DROP COLUMN "footer_banner_url";--> statement-breakpoint
ALTER TABLE "email_templates" DROP COLUMN "footer_text";