-- Full-text search using tsvector + GIN index
-- Generated column auto-updates when title or artists change

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tracks' AND column_name = 'search_vector'
  ) THEN
    ALTER TABLE tracks ADD COLUMN search_vector tsvector
      GENERATED ALWAYS AS (
        to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(artists, ''))
      ) STORED;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tracks_search_vector ON tracks USING GIN(search_vector);
