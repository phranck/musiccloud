-- Full-text search using tsvector + GIN index
-- Generated column auto-updates when title or artists change

ALTER TABLE tracks ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(artists, ''))
  ) STORED;

CREATE INDEX idx_tracks_search_vector ON tracks USING GIN(search_vector);
