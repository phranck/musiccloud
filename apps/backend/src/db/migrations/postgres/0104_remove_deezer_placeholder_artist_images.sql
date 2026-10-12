-- Removes Deezer's placeholder picture where it was stored as an artist's
-- picture.
--
-- Deezer names the placeholder for an artist without a picture either with an
-- empty image hash (`/images/artist//`) or with the MD5 of the empty string.
-- `isDeezerSilhouette` in
-- `apps/backend/src/services/plugins/deezer/artist-image.ts` recognizes both
-- forms, but it recognized only the second one when these rows were written.
--
-- The image cache keeps its rows without expiry and stores only a picture it
-- found, so a placeholder row is deleted and the next lookup asks the
-- services again. A resolved artist's profile keeps its row, and its picture
-- is cleared.
DELETE FROM "artist_images"
WHERE "image_url" LIKE '%/images/artist//%'
   OR "image_url" LIKE '%d41d8cd98f00b204e9800998ecf8427e%';
--> statement-breakpoint
UPDATE "artist_profiles"
SET "image_url" = NULL
WHERE "image_url" LIKE '%/images/artist//%'
   OR "image_url" LIKE '%d41d8cd98f00b204e9800998ecf8427e%';
