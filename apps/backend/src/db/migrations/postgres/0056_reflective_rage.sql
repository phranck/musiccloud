ALTER TABLE "email_branding" DROP CONSTRAINT "email_branding_footer_asset_id_email_assets_id_fk";
--> statement-breakpoint
ALTER TABLE "email_templates" DROP CONSTRAINT "email_templates_footer_asset_id_email_assets_id_fk";
--> statement-breakpoint
ALTER TABLE "email_branding" DROP COLUMN "footer_asset_id";--> statement-breakpoint
ALTER TABLE "email_templates" DROP COLUMN "footer_asset_id";