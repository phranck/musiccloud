CREATE TABLE "email_action_bindings" (
	"id" text PRIMARY KEY NOT NULL,
	"action_key" text NOT NULL,
	"template_id" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"mime_type" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_branding" (
	"id" serial PRIMARY KEY NOT NULL,
	"header_asset_id" text,
	"footer_asset_id" text,
	"footer_text" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_templates" ADD COLUMN "blocks" jsonb;--> statement-breakpoint
ALTER TABLE "email_templates" ADD COLUMN "required_variables" jsonb;--> statement-breakpoint
ALTER TABLE "email_action_bindings" ADD CONSTRAINT "email_action_bindings_template_id_email_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."email_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_branding" ADD CONSTRAINT "email_branding_header_asset_id_email_assets_id_fk" FOREIGN KEY ("header_asset_id") REFERENCES "public"."email_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_branding" ADD CONSTRAINT "email_branding_footer_asset_id_email_assets_id_fk" FOREIGN KEY ("footer_asset_id") REFERENCES "public"."email_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_email_action_bindings_action_template" ON "email_action_bindings" USING btree ("action_key","template_id");--> statement-breakpoint
CREATE INDEX "idx_email_action_bindings_action" ON "email_action_bindings" USING btree ("action_key");