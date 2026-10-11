-- Takes the top of the confidence scale away from stored text-search matches.
--
-- The scale now reserves `1` for a link that names the recording: an identifier
-- match, or the address the request came in on. A text match stops below it, so
-- a caller reading `1` knows the link did not come from a search. Rows written
-- before that carry search scores of exactly `1`, which is the claim the scale
-- exists to prevent.
--
-- The predicate is `>= 1` rather than `> 0.99` on purpose. These columns are
-- `real`, and `0.99` stored there becomes `0.99000000953…`, which is still
-- greater than `0.99`, so the second form would rewrite the same rows on every
-- run and never settle. `1` is exactly representable, so `>= 1` is both the
-- guarantee the contract states and a predicate that stops matching once the
-- row is written.
--
-- Only the number moves. Nothing is relabelled: a stored row does not say
-- whether its method was reported correctly, and guessing would replace one
-- wrong value with another.
UPDATE "service_links" SET "confidence" = 0.99
 WHERE "match_method" = 'search' AND "confidence" >= 1;

UPDATE "album_service_links" SET "confidence" = 0.99
 WHERE "match_method" = 'search' AND "confidence" >= 1;

UPDATE "artist_service_links" SET "confidence" = 0.99
 WHERE "match_method" = 'search' AND "confidence" >= 1;
