-- Marks the stored YouTube "search on YouTube" links as what they are.
--
-- These rows hold a link to a search results page rather than to the
-- recording, which is why the resolver gives newly created ones
-- `search-fallback` as their match method. Rows written before that
-- carry `search`, the value that means a text search did find the
-- recording, so a caller filtering for real matches cannot tell the two
-- apart and follows one to a result list.
--
-- The predicate is exact: on this database every search-page URL is a
-- YouTube one, and no genuine match has a URL of that shape. Idempotent,
-- because an updated row stops matching.
UPDATE "service_links"
SET "match_method" = 'search-fallback'
WHERE "service" = 'youtube'
  AND "match_method" = 'search'
  AND "url" LIKE 'https://music.youtube.com/search?q=%';
