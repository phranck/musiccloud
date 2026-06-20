# CC-Pfad — Backend-Foundation (Datenmodell + Jamendo-Client) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Datenfundament für den Creative-Commons-Pfad legen (vier eigene `cc_*`-Tabellen) und einen typisierten, in sich getesteten Jamendo-API-Client bauen, der Tracks/Alben/Künstler/„Ähnliche" aus der Jamendo-API v3.0 holt und auf CC-Domänen-Objekte mappt.

**Architecture:** Vollständig getrennt vom kommerziellen Pfad. Vier schlanke `cc_*`-Tabellen (kein `service_links`/`external_ids`/`previews`, keine ISRC — Jamendo ist die einzige Quelle, Streams sind permanent). Der Jamendo-Client ist ein eigenständiges Modul unter `services/cc/jamendo/` und **nicht** Teil des kommerziellen `services/plugins/registry.ts` (SRP, zwei getrennte Pfade). Dedup erfolgt über `jamendo_id` (unique), nicht über ISRC.

**Tech Stack:** Drizzle ORM + `pg` (Postgres), nanoid, native `fetch`, vitest, pnpm@10.33.1. Backend ist Fastify-basiert (für spätere Route-Pläne relevant, hier nicht).

**Scope-Hinweis:** Dieser Plan liefert das Fundament. Repository (Persistierung), CC-Resolve-Modul und die Fastify-Route sind **Plan 2** (`2026-06-21-cc-pfad-backend-resolve.md`). Frontend und Dashboard folgen als eigene Pläne.

---

## Voraussetzung: Jamendo `client_id`

Der Client liest `process.env.JAMENDO_CLIENT_ID`. Vor Task 3 muss eine kostenlose Jamendo-App registriert sein:

1. Auf <https://devportal.jamendo.com/> einen kostenlosen Account anlegen, eine App erstellen → `client_id` kopieren.
2. In `apps/backend/.env.local` eintragen: `JAMENDO_CLIENT_ID=<client_id>`.
3. Realen Test-Call zur Verifikation (ersetzt `<id>`):
   ```bash
   curl -s "https://api.jamendo.com/v3.0/tracks/?client_id=<id>&format=json&limit=1&include=musicinfo" | head -c 800
   ```
   Erwartet: JSON-Envelope `{"headers":{"status":"success",...},"results":[{ "id":..., "name":..., "audio":..., "license_ccurl":..., "waveform":..., ... }]}`. Bestätigt die in Task 2 modellierten Feldnamen gegen die echte Antwort.

---

## File Structure

- **Modify:** `apps/backend/src/db/schemas/postgres.ts` — vier `cc_*`-Tabellen ans Dateiende anhängen (folgt dem bestehenden `pgTable`-Muster der Datei).
- **Create (generiert):** `apps/backend/src/db/migrations/postgres/0043_*.sql` — additive Migration, von `drizzle-kit generate` erzeugt (Name ist zufällig).
- **Create:** `apps/backend/src/services/cc/jamendo/types.ts` — rohe Jamendo-Response-Typen (`JamendoTrackRaw`, `JamendoEnvelope`) + CC-Domänen-Typen (`CcTrack`, `CcAlbum`, `CcArtist`, `CcSimilarTrack`).
- **Create:** `apps/backend/src/services/cc/jamendo/client.ts` — `jamendoFetch` (Low-Level), `searchCcTracks`, `getCcTrack`, `getSimilarCcTracks`, `getCcAlbum`, `getCcArtist` + Mapper.
- **Create:** `apps/backend/src/services/cc/jamendo/__tests__/client.test.ts` — Unit-Tests mit gemocktem `fetch`.

Jede Datei hat eine klare Verantwortung: `types.ts` modelliert Daten, `client.ts` kapselt API-Zugriff + Mapping, der Test prüft Mapping und Fehlerpfade.

---

## Task 1: Vier `cc_*`-Tabellen im Schema

**Files:**
- Modify: `apps/backend/src/db/schemas/postgres.ts` (am Dateiende anhängen)

Reihenfolge wegen Foreign Keys: `cc_artists` → `cc_albums` → `cc_tracks` → `cc_short_urls`. `cc_tracks.cc_artist_id`/`cc_album_id` sind nullable (der Resolve-Flow in Plan 2 persistiert Künstler/Album evtl. erst nachträglich). Dedup je Entität über `jamendo_id` (unique).

- [ ] **Step 1: Tabellen anhängen**

Ans Ende von `postgres.ts` (alle verwendeten Helfer — `pgTable`, `text`, `integer`, `timestamp`, `jsonb`, `index`, `uniqueIndex` — sind in der Datei bereits importiert):

```typescript
// ============================================================================
// CREATIVE COMMONS (Jamendo) — separate entity families, no commercial overlap
// ============================================================================

/**
 * Creative-Commons artists resolved from Jamendo.
 * Slim by design: a single localized bio blob, no normalized identity graph.
 */
export const ccArtists = pgTable(
  "cc_artists",
  {
    id: text("id").primaryKey(),
    jamendoId: text("jamendo_id").notNull(),
    name: text("name").notNull(),
    imageUrl: text("image_url"),
    website: text("website"),
    bio: jsonb("bio"), // localized { en, de, ... }
    shareUrl: text("share_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("uq_cc_artists_jamendo_id").on(table.jamendoId),
    index("idx_cc_artists_name").on(table.name),
  ],
);

/**
 * Creative-Commons albums resolved from Jamendo.
 */
export const ccAlbums = pgTable(
  "cc_albums",
  {
    id: text("id").primaryKey(),
    jamendoId: text("jamendo_id").notNull(),
    name: text("name").notNull(),
    ccArtistId: text("cc_artist_id").references(() => ccArtists.id),
    artworkUrl: text("artwork_url"),
    releaseDate: text("release_date"),
    zipUrl: text("zip_url"),
    shareUrl: text("share_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("uq_cc_albums_jamendo_id").on(table.jamendoId),
    index("idx_cc_albums_cc_artist_id").on(table.ccArtistId),
  ],
);

/**
 * Creative-Commons tracks resolved from Jamendo.
 * `stream_url` is the permanent full-track stream (no expiry, unlike commercial
 * previews). `download_allowed` mirrors Jamendo's `audiodownload_allowed`.
 */
export const ccTracks = pgTable(
  "cc_tracks",
  {
    id: text("id").primaryKey(),
    jamendoId: text("jamendo_id").notNull(),
    title: text("title").notNull(),
    artistName: text("artist_name").notNull(),
    ccArtistId: text("cc_artist_id").references(() => ccArtists.id),
    albumName: text("album_name"),
    ccAlbumId: text("cc_album_id").references(() => ccAlbums.id),
    artworkUrl: text("artwork_url"),
    durationMs: integer("duration_ms"),
    releaseDate: text("release_date"),
    licenseCcurl: text("license_ccurl"),
    streamUrl: text("stream_url").notNull(),
    downloadUrl: text("download_url"),
    downloadAllowed: integer("download_allowed"),
    waveform: text("waveform"),
    shareUrl: text("share_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("uq_cc_tracks_jamendo_id").on(table.jamendoId),
    index("idx_cc_tracks_cc_artist_id").on(table.ccArtistId),
    index("idx_cc_tracks_cc_album_id").on(table.ccAlbumId),
    index("idx_cc_tracks_title").on(table.title),
    index("idx_cc_tracks_created_at").on(table.createdAt.desc()),
  ],
);

/**
 * Public short-code mapping for CC track share pages.
 * Mirrors the commercial `short_urls` pattern (`id` is the code, one per track),
 * but is created eagerly on track persistence so every CC track is immediately
 * shareable and playlist-ready.
 */
export const ccShortUrls = pgTable(
  "cc_short_urls",
  {
    id: text("id").primaryKey(),
    ccTrackId: text("cc_track_id")
      .notNull()
      .references(() => ccTracks.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("idx_cc_short_urls_cc_track_id").on(table.ccTrackId),
    uniqueIndex("uq_cc_short_urls_cc_track_id").on(table.ccTrackId),
  ],
);
```

- [ ] **Step 2: Migration generieren**

Run: `pnpm db:generate`
Expected: Eine neue Datei `apps/backend/src/db/migrations/postgres/0043_*.sql` wird erzeugt; die Ausgabe meldet die vier neuen Tabellen `cc_artists`, `cc_albums`, `cc_tracks`, `cc_short_urls`.

- [ ] **Step 3: Migration-SQL sichten**

Run: `cat apps/backend/src/db/migrations/postgres/0043_*.sql`
Expected: `CREATE TABLE "cc_artists" …`, `"cc_albums"`, `"cc_tracks"`, `"cc_short_urls"` mit den FKs und den `uq_*_jamendo_id`-Indizes. Es dürfen **keine** `ALTER`/`DROP` an bestehenden Tabellen vorkommen (rein additiv).

- [ ] **Step 4: Migration anwenden**

Run: `DATABASE_URL=<lokale URL> pnpm db:migrate`
(`DATABASE_URL` aus `apps/backend/.env.local` übernehmen.)
Expected: Runner läuft ohne Fehler durch; bei Erfolg keine Exception. `scripts/migrate.mjs` pflegt `drizzle.__drizzle_migrations`.

> **Hinweis (Memory `project_dual_migration_trackers`):** musiccloud führt historisch zwei Tracker (`drizzle.__drizzle_migrations` vs. `public._migrations`). Nach `db:migrate` prüfen, ob ein Backend-Restart sauber startet; falls der zweite Tracker nachgepflegt werden muss, das hier tun, bevor weitergearbeitet wird.

- [ ] **Step 5: Tabellen in der DB verifizieren**

Run: `psql "$DATABASE_URL" -c "\dt cc_*"`
Expected: Vier Zeilen — `cc_artists`, `cc_albums`, `cc_tracks`, `cc_short_urls`.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/db/schemas/postgres.ts apps/backend/src/db/migrations/postgres/0043_*.sql
git commit -m "Feat: add cc_* tables for Creative-Commons path

- cc_artists, cc_albums, cc_tracks, cc_short_urls (separate families)
- dedup per jamendo_id (unique), no ISRC/service_links/previews
- additive migration 0043, commercial tables untouched"
```

---

## Task 2: Jamendo- und CC-Domänen-Typen

**Files:**
- Create: `apps/backend/src/services/cc/jamendo/types.ts`

Reine Typdefinitionen, kein Test nötig.

- [ ] **Step 1: Datei anlegen**

```typescript
/**
 * Type definitions for the Jamendo API v3.0 integration.
 *
 * Two layers: raw response shapes exactly as Jamendo returns them
 * (`Jamendo*Raw`, snake_case), and clean CC domain objects the rest of the
 * backend consumes (`Cc*`, camelCase). The client maps raw → domain.
 */

/**
 * Jamendo wraps every response in a `headers` + `results` envelope.
 *
 * @typeParam T - The element type of the `results` array.
 */
export interface JamendoEnvelope<T> {
  headers: {
    status: "success" | "failed";
    code: number;
    error_message?: string;
    results_count: number;
  };
  results: T[];
}

/** Raw track object as returned by `GET /v3.0/tracks`. */
export interface JamendoTrackRaw {
  id: string;
  name: string;
  duration: number; // seconds
  artist_id: string;
  artist_name: string;
  album_id: string;
  album_name: string;
  album_image: string;
  image: string;
  audio: string; // full-track stream URL
  audiodownload: string;
  audiodownload_allowed: boolean;
  license_ccurl: string;
  shareurl: string;
  waveform: string; // escaped JSON string {"peaks":[…]}
  releasedate: string; // YYYY-MM-DD
}

/** Raw album object as returned by `GET /v3.0/albums`. */
export interface JamendoAlbumRaw {
  id: string;
  name: string;
  artist_id: string;
  artist_name: string;
  image: string;
  releasedate: string;
  zip: string;
  shareurl: string;
}

/** Raw artist object as returned by `GET /v3.0/artists`. */
export interface JamendoArtistRaw {
  id: string;
  name: string;
  website: string;
  image: string;
  shareurl: string;
}

/**
 * A Creative-Commons track in musiccloud's domain shape.
 * `durationMs` is milliseconds (Jamendo reports seconds; the mapper multiplies).
 */
export interface CcTrack {
  jamendoId: string;
  title: string;
  artistName: string;
  jamendoArtistId: string;
  albumName?: string;
  jamendoAlbumId?: string;
  artworkUrl?: string;
  durationMs?: number;
  releaseDate?: string;
  licenseCcurl?: string;
  streamUrl: string;
  downloadUrl?: string;
  downloadAllowed: boolean;
  waveform?: string;
  shareUrl?: string;
}

/** A Creative-Commons album in domain shape. */
export interface CcAlbum {
  jamendoId: string;
  name: string;
  jamendoArtistId: string;
  artistName: string;
  artworkUrl?: string;
  releaseDate?: string;
  zipUrl?: string;
  shareUrl?: string;
}

/** A Creative-Commons artist in domain shape. */
export interface CcArtist {
  jamendoId: string;
  name: string;
  website?: string;
  imageUrl?: string;
  shareUrl?: string;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @musiccloud/backend typecheck`
Expected: PASS (keine Fehler).

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/services/cc/jamendo/types.ts
git commit -m "Feat: add Jamendo raw + CC domain types"
```

---

## Task 3: `jamendoFetch` + `searchCcTracks` + Track-Mapper (TDD)

**Files:**
- Create: `apps/backend/src/services/cc/jamendo/client.ts`
- Test: `apps/backend/src/services/cc/jamendo/__tests__/client.test.ts`

- [ ] **Step 1: Failing test schreiben**

`apps/backend/src/services/cc/jamendo/__tests__/client.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchCcTracks } from "../client.js";
import type { JamendoEnvelope, JamendoTrackRaw } from "../types.js";

const SAMPLE_TRACK: JamendoTrackRaw = {
  id: "1886393",
  name: "Sample Title",
  duration: 180,
  artist_id: "338723",
  artist_name: "Sample Artist",
  album_id: "176136",
  album_name: "Sample Album",
  album_image: "https://usercontent.jamendo.com/album.jpg",
  image: "https://usercontent.jamendo.com/track.jpg",
  audio: "https://prod-1.storage.jamendo.com/?trackid=1886393&format=mp31",
  audiodownload: "https://prod-1.storage.jamendo.com/download/track/1886393/mp32/",
  audiodownload_allowed: true,
  license_ccurl: "http://creativecommons.org/licenses/by-nc-nd/3.0/",
  shareurl: "https://www.jamendo.com/track/1886393",
  waveform: '{"peaks":[0,12,40,255]}',
  releasedate: "2020-05-01",
};

function mockJamendo(body: JamendoEnvelope<JamendoTrackRaw>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => body,
    } as Response),
  );
}

describe("searchCcTracks", () => {
  beforeEach(() => {
    vi.stubEnv("JAMENDO_CLIENT_ID", "test_client_id");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("maps a Jamendo track to a CcTrack (seconds → ms, license, stream, waveform)", async () => {
    mockJamendo({
      headers: { status: "success", code: 0, results_count: 1 },
      results: [SAMPLE_TRACK],
    });

    const tracks = await searchCcTracks({ search: "sample" });

    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({
      jamendoId: "1886393",
      title: "Sample Title",
      artistName: "Sample Artist",
      jamendoArtistId: "338723",
      albumName: "Sample Album",
      durationMs: 180000,
      licenseCcurl: "http://creativecommons.org/licenses/by-nc-nd/3.0/",
      streamUrl: "https://prod-1.storage.jamendo.com/?trackid=1886393&format=mp31",
      downloadAllowed: true,
      waveform: '{"peaks":[0,12,40,255]}',
    });
  });

  it("passes client_id and structured fields to the request URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ headers: { status: "success", code: 0, results_count: 0 }, results: [] }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    await searchCcTracks({ name: "Enjoy The Silence", artist_name: "Depeche Mode", limit: 5 });

    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain("client_id=test_client_id");
    expect(calledUrl).toContain("name=Enjoy+The+Silence");
    expect(calledUrl).toContain("artist_name=Depeche+Mode");
    expect(calledUrl).toContain("limit=5");
  });

  it("throws when JAMENDO_CLIENT_ID is missing", async () => {
    vi.unstubAllEnvs();
    await expect(searchCcTracks({ search: "x" })).rejects.toThrow(/JAMENDO_CLIENT_ID/);
  });

  it("throws when the API reports a failed status", async () => {
    mockJamendo({
      headers: { status: "failed", code: 1, error_message: "boom", results_count: 0 },
      results: [],
    });
    await expect(searchCcTracks({ search: "x" })).rejects.toThrow(/boom/);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `pnpm --filter @musiccloud/backend test:run src/services/cc/jamendo/__tests__/client.test.ts`
Expected: FAIL — `client.ts` existiert noch nicht (Import schlägt fehl).

- [ ] **Step 3: Minimale Implementierung**

`apps/backend/src/services/cc/jamendo/client.ts`:

```typescript
/**
 * Jamendo API v3.0 client for the Creative-Commons path.
 *
 * Standalone module, deliberately not registered in the commercial
 * `services/plugins/registry.ts`. Wraps the Jamendo REST endpoints, enforces
 * the required `client_id`, and maps raw responses to CC domain objects.
 */

import type {
  CcTrack,
  JamendoEnvelope,
  JamendoTrackRaw,
} from "./types.js";

const JAMENDO_BASE = "https://api.jamendo.com/v3.0";

/**
 * Search/filter parameters accepted by the track endpoints. Mirrors the subset
 * of Jamendo `GET /tracks` params the CC path uses; values are stringified and
 * URL-encoded by {@link jamendoFetch}.
 */
export interface CcTrackQuery {
  search?: string;
  name?: string;
  artist_name?: string;
  album_name?: string;
  tags?: string;
  fuzzytags?: string;
  limit?: number;
  offset?: number;
}

/**
 * Reads the configured Jamendo client id, throwing when it is absent so callers
 * fail loudly instead of silently hitting an unauthenticated endpoint.
 *
 * @returns The non-empty `JAMENDO_CLIENT_ID`.
 * @throws Error when `JAMENDO_CLIENT_ID` is unset or empty.
 */
function requireClientId(): string {
  const id = process.env.JAMENDO_CLIENT_ID;
  if (!id) {
    throw new Error("JAMENDO_CLIENT_ID is not set");
  }
  return id;
}

/**
 * Low-level GET against a Jamendo endpoint. Adds `client_id`, `format=json`
 * and every provided param, then validates the response envelope.
 *
 * @typeParam T - Element type of the `results` array.
 * @param path - Endpoint path below the API base, e.g. `/tracks`.
 * @param params - Query params; `undefined`/empty values are skipped.
 * @returns The parsed `results` array.
 * @throws Error on transport failure, non-OK HTTP, or `status === "failed"`.
 */
export async function jamendoFetch<T>(
  path: string,
  params: Record<string, string | number | undefined>,
): Promise<T[]> {
  const url = new URL(`${JAMENDO_BASE}${path}`);
  url.searchParams.set("client_id", requireClientId());
  url.searchParams.set("format", "json");
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Jamendo request failed: HTTP ${response.status}`);
  }
  const body = (await response.json()) as JamendoEnvelope<T>;
  if (body.headers.status !== "success") {
    throw new Error(`Jamendo API error: ${body.headers.error_message ?? body.headers.code}`);
  }
  return body.results;
}

/**
 * Maps a raw Jamendo track to the CC domain shape.
 * Converts duration seconds → ms and prefers the track image over the album
 * image for artwork.
 *
 * @param raw - Raw Jamendo track object.
 * @returns The mapped {@link CcTrack}.
 */
export function mapJamendoTrack(raw: JamendoTrackRaw): CcTrack {
  return {
    jamendoId: raw.id,
    title: raw.name,
    artistName: raw.artist_name,
    jamendoArtistId: raw.artist_id,
    albumName: raw.album_name || undefined,
    jamendoAlbumId: raw.album_id || undefined,
    artworkUrl: raw.image || raw.album_image || undefined,
    durationMs: raw.duration ? raw.duration * 1000 : undefined,
    releaseDate: raw.releasedate || undefined,
    licenseCcurl: raw.license_ccurl || undefined,
    streamUrl: raw.audio,
    downloadUrl: raw.audiodownload || undefined,
    downloadAllowed: Boolean(raw.audiodownload_allowed),
    waveform: raw.waveform || undefined,
    shareUrl: raw.shareurl || undefined,
  };
}

/**
 * Searches CC tracks via `GET /tracks`. Accepts free-text (`search`) or the
 * structured fields (`name`/`artist_name`/`album_name`) the hero parser yields.
 *
 * @param query - Search/filter params.
 * @returns Mapped CC tracks (possibly empty).
 * @throws Error on missing client id or API failure (see {@link jamendoFetch}).
 */
export async function searchCcTracks(query: CcTrackQuery): Promise<CcTrack[]> {
  const raw = await jamendoFetch<JamendoTrackRaw>("/tracks", {
    search: query.search,
    name: query.name,
    artist_name: query.artist_name,
    album_name: query.album_name,
    tags: query.tags,
    fuzzytags: query.fuzzytags,
    limit: query.limit,
    offset: query.offset,
  });
  return raw.map(mapJamendoTrack);
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `pnpm --filter @musiccloud/backend test:run src/services/cc/jamendo/__tests__/client.test.ts`
Expected: PASS — alle vier `searchCcTracks`-Tests grün.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/cc/jamendo/client.ts apps/backend/src/services/cc/jamendo/__tests__/client.test.ts
git commit -m "Feat: add Jamendo client searchCcTracks with track mapping"
```

---

## Task 4: `getCcTrack` + `getSimilarCcTracks` (TDD)

**Files:**
- Modify: `apps/backend/src/services/cc/jamendo/client.ts`
- Modify: `apps/backend/src/services/cc/jamendo/__tests__/client.test.ts`

`getCcTrack` holt einen einzelnen Track per `id`. `getSimilarCcTracks` nutzt `GET /tracks/similar?id=<seed>` und mappt dieselben Track-Objekte.

- [ ] **Step 1: Failing tests anhängen**

Ans Ende der Test-Datei (innerhalb derselben Datei, neue `describe`-Blöcke):

```typescript
describe("getCcTrack", () => {
  beforeEach(() => vi.stubEnv("JAMENDO_CLIENT_ID", "test_client_id"));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns the single mapped track for an id", async () => {
    mockJamendo({ headers: { status: "success", code: 0, results_count: 1 }, results: [SAMPLE_TRACK] });
    const track = await getCcTrack("1886393");
    expect(track?.jamendoId).toBe("1886393");
    expect(track?.streamUrl).toContain("trackid=1886393");
  });

  it("returns null when no track matches", async () => {
    mockJamendo({ headers: { status: "success", code: 0, results_count: 0 }, results: [] });
    const track = await getCcTrack("does-not-exist");
    expect(track).toBeNull();
  });
});

describe("getSimilarCcTracks", () => {
  beforeEach(() => vi.stubEnv("JAMENDO_CLIENT_ID", "test_client_id"));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("requests /tracks/similar with the seed id and maps results", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ headers: { status: "success", code: 0, results_count: 1 }, results: [SAMPLE_TRACK] }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const similar = await getSimilarCcTracks("1886393");

    expect(String(fetchMock.mock.calls[0][0])).toContain("/tracks/similar");
    expect(String(fetchMock.mock.calls[0][0])).toContain("id=1886393");
    expect(similar[0]?.jamendoId).toBe("1886393");
  });
});
```

Den Import-Zeilenkopf der Testdatei erweitern:
```typescript
import { getCcTrack, getSimilarCcTracks, searchCcTracks } from "../client.js";
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag bestätigen**

Run: `pnpm --filter @musiccloud/backend test:run src/services/cc/jamendo/__tests__/client.test.ts`
Expected: FAIL — `getCcTrack`/`getSimilarCcTracks` sind nicht exportiert.

- [ ] **Step 3: Implementierung anhängen**

Ans Ende von `client.ts`:

```typescript
/**
 * Fetches a single CC track by its Jamendo id.
 *
 * @param jamendoId - Jamendo track id.
 * @returns The mapped track, or null when none matches.
 * @throws Error on missing client id or API failure.
 */
export async function getCcTrack(jamendoId: string): Promise<CcTrack | null> {
  const raw = await jamendoFetch<JamendoTrackRaw>("/tracks", { id: jamendoId, limit: 1 });
  const first = raw[0];
  return first ? mapJamendoTrack(first) : null;
}

/**
 * Fetches tracks similar to a seed track via `GET /tracks/similar`.
 * Jamendo returns these ordered by descending similarity.
 *
 * @param seedJamendoId - Jamendo id of the seed track.
 * @param limit - Maximum number of similar tracks (default 12).
 * @returns Mapped similar tracks (possibly empty).
 * @throws Error on missing client id or API failure.
 */
export async function getSimilarCcTracks(seedJamendoId: string, limit = 12): Promise<CcTrack[]> {
  const raw = await jamendoFetch<JamendoTrackRaw>("/tracks/similar", { id: seedJamendoId, limit });
  return raw.map(mapJamendoTrack);
}
```

Im `jamendoFetch`-Param-Typ ist `id` bereits zulässig (`Record<string, string | number | undefined>`).

- [ ] **Step 4: Tests laufen lassen, Erfolg bestätigen**

Run: `pnpm --filter @musiccloud/backend test:run src/services/cc/jamendo/__tests__/client.test.ts`
Expected: PASS — alle Tests grün.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/cc/jamendo/client.ts apps/backend/src/services/cc/jamendo/__tests__/client.test.ts
git commit -m "Feat: add getCcTrack and getSimilarCcTracks to Jamendo client"
```

---

## Task 5: `getCcAlbum` + `getCcArtist` (TDD)

**Files:**
- Modify: `apps/backend/src/services/cc/jamendo/client.ts`
- Modify: `apps/backend/src/services/cc/jamendo/__tests__/client.test.ts`

- [ ] **Step 1: Failing tests anhängen**

Ans Ende der Test-Datei:

```typescript
import type { JamendoAlbumRaw, JamendoArtistRaw } from "../types.js";

const SAMPLE_ALBUM: JamendoAlbumRaw = {
  id: "176136",
  name: "Sample Album",
  artist_id: "338723",
  artist_name: "Sample Artist",
  image: "https://usercontent.jamendo.com/album.jpg",
  releasedate: "2020-05-01",
  zip: "https://prod-1.storage.jamendo.com/download/album/176136/mp32/",
  shareurl: "https://www.jamendo.com/album/176136",
};

const SAMPLE_ARTIST: JamendoArtistRaw = {
  id: "338723",
  name: "Sample Artist",
  website: "https://example.org",
  image: "https://usercontent.jamendo.com/artist.jpg",
  shareurl: "https://www.jamendo.com/artist/338723",
};

describe("getCcAlbum", () => {
  beforeEach(() => vi.stubEnv("JAMENDO_CLIENT_ID", "test_client_id"));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("maps a Jamendo album to a CcAlbum", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ headers: { status: "success", code: 0, results_count: 1 }, results: [SAMPLE_ALBUM] }),
      } as Response),
    );
    const album = await getCcAlbum("176136");
    expect(album).toMatchObject({ jamendoId: "176136", name: "Sample Album", jamendoArtistId: "338723", zipUrl: SAMPLE_ALBUM.zip });
  });
});

describe("getCcArtist", () => {
  beforeEach(() => vi.stubEnv("JAMENDO_CLIENT_ID", "test_client_id"));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("maps a Jamendo artist to a CcArtist", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ headers: { status: "success", code: 0, results_count: 1 }, results: [SAMPLE_ARTIST] }),
      } as Response),
    );
    const artist = await getCcArtist("338723");
    expect(artist).toMatchObject({ jamendoId: "338723", name: "Sample Artist", website: "https://example.org" });
  });
});
```

Test-Import-Kopf erweitern:
```typescript
import { getCcAlbum, getCcArtist, getCcTrack, getSimilarCcTracks, searchCcTracks } from "../client.js";
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag bestätigen**

Run: `pnpm --filter @musiccloud/backend test:run src/services/cc/jamendo/__tests__/client.test.ts`
Expected: FAIL — `getCcAlbum`/`getCcArtist` fehlen.

- [ ] **Step 3: Implementierung + Mapper anhängen**

In `client.ts` den Typ-Import erweitern:
```typescript
import type {
  CcAlbum,
  CcArtist,
  CcTrack,
  JamendoAlbumRaw,
  JamendoArtistRaw,
  JamendoEnvelope,
  JamendoTrackRaw,
} from "./types.js";
```

Ans Ende von `client.ts`:

```typescript
/**
 * Maps a raw Jamendo album to the CC domain shape.
 *
 * @param raw - Raw Jamendo album object.
 * @returns The mapped {@link CcAlbum}.
 */
export function mapJamendoAlbum(raw: JamendoAlbumRaw): CcAlbum {
  return {
    jamendoId: raw.id,
    name: raw.name,
    jamendoArtistId: raw.artist_id,
    artistName: raw.artist_name,
    artworkUrl: raw.image || undefined,
    releaseDate: raw.releasedate || undefined,
    zipUrl: raw.zip || undefined,
    shareUrl: raw.shareurl || undefined,
  };
}

/**
 * Maps a raw Jamendo artist to the CC domain shape.
 *
 * @param raw - Raw Jamendo artist object.
 * @returns The mapped {@link CcArtist}.
 */
export function mapJamendoArtist(raw: JamendoArtistRaw): CcArtist {
  return {
    jamendoId: raw.id,
    name: raw.name,
    website: raw.website || undefined,
    imageUrl: raw.image || undefined,
    shareUrl: raw.shareurl || undefined,
  };
}

/**
 * Fetches a single CC album by its Jamendo id.
 *
 * @param jamendoId - Jamendo album id.
 * @returns The mapped album, or null when none matches.
 * @throws Error on missing client id or API failure.
 */
export async function getCcAlbum(jamendoId: string): Promise<CcAlbum | null> {
  const raw = await jamendoFetch<JamendoAlbumRaw>("/albums", { id: jamendoId, limit: 1 });
  const first = raw[0];
  return first ? mapJamendoAlbum(first) : null;
}

/**
 * Fetches a single CC artist by its Jamendo id.
 *
 * @param jamendoId - Jamendo artist id.
 * @returns The mapped artist, or null when none matches.
 * @throws Error on missing client id or API failure.
 */
export async function getCcArtist(jamendoId: string): Promise<CcArtist | null> {
  const raw = await jamendoFetch<JamendoArtistRaw>("/artists", { id: jamendoId, limit: 1 });
  const first = raw[0];
  return first ? mapJamendoArtist(first) : null;
}
```

- [ ] **Step 4: Tests + Typecheck laufen lassen**

Run: `pnpm --filter @musiccloud/backend test:run src/services/cc/jamendo/__tests__/client.test.ts`
Expected: PASS — alle Tests grün.

Run: `pnpm --filter @musiccloud/backend typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/cc/jamendo/client.ts apps/backend/src/services/cc/jamendo/__tests__/client.test.ts
git commit -m "Feat: add getCcAlbum and getCcArtist to Jamendo client"
```

---

## Self-Review (vom Plan-Autor)

**Spec-Abdeckung (gegen `2026-06-20-creative-commons-pfad-jamendo-design.md`):**
- Datenmodell `cc_tracks`/`cc_albums`/`cc_artists`/`cc_short_urls` ohne `service_links`/`external_ids`/`previews`/ISRC → Task 1. ✓
- `cc_short_urls` eager + unique je Track → Schema in Task 1; eager-Erzeugung erfolgt bei der Persistierung (Plan 2). ✓ (Schema bereit)
- Jamendo-Adapter kapselt `/tracks`, `/tracks/similar`, `/albums`, `/artists` → Tasks 3–5. ✓
- `/artists/musicinfo` (mehrsprachige Bio) und Genre-Suche (`tags`/`fuzzytags` für die 3-Spalten-Discovery) → **bewusst Plan 2** (gehören zum Resolve-/Discovery-Flow, nicht zum Fundament). `searchCcTracks` akzeptiert `tags`/`fuzzytags` bereits.
- Trennung vom kommerziellen Pfad (eigenes Modul, kein Plugin-Registry) → File Structure + Task 3 Doc. ✓

**Platzhalter-Scan:** Kein „TBD"/„TODO"; jeder Code-Step enthält vollständigen Code; jeder Test-Step echten Testcode. ✓

**Typ-Konsistenz:** `CcTrack`/`CcAlbum`/`CcArtist` in Task 2 definiert, in Tasks 3–5 unverändert konsumiert. `jamendoFetch<T>` gibt `T[]` zurück; alle Aufrufer mappen das Array. `audiodownload_allowed: boolean` → `downloadAllowed: boolean` via `Boolean(...)`. Funktionsnamen über Tasks stabil (`searchCcTracks`, `getCcTrack`, `getSimilarCcTracks`, `getCcAlbum`, `getCcArtist`, `mapJamendo*`). ✓

**Offene Abhängigkeit:** `JAMENDO_CLIENT_ID` muss vor Task 3 gesetzt sein (Voraussetzungs-Block). Die Unit-Tests stubben die Env und `fetch` und brauchen daher **keinen** echten Key.

**Verifizierte Referenzen (am Plan-Write-Time):**
- pnpm-Scripts `db:generate`/`db:migrate`/`test`, pnpm@10.33.1 — `package.json`.
- `generateTrackId()`=nanoid(21), `generateShortId()`=nanoid(5) — `apps/backend/src/lib/short-id.ts`.
- Schema-Muster (`pgTable`, `text`/`integer`/`timestamp`/`jsonb`, `index`/`uniqueIndex`), letzte Migration `0042` — `apps/backend/src/db/schemas/postgres.ts`, Migrations-Ordner.
- Migration-Config (`schema`/`out`), Runner `scripts/migrate.mjs` (crasht bei Fehler) — `drizzle.config.postgres.ts`.
- Backend-Test `vitest`/`vitest run`, `pnpm --filter @musiccloud/backend test:run` — `apps/backend/package.json`.
- Jamendo-Felder `audio`/`audiodownload`/`audiodownload_allowed`/`license_ccurl`/`shareurl`/`waveform`/`image`/`album_image`/`name`/`artist_name`/`album_name`/`duration`(s)/`releasedate`, Params `search`/`name`/`artist_name`/`album_name`/`tags`/`fuzzytags`/`limit`(max 200)/`include`, `client_id` Pflicht, Envelope `{headers,results}` — web-verifiziert gegen <https://developer.jamendo.com/v3.0/tracks>.
