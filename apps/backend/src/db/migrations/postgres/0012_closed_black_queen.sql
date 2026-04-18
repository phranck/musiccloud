CREATE TABLE "content_pages" (
	"slug" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"show_title" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_at" timestamp with time zone,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "nav_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"nav_id" text NOT NULL,
	"page_slug" text,
	"url" text,
	"target" text DEFAULT '_self' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"label" text
);
--> statement-breakpoint
ALTER TABLE "content_pages" ADD CONSTRAINT "content_pages_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_pages" ADD CONSTRAINT "content_pages_updated_by_admin_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nav_items" ADD CONSTRAINT "nav_items_page_slug_content_pages_slug_fk" FOREIGN KEY ("page_slug") REFERENCES "public"."content_pages"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_nav_items_nav" ON "nav_items" USING btree ("nav_id");