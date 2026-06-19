# Plan: Procedurally generated Genre Artworks

Plan-Nr.: MC-002

## Context

**Problem.** The Genre Browse Grid currently reuses Last.fm album covers as thumbnails (`apps/backend/src/services/genre-search/lastfm.ts:420-440`). This means every user sees the same album cover for "Shoegaze" or "Krautrock", the artwork is not visually tied to the genre as a whole, and the visual language is inconsistent (each Last.fm cover has its own aesthetic).

**Goal.** Replace the per-tile cover with a **unique, self-generated artwork** per genre. Visual direction: atmospheric, dark, one strong accent hue (Unsplash-style — the user referenced a dark photo with a dominant teal cast at photo-1623018035813-9cfb5b502e04 as the look-and-feel north star). The accent color is derived from the **average color of the genre's top Last.fm album cover** so the artwork feels musically correct. Each artwork is generated on the fly the first time it's requested, persisted, and served from cache from then on.

**Decisions already made with the user:**
- Image library: **`jimp`** (pure JS, bundles into `dist/server.js` — required because backend `deployFiles` in `zerops.yml` is `apps/backend/dist` + migrations only, no `node_modules`; `sharp` is ruled out because native binaries do not bundle). Verified that `tsup.config.ts` uses `noExternal: [/^(?!better-sqlite3).+/]` — jimp bundles automatically, no config change needed.
- Output format: **JPEG** (gradient + noise compresses to ~10-30 KB, no alpha needed).
- Delivery: **dedicated endpoint** `GET /api/v1/genre-artwork/:genreKey` with immutable Cache-Control.
- Generation strategy: **lazy** via the endpoint (not eager in `getGenreBrowseGrid`), with in-flight dedup so parallel requests for the same uncached genre share one generation.
- **Scope extension**: in the same changeset, raise the genre browse count from 120 to **200**. Requires `chart.getTopTags` raw fetch limit to go from `200` to `400` to provide enough candidates after blocklist + cover-enrichment filtering.

---

## Architecture

```
Browser  ─►  GET /api/v1/genre-artwork/shoegaze
Backend  ─►  genre_artworks table
             ├─ HIT  → return BYTEA, 200, immutable cache
             └─ MISS → ensureArtwork(shoegaze):
                        1. fetch top album cover URL  (Last.fm)
                        2. extractAccent(coverBytes)  (jimp + HSL hue-buckets, ported from colors.ts)
                        3. generateArtwork(seed=genreName, accent) → JPEG buffer
                        4. INSERT (genre_key, jpeg, accent_color, source_cover_url)
                        5. return buffer
```

The Last.fm cover is **only** used as a color source — it is never surfaced to the frontend anymore. The accent color is stored alongside the JPEG so the frontend can use it for hover/border/glow styling without sampling the image in the browser.

---

## Implementation

### 1. DB migration `0010_genre_artworks` — Drizzle-generated

New table for artwork persistence:

```sql
CREATE TABLE "genre_artworks" (
  "genre_key"         text PRIMARY KEY NOT NULL,
  "jpeg"              bytea NOT NULL,
  "accent_color"      text NOT NULL,
  "source_cover_url"  text,
  "created_at"        timestamp DEFAULT now() NOT NULL
);
```

- `genre_key` = normalised genre name (same normalisation as Last.fm tiles: lowercase, trim, single-spaces).
- `accent_color` as hex (`#RRGGBB`), returned with the grid so the frontend does not need to re-sample.
- `source_cover_url` for debugging/regeneration only.

**Generate migration via Drizzle** (per project rule "Drizzle only, NEVER manual SQL"):
1. Add `genreArtworks` to `apps/backend/src/db/schemas/postgres.ts` (actual schema file path — not `schema.ts`).
2. From repo root: `DATABASE_URL=postgresql://musiccloud:dev-password-local-only@localhost:5433/musiccloud npm run db:generate` → produces `0010_*.sql`.
3. From repo root: `DATABASE_URL=... npm run db:migrate` — per feedback rule "always apply migrations locally". Uses `scripts/migrate.mjs`.

### 2. New module: `apps/backend/src/services/genre-artwork/`

```
genre-artwork/
├── index.ts              # public surface: ensureArtwork, getCachedArtwork
├── color-extractor.ts    # Node port of frontend extractAlbumColors/extractAccent
├── generator.ts          # jimp composition → JPEG buffer
└── repository.ts         # DB read/write via shared pool
```

**`color-extractor.ts`** — port, verbatim in spirit, the algorithm in `apps/frontend/src/lib/ui/colors.ts:19-159`:
- Same `rgbToHsl` / `hslToRgb` / `extractAccent` helpers (pure functions, copy into a shared utility under `packages/shared/src/color.ts` so frontend and backend share one source of truth — avoids drift).
- `extractAccentFromBuffer(jpegOrPngBuffer): Promise<{ accent: DynamicAccent | null }>`:
  - `Jimp.read(buffer)` → `.resize(64, 64)` → `.scan()` over 64×64 = 4096 pixels.
  - 36 hue buckets, skip pixels with `L<0.1 | L>0.9 | S<0.12`, saturation-weighted mass, pick winning bucket.
  - Same math as frontend; identical output for identical pixels. **This is the single piece of code that must be kept in lockstep with the frontend version** — hence the shared-package move.

**`generator.ts`** — `generateArtwork(seed: string, accent: string): Promise<Buffer>`:
- Deterministic seed via FNV-1a hash of the genre name → seedable PRNG (e.g., mulberry32) so each genre has a unique-but-stable layout.
- Composition pipeline on a 512×512 canvas:
  1. **Base**: fill with very dark shade of accent (accent hue, S=0.35, L=0.06).
  2. **Blob layer**: 3 soft radial gradients at seeded positions, accent color at varied saturation/lightness, `Jimp#blur(60)` for the out-of-focus atmosphere.
  3. **Noise overlay**: `scan()` adds ±8 grayscale noise per pixel for photo-grain feel (opacity ~0.15).
  4. **Vignette**: darken corners multiplicatively (`r² / r_max²` falloff).
  5. **Export**: `.quality(82).getBufferAsync(Jimp.MIME_JPEG)`.
- Target output size: ~15-25 KB.

**`repository.ts`** — thin wrapper over the `pg` pool already exposed in `image-cache.ts`:
- `getArtwork(genreKey)` → `{ jpeg, accentColor } | null`
- `saveArtwork(genreKey, jpeg, accentColor, sourceCoverUrl)` — `INSERT ... ON CONFLICT DO NOTHING` (first-writer-wins, same pattern as `cacheAlbumImage`).

**`index.ts`**:
- `ensureArtwork(genreKey, coverUrl)` with **in-flight dedup** (Map keyed by `genreKey`, like `browseCacheInflight` at `lastfm.ts:390`): fetch cover bytes → extract accent → generate → save → return.
- `getCachedArtwork(genreKey)` — just reads repository, no generation.

### 3. New route: `apps/backend/src/routes/genre-artwork.ts`

```
GET /api/v1/genre-artwork/:genreKey
```

- Validate `genreKey` (lowercase ASCII + spaces, max 64 chars; reject anything else → 400).
- `getCachedArtwork` → if hit, return `Content-Type: image/jpeg`, `Cache-Control: public, max-age=31536000, immutable`.
- If miss: look up cover URL for the genre (reuse `fetchTopAlbums(genreKey, 5)` in `lastfm.ts`, pick first image). If no cover → 404. Otherwise `ensureArtwork(genreKey, coverUrl)` → return JPEG.
- Register in `apps/backend/src/server.ts` alongside other routes.

### 4. Wire into genre browse: `apps/backend/src/services/genre-search/lastfm.ts:406-460`

- Extend `GenreTile` to `{ name, displayName, artworkUrl, accentColor? }` (replace `imageUrl`).
- **Raise count**: `BROWSE_GENRE_COUNT` 120 → 200 (line 392). `chart.getTopTags` limit `"200"` → `"400"` (line 413) so enough candidates survive blocklist + cover-enrichment filtering.
- In `getGenreBrowseGrid`: after confirming a cover exists for a genre, set `artworkUrl = `/api/v1/genre-artwork/${genreKey}``.
- Do **not** pre-generate artworks here — the dedicated endpoint handles generation lazily. This keeps the first grid-load fast.
- Best-effort: if the repository already has `accent_color` for the genre, inline it into the tile so the frontend can colorize the card border immediately (before the artwork JPEG has loaded). Single batch query at the end of `getGenreBrowseGrid` via `SELECT genre_key, accent_color FROM genre_artworks WHERE genre_key = ANY($1)`.

### 5. Shared API type: `packages/shared/src/api.ts:145-152`

```ts
export interface ApiGenreTile {
  name: string;
  displayName: string;
  artworkUrl: string;       // was imageUrl, same field purpose, new URL shape
  accentColor?: string;     // hex, only present if artwork already cached
}
```

Rename is acceptable because there are no external consumers (frontend + backend are in the same monorepo).

### 6. Frontend: `apps/frontend/src/components/panels/GenreBrowseGrid.tsx:36-74`

- Swap `genre.imageUrl` → `genre.artworkUrl` in the `<img>` tag.
- When `genre.accentColor` is present, apply it via CSS variable on the EmbossedButton wrapper, mirroring the pattern at `apps/frontend/src/components/share/ShareLayout.tsx:168-190`:
  ```tsx
  style={{ "--color-accent": genre.accentColor } as React.CSSProperties}
  ```
  The existing `var(--color-accent)` usage in `global.css:13-30` and arbitrary Tailwind values will pick it up for hover/border/glow — no new Tailwind classes needed.
- Keep the current fallback (`/og/default.jpg` + 🎵 emoji) for robustness.

### 7. Dependency & bundling

- `npm i jimp -w apps/backend`.
- Bundler: **tsup** with `noExternal: [/^(?!better-sqlite3).+/]` already bundles everything that isn't better-sqlite3. `jimp` (pure JS) ends up inside `dist/server.js` automatically — no `tsup.config.ts` change needed.

---

## Critical files

| Purpose | Path |
|---|---|
| Genre grid UI (frontend) | `apps/frontend/src/components/panels/GenreBrowseGrid.tsx` |
| Color extraction (to be shared) | `apps/frontend/src/lib/ui/colors.ts` → move pure helpers to `packages/shared/src/color.ts` |
| Shared API type | `packages/shared/src/api.ts:145-152` |
| Genre browse backend | `apps/backend/src/services/genre-search/lastfm.ts:380-460` |
| DB schema | `apps/backend/src/db/schemas/postgres.ts` |
| Drizzle config | `drizzle.config.postgres.ts` (repo root) |
| Migration runner | `scripts/migrate.mjs` |
| Existing pg pool pattern to reuse | `apps/backend/src/services/image-cache.ts:25-35` |
| Cache write-through pattern to mirror | `apps/backend/src/services/image-cache.ts` `cacheAlbumImage` (first-writer-wins) |
| Route registration | `apps/backend/src/server.ts` |
| Deploy pipeline (verify bundling) | `zerops.yml` |

## Reusable code to leverage

- **`extractAccent` + `rgbToHsl` + `hslToRgb`** (`colors.ts:19-84`) — move to `packages/shared/src/color.ts`, use in both frontend (existing Canvas path) and backend (new jimp path).
- **pg pool pattern** from `image-cache.ts` — same `getPool()` helper, same `max: 2`, same lazy init.
- **In-flight dedup pattern** from `lastfm.ts:390` (`browseCacheInflight`) — reuse shape for artwork generation.
- **`fetchTopAlbums` / `pickImage`** already in `lastfm.ts` — reuse for cover lookup in the route miss path.
- **Accent application via `--color-accent` CSS var** from `ShareLayout.tsx:168-190` — identical pattern for genre tiles.

## Verification

1. **Build passes.** `npm run build -w packages/shared && npm run build -w apps/backend` — confirm `jimp` is bundled into `dist/server.js` (not externalised). Also `npm run lint` and `npm run typecheck`.
2. **Migration applies.** `npm run db:push -w apps/backend` against local postgres on :5433. Verify `genre_artworks` exists with correct columns.
3. **Endpoint cold path.** `curl -i http://localhost:4000/api/v1/genre-artwork/shoegaze -o /tmp/shoegaze.jpg`. First call: `Content-Type: image/jpeg`, ~15-25 KB, takes a few hundred ms. Open `/tmp/shoegaze.jpg` — should be atmospheric, one dominant hue consistent with typical shoegaze album palettes.
4. **Endpoint warm path.** Re-run the same curl. Second call is served from DB, <50 ms, same bytes.
5. **DB contents.** `psql $DATABASE_URL -c "select genre_key, length(jpeg), accent_color from genre_artworks"` — one row per requested genre, JPEG bytes non-zero, accent hex valid.
6. **In-flight dedup.** Fire 20 parallel requests for a genre that is NOT yet cached (e.g., `ab -n 20 -c 20 .../krautrock`). All should return the same bytes; only one row should be inserted, and the server log should show exactly one "generating artwork" log line.
7. **Grid integration.** Start `apps/backend` (4000), `apps/frontend` (3000). Open the landing page, trigger `genre:?` browse. Verify the grid shows **~200 tiles** (up from 120). Verify in the browser devtools Network tab that thumbnails now come from `/api/v1/genre-artwork/...` and render as atmospheric JPEGs, not Last.fm covers. Hover a tile — accent-colored border/glow should feel musically matching (e.g., trance → cyan, country → amber).
8. **Fallback.** Temporarily break the cover-fetch (return no image) — tile should render the emoji fallback without breaking the grid.
9. **Deploy dry-run.** `zip -r backend-dist.zip apps/backend/dist apps/backend/src/db/migrations && unzip -l backend-dist.zip | grep -i jimp` — jimp code should be **inside** `dist/server.js`, not expected in a separate file. Confirm nothing references `node_modules/jimp` at runtime.

## Completed

- **Date:** 2026-04-28 (retroactive — plan was executed earlier, archived during housekeeping)
- **Delivered:**
  - DB: `genre_artworks` table in `apps/backend/src/db/schemas/postgres.ts:372` (Drizzle migration applied).
  - Service module `apps/backend/src/services/genre-artwork/` with `color-extractor.ts`, `generator.ts`, `index.ts`, `repository.ts` (matches plan's file list).
  - Public surface: `ensureArtwork`, `getCachedArtwork`, `getAccentColors`, `clearAllArtworks`.
  - Route: `apps/backend/src/routes/genre-artwork.ts` registered in `server.ts:21` — serves `/api/v1/genre-artwork/:genreKey` with cache.
  - jimp dependency added to `apps/backend/package.json` (`^1.6.1`); `scripts/copy-jimp-fonts.mjs` runs in dev/build.
  - Last.fm orchestrator (`services/genre-search/lastfm.ts`) now points tile `artworkUrl` at the new endpoint with version cache-busting.
- **Out of scope (still open):** raise of genre count from 120 → 200 (verify in `lastfm.ts` if needed in a follow-up).
