-- A Frontend publication carries the one Frontend template key. The contextual
-- backfill once wrote `frontend-segmented` for a segmented page, which nothing
-- renders differently and the backend no longer accepts.
UPDATE "content_page_publications" SET "template_key" = 'frontend-default' WHERE "template_key" = 'frontend-segmented';
