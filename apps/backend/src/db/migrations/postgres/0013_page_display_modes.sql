ALTER TABLE "content_pages"
  ADD COLUMN "page_type" text NOT NULL DEFAULT 'default',
  ADD COLUMN "display_mode" text NOT NULL DEFAULT 'fullscreen',
  ADD COLUMN "overlay_width" text NOT NULL DEFAULT 'regular',
  ADD COLUMN "overlay_height" text NOT NULL DEFAULT 'regular';

CREATE TABLE IF NOT EXISTS "page_segments" (
  "id" serial PRIMARY KEY NOT NULL,
  "owner_slug" text NOT NULL REFERENCES "content_pages"("slug") ON DELETE CASCADE,
  "target_slug" text NOT NULL REFERENCES "content_pages"("slug") ON DELETE CASCADE,
  "position" integer NOT NULL DEFAULT 0,
  "label" text NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_page_segments_owner" ON "page_segments"("owner_slug");
