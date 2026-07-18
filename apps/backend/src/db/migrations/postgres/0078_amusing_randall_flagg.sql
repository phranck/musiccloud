CREATE TABLE "navigation_item_placements" (
	"nav_item_id" integer NOT NULL,
	"context" integer NOT NULL,
	"area" integer NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "pk_navigation_item_placements" PRIMARY KEY("nav_item_id","context","area"),
	CONSTRAINT "chk_navigation_item_placements_context" CHECK ("navigation_item_placements"."context" IN (1, 2)),
	CONSTRAINT "chk_navigation_item_placements_area" CHECK ("navigation_item_placements"."area" IN (1, 2)),
	CONSTRAINT "chk_navigation_item_placements_position" CHECK ("navigation_item_placements"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "nav_items" ADD COLUMN "target_kind" text DEFAULT 'url' NOT NULL;--> statement-breakpoint
ALTER TABLE "nav_items" ADD COLUMN "page_id" text;--> statement-breakpoint
ALTER TABLE "nav_items" ADD COLUMN "system_key" text;--> statement-breakpoint
ALTER TABLE "nav_items" ADD COLUMN "context_mask" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "nav_items" ADD COLUMN "area_mask" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "navigation_item_placements" ADD CONSTRAINT "navigation_item_placements_nav_item_id_nav_items_id_fk" FOREIGN KEY ("nav_item_id") REFERENCES "public"."nav_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_navigation_item_placements_list_position" ON "navigation_item_placements" USING btree ("context","area","position");--> statement-breakpoint
CREATE INDEX "idx_navigation_item_placements_item" ON "navigation_item_placements" USING btree ("nav_item_id");--> statement-breakpoint
ALTER TABLE "nav_items" ADD CONSTRAINT "nav_items_page_id_content_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."content_pages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_nav_items_page_id" ON "nav_items" USING btree ("page_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_nav_items_system_key" ON "nav_items" USING btree ("system_key") WHERE "nav_items"."system_key" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "nav_items" ADD CONSTRAINT "chk_nav_items_target_kind" CHECK ("nav_items"."target_kind" IN ('page', 'url', 'system'));--> statement-breakpoint
ALTER TABLE "nav_items" ADD CONSTRAINT "chk_nav_items_system_key" CHECK ("nav_items"."system_key" IS NULL OR "nav_items"."system_key" IN ('docs', 'api-reference', 'search'));--> statement-breakpoint
ALTER TABLE "nav_items" ADD CONSTRAINT "chk_nav_items_context_mask" CHECK ("nav_items"."context_mask" IN (1, 2, 3));--> statement-breakpoint
ALTER TABLE "nav_items" ADD CONSTRAINT "chk_nav_items_area_mask" CHECK ("nav_items"."area_mask" IN (1, 2, 3));--> statement-breakpoint
ALTER TABLE "nav_items" ADD CONSTRAINT "chk_nav_items_system_context" CHECK ("nav_items"."target_kind" <> 'system' OR "nav_items"."context_mask" = 2);--> statement-breakpoint
ALTER TABLE "nav_items" ADD CONSTRAINT "chk_nav_items_system_target_shape" CHECK (("nav_items"."target_kind" = 'system' AND "nav_items"."system_key" IS NOT NULL AND "nav_items"."page_id" IS NULL AND "nav_items"."url" IS NULL AND "nav_items"."target" = '_self') OR ("nav_items"."target_kind" <> 'system' AND "nav_items"."system_key" IS NULL));