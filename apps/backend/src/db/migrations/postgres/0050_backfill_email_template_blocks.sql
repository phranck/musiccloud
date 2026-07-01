-- Custom SQL migration file, put your code below! --

-- MC-078: migrate the field-based email_templates onto the block model, and
-- lift the (previously per-template) footer text into the new global branding
-- singleton. Header/footer BANNER images are intentionally NOT carried over as
-- bytes here (SQL cannot read the repo image file); the admin re-uploads the
-- header on the new Branding page after deploy. The banner URL columns are
-- dropped in the next migration.

-- 1) Seed the single global branding row. Take the footer text from whichever
--    existing template carried one (there is exactly one row in prod:
--    "share it everywhere"). Header/footer assets start NULL.
INSERT INTO "email_branding" ("footer_text")
VALUES ((SELECT "footer_text" FROM "email_templates"
         WHERE "footer_text" IS NOT NULL AND "footer_text" <> '' LIMIT 1));

-- 2) Convert each template's header_text (if any) + body_text into text blocks,
--    preserving order and content verbatim. required_variables starts empty:
--    the interpolation still replaces {{username}}/{{inviteUrl}} from the
--    triggering action's variables; requiredVariables only gates validation and
--    an empty list is the safe permissive default (admin can declare later).
UPDATE "email_templates"
   SET "blocks" = CASE
         WHEN COALESCE("header_text", '') <> '' THEN
           jsonb_build_array(
             jsonb_build_object('type', 'text', 'markdown', "header_text"),
             jsonb_build_object('type', 'text', 'markdown', "body_text")
           )
         ELSE
           jsonb_build_array(
             jsonb_build_object('type', 'text', 'markdown', "body_text")
           )
       END,
       "required_variables" = '[]'::jsonb
 WHERE "blocks" IS NULL;
