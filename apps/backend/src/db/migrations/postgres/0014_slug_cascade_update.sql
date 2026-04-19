ALTER TABLE "page_segments" DROP CONSTRAINT IF EXISTS "page_segments_owner_slug_fkey";
ALTER TABLE "page_segments" ADD CONSTRAINT "page_segments_owner_slug_fkey"
  FOREIGN KEY ("owner_slug") REFERENCES "content_pages"("slug") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "page_segments" DROP CONSTRAINT IF EXISTS "page_segments_target_slug_fkey";
ALTER TABLE "page_segments" ADD CONSTRAINT "page_segments_target_slug_fkey"
  FOREIGN KEY ("target_slug") REFERENCES "content_pages"("slug") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "nav_items" DROP CONSTRAINT IF EXISTS "nav_items_page_slug_content_pages_slug_fk";
ALTER TABLE "nav_items" ADD CONSTRAINT "nav_items_page_slug_content_pages_slug_fk"
  FOREIGN KEY ("page_slug") REFERENCES "content_pages"("slug") ON DELETE CASCADE ON UPDATE CASCADE;
