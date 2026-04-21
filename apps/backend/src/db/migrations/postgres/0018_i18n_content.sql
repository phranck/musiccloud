-- 0018_i18n_content.sql
-- Adds per-locale translation tables and source-timestamp columns for stale
-- detection. Seeds existing rows as `en` + translation_ready=true so the
-- site keeps behaving identically after migration.

ALTER TABLE content_pages
  ADD COLUMN content_updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE page_segments
  ADD COLUMN label_updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE nav_items
  ADD COLUMN label_updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE content_page_translations (
  slug              text        NOT NULL REFERENCES content_pages(slug)
                                ON DELETE CASCADE ON UPDATE CASCADE,
  locale            text        NOT NULL,
  title             text        NOT NULL,
  content           text        NOT NULL DEFAULT '',
  translation_ready boolean     NOT NULL DEFAULT false,
  source_updated_at timestamptz,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        text        REFERENCES admin_users(id) ON DELETE SET NULL,
  CONSTRAINT pk_content_page_translations PRIMARY KEY (slug, locale)
);

CREATE TABLE page_segment_translations (
  segment_id        integer     NOT NULL REFERENCES page_segments(id) ON DELETE CASCADE,
  locale            text        NOT NULL,
  label             text        NOT NULL,
  source_updated_at timestamptz,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_page_segment_translations PRIMARY KEY (segment_id, locale)
);

CREATE TABLE nav_item_translations (
  nav_item_id       integer     NOT NULL REFERENCES nav_items(id) ON DELETE CASCADE,
  locale            text        NOT NULL,
  label             text        NOT NULL,
  source_updated_at timestamptz,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_nav_item_translations PRIMARY KEY (nav_item_id, locale)
);

-- Seed default-locale rows from existing content.
INSERT INTO content_page_translations (slug, locale, title, content, translation_ready, source_updated_at, updated_at)
SELECT slug, 'en', title, content, true, content_updated_at, now() FROM content_pages;

INSERT INTO page_segment_translations (segment_id, locale, label, source_updated_at, updated_at)
SELECT id, 'en', label, label_updated_at, now() FROM page_segments;

INSERT INTO nav_item_translations (nav_item_id, locale, label, source_updated_at, updated_at)
SELECT id, 'en', label, label_updated_at, now() FROM nav_items WHERE label IS NOT NULL;
