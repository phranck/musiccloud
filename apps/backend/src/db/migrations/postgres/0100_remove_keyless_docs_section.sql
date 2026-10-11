-- Removes the section "Trying it without a key" from the developer portal's
-- docs page.
--
-- The section promised that `GET /api/v1/resolve` answers without a
-- credential, and quoted its budget through the site variables
-- `{keylessRequestsPerMinute}` and `{keylessRequestsPerDay}`. That operation
-- takes an API key now and both variables are gone, so the page would show the
-- placeholders as raw text. Running as a migration removes the section in the
-- same deploy that closes the operation.
--
-- The section is the heading plus the card that follows it, so the cut runs
-- from the heading to the first `}]]` after it, which closes that card. The
-- blank lines in front of the heading go with it. A page without the heading
-- is left alone, which also makes the migration idempotent.
WITH "section" AS (
  SELECT
    "id",
    strpos("content", '## Trying it without a key') AS "heading_at"
  FROM "content_pages"
  WHERE "slug" = 'docs'
),
"bounds" AS (
  SELECT
    "section"."id",
    "section"."heading_at",
    "section"."heading_at" + strpos(substring("page"."content" from "section"."heading_at"), '}]]') + 2 AS "after_card"
  FROM "section"
  JOIN "content_pages" AS "page" ON "page"."id" = "section"."id"
  WHERE "section"."heading_at" > 0
    AND strpos(substring("page"."content" from "section"."heading_at"), '}]]') > 0
)
UPDATE "content_pages" AS "page"
SET
  "content" = rtrim(left("page"."content", "bounds"."heading_at" - 1), E'\n') || substring("page"."content" from "bounds"."after_card"),
  "content_updated_at" = now(),
  "updated_at" = now()
FROM "bounds"
WHERE "page"."id" = "bounds"."id";
