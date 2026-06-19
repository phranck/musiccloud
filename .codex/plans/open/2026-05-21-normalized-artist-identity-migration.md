# Normalized Artist Identity Migration Plan

Plan-Nr.: MC-024

## Goal

Normalize artist identity so track, album, and artist profile data point to the same canonical artist entity without losing the old display behavior.

The migration separates these concepts:

- `artist_entities`: canonical identity root for a person, group, persona, or unknown entity.
- `artist_profiles`: resolved Musiccloud artist share/profile data for an entity.
- `track_artist_credits` and `album_artist_credits`: ordered display credits that preserve the old artist-name output while linking to `artist_entities`.
- Biography, event, place, identifier, name, text, and membership tables: normalized enrichment data for birthdays, death dates, band formation dates, disbanding dates, localized text, provider IDs, and band memberships.

The app must continue to show the same artist names as before. The old denormalized artist columns on `tracks` and `albums`, and the old `artists` table, are no longer part of the target schema.

## Current Schema Facts

- `tracks` no longer stores an `artists` JSON/text column.
- `albums` no longer stores an `artists` JSON/text column.
- The former `artists` table was migrated to `artist_profiles`.
- `artist_profiles.artist_entity_id` is the primary key and foreign key to `artist_entities.id`.
- `track_artist_credits` stores track artist display names, ordering, roles, and entity references.
- `album_artist_credits` stores album artist display names, ordering, roles, and entity references.
- API responses still expose the compatibility display array `artists` by deriving it from the credit tables.
- API responses also expose `artistCredits` for normalized consumers.
- Write paths can now persist explicit `artistEntityId` credits and still fall back to legacy name matching when only names are available.
- Dashboard track editing preserves existing entity refs when artist names are unchanged. If names are changed manually, the backend falls back to name-based credit resolution.
- Admin statistics distinguish `artistProfiles` from `artistEntities` while keeping the legacy `artists` count field for compatibility.
- Artist profile deletion keeps normalized `artist_entities` and track/album credits, but also removes profile-adjacent rows such as service links, short URLs, and external IDs. The UI wording must stay explicit about that behavior.
- Credit tables support roles in the schema, but current runtime write/read paths are effectively `main`-credit only.
- The backend exposes an admin `artistEntities` endpoint, but there is no dedicated dashboard page for artist entities yet.
- Identity-event and membership repository methods exist, but birthdays, death anniversaries, formations, and memberships do not have dedicated public/admin API routes or dashboard views yet.
- `artistEntityId` exists as a reserved artist-info query field, but current artist-info resolution is not entity-aware and still works through `shortId` and alias context.

## Code Recheck 2026-06-05

This section is based on the current local code, not on the original migration intent.

- Target schema is present in `apps/backend/src/db/schemas/postgres.ts`: `tracks` and `albums` no longer store denormalized artist columns, and `artist_entities`, `artist_profiles`, `track_artist_credits`, and `album_artist_credits` exist.
- Runtime compatibility arrays are derived from credit tables, but only `credit_role = 'main'` is exported in the hot read helpers.
- Track and album persistence writes relational credits and falls back to legacy name-based entity creation when no explicit entity id is provided.
- Admin track PATCH accepts `artistCredits`; the dashboard track editor preserves entity refs only when names stay positionally unchanged.
- Admin stats distinguish artist profiles from artist entities.
- Repository-level identity events, memberships, and identifier lookup exist and are covered by an integration test, but the test is skipped without an isolated `DATABASE_URL`.
- Migration history has moved beyond `0034`; later migrations such as `0041_dry_king_cobra.sql` add relevant artist-credit and name indexes.

## Implementation Checklist

Each unchecked task must leave the product compilable at the end of the task. If a task needs schema changes, generate and apply migrations only through the configured Drizzle workflow.

- [x] Verify target schema and completed structural migration against current code. Gate: `git diff --check` for this plan update; future schema work must use Drizzle only.
- [x] Verify compatibility reads for `artists` and normalized `artistCredits`. Gate for future code edits: `pnpm --filter @musiccloud/backend typecheck`.
- [x] Verify relational write paths for track and album credits, including legacy name fallback. Gate for future code edits: backend typecheck and targeted backend tests.
- [x] Verify admin track editing preserves entity refs for unchanged names. Gate for future UI edits: `pnpm --filter @musiccloud/dashboard typecheck`.
- [x] Verify admin stats distinguish `artistProfiles` and `artistEntities`. Gate for future edits: backend and dashboard typechecks.
- [x] Verify repository-level support for identity events, memberships, identifiers, and explicit credit entity refs. Gate for future edits: isolated `DATABASE_URL` integration test.
- [ ] Decide and align artist profile deletion semantics. Either keep the current profile-adjacent deletion behavior and make UI/API copy explicit, or change backend deletion semantics. Gates: backend typecheck, dashboard typecheck, and a targeted `deleteArtists` test.
- [ ] Decide credit-role scope. If runtime remains main-only, document and validate that contract; if multiple roles are required, update write helpers, read helpers, API schemas, admin PATCH, and dashboard editing end to end. Gates: backend typecheck/tests, dashboard typecheck/tests.
- [ ] Implement or remove `artistEntityId` in the artist-info query contract. An implementation must make artist-info lookup entity-aware instead of only `shortId`/alias based. Gates: backend typecheck, backend tests, OpenAPI/shared schema checks.
- [ ] Build or explicitly defer the artist-entities dashboard page. The existing admin endpoint can supply a table with entity type, verification status, credit counts, and profile status. Gates: dashboard typecheck and dashboard tests.
- [ ] Build a full dashboard artist-credit entity picker. Keep a compilable intermediate after the backend search/list API, then another after the UI consumes it. Gates: backend typecheck/tests followed by dashboard typecheck/tests.
- [ ] Expose identity events and memberships through API routes. Build on existing repository methods for anniversaries by day, group members, and person memberships. Gates: backend typecheck and isolated DB tests.
- [ ] Build dashboard/API views for birthdays, death anniversaries, band formation dates, and memberships. Gates: backend typecheck/tests, dashboard typecheck/tests, and `pnpm lint`.
- [ ] Enrich missing biography, event, entity-type, and membership data with provenance. Use only Drizzle-generated migrations or normal runtime/admin write paths, never manual migration edits. Gates: Drizzle workflow, backend typecheck, and isolated DB integration tests.
- [ ] Run final full gates after the next implementation slice: `pnpm --filter @musiccloud/backend typecheck`, `pnpm --filter @musiccloud/dashboard typecheck`, `pnpm lint`, backend tests with isolated `DATABASE_URL`, and dashboard tests.

## Completed Drizzle Migrations

### `0029_aromatic_penance.sql`

Created the normalized identity model:

- `artist_entities`
- `artist_sources`
- `artist_source_payloads`
- `artist_entity_identifiers`
- `artist_entity_names`
- `artist_entity_texts`
- `places`
- `place_names`
- `place_identifiers`
- `artist_entity_events`
- `artist_group_memberships`
- `artist_group_membership_roles`
- `track_artist_credits`
- `album_artist_credits`

Also added the hot-path indexes for event date lookup, provider IDs, memberships, and track/album credits.

### `0030_silent_meltdown.sql`

Performed the core local data migration:

- Created deterministic `legacy-artist-entity-*` entities from existing track, album, and artist names.
- Backfilled canonical names into `artist_entity_names`.
- Backfilled track credits from the former `tracks.artists` values.
- Backfilled album credits from the former `albums.artists` values.
- Linked existing artist rows to `artist_entities`.
- Dropped the old `tracks.artists` column.
- Dropped the old `albums.artists` column.
- Dropped the old `artists.name` column.

This is the migration step that makes artist display data relational while preserving the previous visible names through credit rows.

### `0032_lucky_venom.sql`

Moved artist-adjacent relation tables from the old artist-row identity to canonical artist entities:

- `artist_external_ids.artist_id` became `artist_external_ids.artist_entity_id`.
- `artist_service_links.artist_id` became `artist_service_links.artist_entity_id`.
- `artist_short_urls.artist_id` became `artist_short_urls.artist_entity_id`.
- Foreign keys now reference `artist_entities`.
- Validation blocks abort the migration if any backfilled relation points to a missing entity.

### `0033_cuddly_molten_man.sql`

Replaced the old `artists` table with `artist_profiles`:

- Created `artist_profiles`.
- Backfilled profile data from `artists`.
- Validated row counts and entity references.
- Dropped `artists`.
- Added `artist_profiles.artist_entity_id -> artist_entities.id`.
- Added source URL and creation-date indexes.

### `0034_huge_mercury.sql`

Added uniqueness guarantees for short URL ownership, including `artist_short_urls.artist_entity_id`.

### Later relevant migrations

The migration sequence did not stop at `0034`. Later migrations remain part of the current baseline. In particular,
`0041_dry_king_cobra.sql` adds relevant artist-credit and artist-name indexes.

## Runtime Changes Completed

- Backend repository reads tracks and albums with normalized `artistCredits`.
- Backend derives compatibility `artists` arrays from credit rows.
- Backend search matches artist names through credit tables.
- Backend write path accepts explicit artist entity credits for tracks and albums.
- Backend admin track updates accept `artistCredits`.
- Dashboard track editor keeps existing entity credits when names are unchanged.
- Dashboard overview distinguishes artist profiles from artist entities.
- Dashboard artist profile delete copy states that only profiles are removed.
- OpenAPI/shared API schemas include `ArtistCredit`.
- Integration coverage verifies persisted credit entity refs and compatibility display names.

## Hot Queries Supported By Schema

### Artists with birthdays or death anniversaries today

Use `artist_entity_events` filtered by `(event_type, event_month, event_day)` and `date_precision = 'day'`. Join names by preferred locale and restrict to `person` or `persona`.

### Bands formed today

Use `artist_entity_events` with `event_type = 'formed'`, restricted to `entity_type = 'group'`.

### Members of a band

Use `artist_group_memberships.group_artist_entity_id`, then join member entity names and roles.

### Bands of a person

Use `artist_group_memberships.member_artist_entity_id`, then join group entity names and roles.

### Catalog-relevant anniversaries

An artist entity is catalog-relevant when it is directly credited on a track/album or when it is a member of a group credited on a track/album. This can start as an `EXISTS` query over the credit and membership tables and later become a view/materialized view if query volume requires it.

## Remaining Work Outside This Migration Step

These are intentionally separate from the structural migration:

- Import or manually verify missing biography/event data from reliable sources.
- Enrich `entity_type` from `unknown` to `person`, `group`, or `persona` where provenance is good enough.
- Fill group memberships and membership roles.
- Add full dashboard entity pickers for manual artist credit editing if editors need to change entity links directly.
- Add dedicated API routes and dashboard views for birthdays, death anniversaries, band formation dates, and memberships. Repository-level methods already exist, but they are not exposed as product UI.
- Decide whether artist credits remain runtime main-only or whether non-main roles become an end-to-end product feature.
- Decide whether `artistEntityId` in the artist-info query contract is implemented entity-aware or removed from the contract.

## Risks

- Legacy name matching can still be ambiguous for identical artist names. Only explicit provider IDs, verified manual decisions, or trusted source data should upgrade candidates to verified entities.
- Bands and people are distinct entity types. A credited name such as `Depeche Mode` should link to a group entity, while members such as `Dave Gahan` link to person entities through `artist_group_memberships`.
- Birth dates for living people need clear public-source provenance.
- Wikidata multilingual descriptions are useful as source data but are not equivalent to editorial biographies.

## Verification Baseline

For each completed code or documentation step in this migration sequence:

- `pnpm --filter @musiccloud/backend typecheck`
- `pnpm --filter @musiccloud/dashboard typecheck`
- `pnpm lint`
- `DATABASE_URL=postgresql://musiccloud:dev-password-local-only@localhost:5433/musiccloud pnpm --filter @musiccloud/backend test:run`
- `pnpm --filter @musiccloud/dashboard test:run`

All schema changes must continue to be generated and applied through Drizzle migrations only.
