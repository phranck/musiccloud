ALTER TABLE "content_pages" ADD COLUMN "display_order" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
WITH ordered AS (
  SELECT slug, ROW_NUMBER() OVER (ORDER BY created_at DESC) - 1 AS new_order
  FROM content_pages
)
UPDATE content_pages
   SET display_order = ordered.new_order
  FROM ordered
 WHERE content_pages.slug = ordered.slug;