ALTER TABLE "content_page_translations" DROP CONSTRAINT "content_page_translations_slug_content_pages_slug_fk";
--> statement-breakpoint
ALTER TABLE "content_page_translations" DROP CONSTRAINT "content_page_translations_updated_by_admin_users_id_fk";
--> statement-breakpoint
ALTER TABLE "nav_item_translations" DROP CONSTRAINT "nav_item_translations_nav_item_id_nav_items_id_fk";
--> statement-breakpoint
ALTER TABLE "page_segment_translations" DROP CONSTRAINT "page_segment_translations_segment_id_page_segments_id_fk";
