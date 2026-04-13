-- 0001_rls_and_realtime.sql
--
-- Supabase-specific SQL that drizzle-kit cannot model:
--   1. pgcrypto extension (gen_random_uuid source)
--   2. Cross-schema FK to auth.users with ON DELETE CASCADE
--   3. updated_at trigger function + per-table triggers
--   4. Row Level Security + policies
--   5. Realtime publication membership
--
-- Applied by scripts/migrate-supabase.mjs inside a transaction.

-- 1. Extensions -------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Foreign key to auth.users ----------------------------------------------

ALTER TABLE public.media_entries
  ADD CONSTRAINT media_entries_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 3. updated_at triggers ----------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_media_entries_updated_at
  BEFORE UPDATE ON public.media_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_enriched_artists_updated_at
  BEFORE UPDATE ON public.enriched_artists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 4. Row Level Security -----------------------------------------------------

-- 4a. media_entries: user-scoped CRUD

ALTER TABLE public.media_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own entries"
  ON public.media_entries FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own entries"
  ON public.media_entries FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own entries"
  ON public.media_entries FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own entries"
  ON public.media_entries FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 4b. enriched_artists: read-only for authenticated, writes only via service_role

ALTER TABLE public.enriched_artists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read enriched artists"
  ON public.enriched_artists FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies: service_role bypasses RLS entirely,
-- so the Fastify enrichment worker can write freely while regular clients
-- cannot mutate enriched_artists.

-- 5. Realtime publication ---------------------------------------------------

ALTER PUBLICATION supabase_realtime ADD TABLE public.media_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE public.enriched_artists;
