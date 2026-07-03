ALTER TABLE "email_branding" ADD COLUMN "light_background_asset_id" text;--> statement-breakpoint
ALTER TABLE "email_branding" ADD COLUMN "dark_background_asset_id" text;--> statement-breakpoint
ALTER TABLE "email_branding" ADD COLUMN "light_gradient_top" text DEFAULT '#0076d5' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_branding" ADD COLUMN "light_gradient_bottom" text DEFAULT '#69d1fd' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_branding" ADD COLUMN "dark_gradient_top" text DEFAULT '#0b1318' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_branding" ADD COLUMN "dark_gradient_bottom" text DEFAULT '#10273b' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_templates" ADD COLUMN "header_asset_id" text;--> statement-breakpoint
ALTER TABLE "email_templates" ADD COLUMN "footer_asset_id" text;--> statement-breakpoint
ALTER TABLE "email_templates" ADD COLUMN "footer_text" text;--> statement-breakpoint
ALTER TABLE "email_templates" ADD COLUMN "light_background_asset_id" text;--> statement-breakpoint
ALTER TABLE "email_templates" ADD COLUMN "dark_background_asset_id" text;--> statement-breakpoint
ALTER TABLE "email_templates" ADD COLUMN "light_gradient_top" text;--> statement-breakpoint
ALTER TABLE "email_templates" ADD COLUMN "light_gradient_bottom" text;--> statement-breakpoint
ALTER TABLE "email_templates" ADD COLUMN "dark_gradient_top" text;--> statement-breakpoint
ALTER TABLE "email_templates" ADD COLUMN "dark_gradient_bottom" text;--> statement-breakpoint
ALTER TABLE "email_branding" ADD CONSTRAINT "email_branding_light_background_asset_id_email_assets_id_fk" FOREIGN KEY ("light_background_asset_id") REFERENCES "public"."email_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_branding" ADD CONSTRAINT "email_branding_dark_background_asset_id_email_assets_id_fk" FOREIGN KEY ("dark_background_asset_id") REFERENCES "public"."email_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_header_asset_id_email_assets_id_fk" FOREIGN KEY ("header_asset_id") REFERENCES "public"."email_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_footer_asset_id_email_assets_id_fk" FOREIGN KEY ("footer_asset_id") REFERENCES "public"."email_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_light_background_asset_id_email_assets_id_fk" FOREIGN KEY ("light_background_asset_id") REFERENCES "public"."email_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_dark_background_asset_id_email_assets_id_fk" FOREIGN KEY ("dark_background_asset_id") REFERENCES "public"."email_assets"("id") ON DELETE set null ON UPDATE no action;