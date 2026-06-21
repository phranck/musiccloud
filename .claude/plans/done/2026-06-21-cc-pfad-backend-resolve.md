# CC-Pfad — Backend Resolve + Endpoint — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Einen vollständig getrennten CC-Track-Resolve bauen: eine eigene Fastify-Route `/api/v1/cc/resolve`, ein schlankes CC-Repository (Persistierung in die `cc_*`-Tabellen aus Plan 1), und ein CC-Resolve-Modul, das Freitext-/Structured-Queries über die Jamendo-Suche zu einer Trefferliste auflöst und die Auswahl persistiert.

**Architecture:** Spiegelt das kommerzielle Resolve-Muster strukturgleich, aber drastisch vereinfacht: kein Cross-Service, kein ISRC, keine Confidence/Disambiguation-Heuristik, keine Previews. Zwei-Leg-Fluss — (1) Query → `searchCcTracks` → Trefferliste als `ResolveDisambiguationResponse` (candidate-id kodiert `jamendo:<jamendoId>`); (2) `selectedCandidate` → `getCcTrack` → `persistCcTrack` (Transaktion mit `ON CONFLICT (jamendo_id)`-Upserts, eager `cc_short_urls`) → neue `cc-track`-Erfolgs-Shape. Der Jamendo-Client aus Plan 1 wird unverändert genutzt.

**Tech Stack:** Fastify, Drizzle/pg, vitest, nanoid, pnpm@10.33.1. NodeNext-ESM (`.js`-Importe auf `.ts`-Source). Lint = Biome — **alle Code-Blöcke hier sind bereits Biome-konform**; vor jedem Commit zusätzlich `pnpm exec biome check --write <files>` laufen lassen.

**Abgrenzung (NICHT in diesem Plan):** Genre-Discovery (Jamendo `tags`/`fuzzytags`, 3 Spalten), Album-/Artist-Resolve-Seiten, „Ähnliche Musik"-Endpoint (`/tracks/similar`), Künstler-Bio (`/artists/musicinfo`), die permanente Share-Page (`loadByShortId`-Pendant). Diese folgen als Plan 2b bzw. werden im Frontend-Plan angestoßen. Hinweis: Kein URL-Paste-Flow (Spec-Nicht-Ziel).

**Voraussetzung:** `JAMENDO_CLIENT_ID` wird für die Unit-Tests **nicht** gebraucht (sie stubben `fetch`/Env). Der Integrationstest in Task 3 braucht die lokale DB (`DATABASE_URL` in `apps/backend/.env.local`, Postgres lokal erreichbar — in Plan 1 verifiziert).

---

## File Structure

- **Modify:** `packages/shared/src/api.ts` — neue Wire-Typen `ApiCcTrack`, `CcResolveSuccessResponse` ans Ende des Resolve-Typen-Blocks anhängen.
- **Modify:** `packages/shared/src/endpoints.ts` — `ccResolve: "/api/v1/cc/resolve"` unter `v1` ergänzen.
- **Create:** `apps/backend/src/db/adapters/postgres-cc.ts` — freie Repository-Funktionen (`upsertCcArtist`, `upsertCcAlbum`, `persistCcTrack`, `findCcTrackByShortId`), je `(pool: Pool, …)`.
- **Modify:** `apps/backend/src/db/repository.ts` — Typen `PersistCcTrackData`, `CcTrackRecord` + Interface `CcRepository`.
- **Modify:** `apps/backend/src/db/adapters/postgres.ts` — Delegationsmethoden auf `PostgresAdapter`, `implements … CcRepository`.
- **Modify:** `apps/backend/src/db/index.ts` — `getCcRepository(): Promise<CcRepository>`.
- **Create:** `apps/backend/src/services/cc/cc-resolver.ts` — `resolveCcTextSearch`, `resolveCcSelectedCandidate`, candidate-id-Helfer.
- **Create:** `apps/backend/src/routes/cc-resolve.ts` — Fastify-Plugin `ccResolveRoutes` + Handler + `persistCcTrackAndRespond`.
- **Modify:** `apps/backend/src/server.ts` — `ccResolveRoutes` im `protectedRoutes`-Scope registrieren.
- **Tests:** `apps/backend/src/services/cc/__tests__/cc-resolver.test.ts`, `apps/backend/src/db/adapters/__tests__/postgres-cc.integration.test.ts`.

---

## Task 1: CC-Wire-Typen + Endpoint-String

**Files:**
- Modify: `packages/shared/src/api.ts`
- Modify: `packages/shared/src/endpoints.ts`

- [ ] **Step 1: Wire-Typen anhängen** — direkt nach `UnifiedResolveSuccessResponse` (nach `packages/shared/src/api.ts:192`) einfügen:

```typescript
// ─── Creative-Commons (Jamendo) Resolve Types ─────────────────────────────────

/**
 * A Creative-Commons track on the wire. Unlike {@link ApiTrack} it carries no
 * cross-service links; instead it exposes the full permanent stream, the exact
 * CC licence, the optional download, and the waveform peaks the CC player needs.
 */
export interface ApiCcTrack {
  jamendoId: string;
  title: string;
  artistName: string;
  albumName?: string;
  artworkUrl?: string;
  durationMs?: number;
  releaseDate?: string;
  /** Exact CC licence URL (e.g. `.../licenses/by-nc-nd/3.0/`). */
  licenseCcurl?: string;
  /** Permanent full-track stream URL. */
  streamUrl: string;
  downloadUrl?: string;
  downloadAllowed: boolean;
  /** Escaped JSON string `{"peaks":[…]}` for the waveform scrubber. */
  waveform?: string;
  /** Canonical Jamendo page for the track. */
  shareUrl?: string;
}

/**
 * Success payload of the CC resolve route after a candidate was picked.
 * Discriminated by `type: "cc-track"`, mirroring the commercial
 * {@link UnifiedResolveSuccessResponse} shape (`id` + `shortUrl` + entity).
 */
export interface CcResolveSuccessResponse {
  type: "cc-track";
  id: string;
  shortUrl: string;
  track: ApiCcTrack;
}
```

- [ ] **Step 2: Endpoint-String ergänzen** — in `packages/shared/src/endpoints.ts` unter dem `v1`-Objekt, direkt nach der `resolve: "/api/v1/resolve",`-Zeile (`:48`), einfügen:

```typescript
    ccResolve: "/api/v1/cc/resolve",
```

- [ ] **Step 3: Shared-Paket bauen + Typecheck** — die Typen leben im Workspace-Paket `@musiccloud/shared`, das gebaut werden muss, damit Backend/Frontend sie sehen:

Run: `pnpm --filter @musiccloud/shared build && pnpm --filter @musiccloud/backend typecheck`
Expected: beide PASS.

- [ ] **Step 4: Biome + Commit**

```bash
pnpm exec biome check --write packages/shared/src/api.ts packages/shared/src/endpoints.ts
git add packages/shared/src/api.ts packages/shared/src/endpoints.ts
git commit -m "Feat: add CC resolve wire types and endpoint"
```

---

## Task 2: CC-Repository (`postgres-cc.ts` + Wiring)

**Files:**
- Create: `apps/backend/src/db/adapters/postgres-cc.ts`
- Modify: `apps/backend/src/db/repository.ts`
- Modify: `apps/backend/src/db/adapters/postgres.ts`
- Modify: `apps/backend/src/db/index.ts`

Spiegelt das kommerzielle Persist-Muster (`postgres-tracks.ts:355` `persistTrackWithLinks`: `pool.connect()` → `BEGIN` → … → `COMMIT`/`ROLLBACK`/`release`), aber stark vereinfacht: dedup über den Unique-Key `jamendo_id` per `ON CONFLICT … DO UPDATE … RETURNING id` statt manuellem Lookup, keine `service_links`/`external_ids`/`previews`/`credits`, und `cc_short_urls` **eager** (immer, idempotent via `ON CONFLICT (cc_track_id) DO NOTHING` + Nachlese-SELECT).

- [ ] **Step 1: Repository-Typen** — in `apps/backend/src/db/repository.ts` am Ende anhängen (die Datei exportiert bereits `PersistTrackData` etc. im selben Stil):

```typescript
// ─── Creative-Commons Repository Types ────────────────────────────────────────

/** Data needed to persist a resolved CC track (artist + optional album inline). */
export interface PersistCcTrackData {
  jamendoId: string;
  title: string;
  artistName: string;
  jamendoArtistId: string;
  artistImageUrl?: string;
  artistWebsite?: string;
  artistShareUrl?: string;
  albumName?: string;
  jamendoAlbumId?: string;
  albumArtworkUrl?: string;
  albumReleaseDate?: string;
  albumZipUrl?: string;
  albumShareUrl?: string;
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

/** Read shape returned by CC short-id lookups (single row, no link fan-out). */
export interface CcTrackRecord {
  ccTrackId: string;
  shortId: string;
  jamendoId: string;
  title: string;
  artistName: string;
  albumName: string | null;
  artworkUrl: string | null;
  durationMs: number | null;
  releaseDate: string | null;
  licenseCcurl: string | null;
  streamUrl: string;
  downloadUrl: string | null;
  downloadAllowed: boolean;
  waveform: string | null;
  shareUrl: string | null;
}

/** CC persistence + lookups, kept separate from the commercial TrackRepository. */
export interface CcRepository {
  persistCcTrack(data: PersistCcTrackData): Promise<{ ccTrackId: string; shortId: string }>;
  findCcTrackByShortId(shortId: string): Promise<CcTrackRecord | null>;
}
```

- [ ] **Step 2: Repository-Adapter-Funktionen** — neue Datei `apps/backend/src/db/adapters/postgres-cc.ts`:

```typescript
/**
 * Creative-Commons (Jamendo) persistence. Mirrors the commercial track
 * persistence shape but drastically slimmer: a single source (Jamendo), dedup
 * via the `jamendo_id` unique key, no service-links / external-ids / previews /
 * credits, and an eagerly-created canonical short URL per track.
 */

import type { Pool, PoolClient } from "pg";
import { generateShortId, generateTrackId } from "../../lib/short-id.js";
import type { CcTrackRecord, PersistCcTrackData } from "../repository.js";

/**
 * Upserts a CC artist by its Jamendo id and returns the internal id.
 * Idempotent: `ON CONFLICT (jamendo_id)` keeps the existing internal id.
 *
 * @param client - Active transaction client.
 * @param data - Artist fields.
 * @param now - Shared transaction timestamp.
 * @returns The internal `cc_artists.id`.
 */
async function upsertCcArtist(
  client: PoolClient,
  data: { jamendoId: string; name: string; imageUrl?: string; website?: string; shareUrl?: string },
  now: Date,
): Promise<string> {
  const result = await client.query(
    `INSERT INTO cc_artists (id, jamendo_id, name, image_url, website, share_url, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
     ON CONFLICT (jamendo_id) DO UPDATE SET
       name = EXCLUDED.name,
       image_url = EXCLUDED.image_url,
       website = EXCLUDED.website,
       share_url = EXCLUDED.share_url,
       updated_at = EXCLUDED.updated_at
     RETURNING id`,
    [generateTrackId(), data.jamendoId, data.name, data.imageUrl ?? null, data.website ?? null, data.shareUrl ?? null, now],
  );
  return result.rows[0].id as string;
}

/**
 * Upserts a CC album by its Jamendo id and returns the internal id.
 *
 * @param client - Active transaction client.
 * @param data - Album fields (with the resolved internal artist id).
 * @param now - Shared transaction timestamp.
 * @returns The internal `cc_albums.id`.
 */
async function upsertCcAlbum(
  client: PoolClient,
  data: {
    jamendoId: string;
    name: string;
    ccArtistId: string;
    artworkUrl?: string;
    releaseDate?: string;
    zipUrl?: string;
    shareUrl?: string;
  },
  now: Date,
): Promise<string> {
  const result = await client.query(
    `INSERT INTO cc_albums (id, jamendo_id, name, cc_artist_id, artwork_url, release_date, zip_url, share_url, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
     ON CONFLICT (jamendo_id) DO UPDATE SET
       name = EXCLUDED.name,
       cc_artist_id = EXCLUDED.cc_artist_id,
       artwork_url = EXCLUDED.artwork_url,
       release_date = EXCLUDED.release_date,
       zip_url = EXCLUDED.zip_url,
       share_url = EXCLUDED.share_url,
       updated_at = EXCLUDED.updated_at
     RETURNING id`,
    [
      generateTrackId(),
      data.jamendoId,
      data.name,
      data.ccArtistId,
      data.artworkUrl ?? null,
      data.releaseDate ?? null,
      data.zipUrl ?? null,
      data.shareUrl ?? null,
      now,
    ],
  );
  return result.rows[0].id as string;
}

/**
 * Transactionally persists a CC track, its artist and optional album, and
 * eagerly mints a canonical short URL. Dedup is by `jamendo_id` on every
 * entity, so re-resolving the same track keeps all internal ids and the same
 * stable short code.
 *
 * @param pool - Postgres pool.
 * @param data - Flattened track + artist + album payload.
 * @returns The internal `cc_tracks.id` and the canonical short code.
 * @throws Query errors propagate after rollback.
 */
export async function persistCcTrack(
  pool: Pool,
  data: PersistCcTrackData,
): Promise<{ ccTrackId: string; shortId: string }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const now = new Date();

    const ccArtistId = await upsertCcArtist(
      client,
      {
        jamendoId: data.jamendoArtistId,
        name: data.artistName,
        imageUrl: data.artistImageUrl,
        website: data.artistWebsite,
        shareUrl: data.artistShareUrl,
      },
      now,
    );

    let ccAlbumId: string | null = null;
    if (data.jamendoAlbumId && data.albumName) {
      ccAlbumId = await upsertCcAlbum(
        client,
        {
          jamendoId: data.jamendoAlbumId,
          name: data.albumName,
          ccArtistId,
          artworkUrl: data.albumArtworkUrl,
          releaseDate: data.albumReleaseDate,
          zipUrl: data.albumZipUrl,
          shareUrl: data.albumShareUrl,
        },
        now,
      );
    }

    const trackResult = await client.query(
      `INSERT INTO cc_tracks (
        id, jamendo_id, title, artist_name, cc_artist_id, album_name, cc_album_id,
        artwork_url, duration_ms, release_date, license_ccurl, stream_url,
        download_url, download_allowed, waveform, share_url, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17)
      ON CONFLICT (jamendo_id) DO UPDATE SET
        title = EXCLUDED.title,
        artist_name = EXCLUDED.artist_name,
        cc_artist_id = EXCLUDED.cc_artist_id,
        album_name = EXCLUDED.album_name,
        cc_album_id = EXCLUDED.cc_album_id,
        artwork_url = EXCLUDED.artwork_url,
        duration_ms = EXCLUDED.duration_ms,
        release_date = EXCLUDED.release_date,
        license_ccurl = EXCLUDED.license_ccurl,
        stream_url = EXCLUDED.stream_url,
        download_url = EXCLUDED.download_url,
        download_allowed = EXCLUDED.download_allowed,
        waveform = EXCLUDED.waveform,
        share_url = EXCLUDED.share_url,
        updated_at = EXCLUDED.updated_at
      RETURNING id`,
      [
        generateTrackId(),
        data.jamendoId,
        data.title,
        data.artistName,
        ccArtistId,
        data.albumName ?? null,
        ccAlbumId,
        data.artworkUrl ?? null,
        data.durationMs ?? null,
        data.releaseDate ?? null,
        data.licenseCcurl ?? null,
        data.streamUrl,
        data.downloadUrl ?? null,
        data.downloadAllowed ? 1 : 0,
        data.waveform ?? null,
        data.shareUrl ?? null,
        now,
      ],
    );
    const ccTrackId = trackResult.rows[0].id as string;

    // Eager, idempotent short URL: always attempt insert; conflict keeps the
    // existing canonical code, then read it back so the stable token never
    // changes across re-resolves.
    await client.query(
      `INSERT INTO cc_short_urls (id, cc_track_id, created_at) VALUES ($1, $2, $3)
       ON CONFLICT (cc_track_id) DO NOTHING`,
      [generateShortId(), ccTrackId, now],
    );
    const shortResult = await client.query(`SELECT id FROM cc_short_urls WHERE cc_track_id = $1`, [ccTrackId]);
    const shortId = shortResult.rows[0].id as string;

    await client.query("COMMIT");
    return { ccTrackId, shortId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Loads a CC track by its public short id (single row, no link fan-out).
 *
 * @param pool - Postgres pool.
 * @param shortId - Public short code from `cc_short_urls`.
 * @returns The CC track record, or null when no track matches.
 */
export async function findCcTrackByShortId(pool: Pool, shortId: string): Promise<CcTrackRecord | null> {
  const result = await pool.query(
    `SELECT
       t.id AS cc_track_id, su.id AS short_id, t.jamendo_id, t.title, t.artist_name,
       t.album_name, t.artwork_url, t.duration_ms, t.release_date, t.license_ccurl,
       t.stream_url, t.download_url, t.download_allowed, t.waveform, t.share_url
     FROM cc_tracks t
     JOIN cc_short_urls su ON su.cc_track_id = t.id
     WHERE su.id = $1`,
    [shortId],
  );
  if (result.rows.length === 0) return null;
  const r = result.rows[0];
  return {
    ccTrackId: r.cc_track_id,
    shortId: r.short_id,
    jamendoId: r.jamendo_id,
    title: r.title,
    artistName: r.artist_name,
    albumName: r.album_name,
    artworkUrl: r.artwork_url,
    durationMs: r.duration_ms,
    releaseDate: r.release_date,
    licenseCcurl: r.license_ccurl,
    streamUrl: r.stream_url,
    downloadUrl: r.download_url,
    downloadAllowed: r.download_allowed === 1,
    waveform: r.waveform,
    shareUrl: r.share_url,
  };
}
```

- [ ] **Step 3: Adapter-Wiring** — `apps/backend/src/db/adapters/postgres.ts` lesen, dann:
  1. Import oben ergänzen (bei den anderen Adapter-Importen):
     ```typescript
     import { findCcTrackByShortId as ccFindByShortId, persistCcTrack as ccPersistTrack } from "./postgres-cc.js";
     ```
  2. `CcRepository` zur `class PostgresAdapter implements …`-Liste hinzufügen (Import des Typs aus `../repository.js` ergänzen).
  3. Delegationsmethoden in die Klasse aufnehmen (Muster wie `persistTrackWithLinks` bei `postgres.ts:315`):
     ```typescript
     persistCcTrack(data: PersistCcTrackData): Promise<{ ccTrackId: string; shortId: string }> {
       return ccPersistTrack(this.pool, data);
     }

     findCcTrackByShortId(shortId: string): Promise<CcTrackRecord | null> {
       return ccFindByShortId(this.pool, shortId);
     }
     ```
     (Typen `PersistCcTrackData`, `CcTrackRecord`, `CcRepository` aus `../repository.js` importieren.)

- [ ] **Step 4: `getCcRepository`** — `apps/backend/src/db/index.ts` lesen, dann `getCcRepository(): Promise<CcRepository>` analog zu `getRepository()` (`db/index.ts:11`) exportieren. Es liefert dasselbe Singleton, getypt als `CcRepository`:
  ```typescript
  export async function getCcRepository(): Promise<CcRepository> {
    return (await getRepository()) as unknown as CcRepository;
  }
  ```
  (`CcRepository` aus `./repository.js` importieren. Falls `getRepository()` intern den konkreten `PostgresAdapter` baut, kann statt des Casts direkt der Adapter zurückgegeben werden — der Implementer wählt die saubere Variante nach Lektüre der Datei.)

- [ ] **Step 5: Integrationstest** — `apps/backend/src/db/adapters/__tests__/postgres-cc.integration.test.ts`. Modelliere ihn nach einem bestehenden `*.integration.test.ts` (z. B. `apps/backend/src/__tests__/external-ids-repo.integration.test.ts`) für DB-Setup/Teardown. Mindest-Assertions:
  - `persistCcTrack` legt Track + Artist + Album + Short-URL an; Rückgabe `{ ccTrackId, shortId }` mit nicht-leerem `shortId`.
  - Zweiter `persistCcTrack`-Aufruf mit **demselben** `jamendoId` liefert **denselben** `ccTrackId` UND **denselben** `shortId` (Idempotenz des stabilen Tokens).
  - `findCcTrackByShortId(shortId)` liefert den Track mit `downloadAllowed` als Boolean und korrektem `streamUrl`.

  Run: `pnpm --filter @musiccloud/backend test:run src/db/adapters/__tests__/postgres-cc.integration.test.ts`
  Expected: PASS (braucht lokale DB; `DATABASE_URL` aus `apps/backend/.env.local` laden wie in Plan 1).

- [ ] **Step 6: Typecheck + Biome + Commit**

```bash
pnpm --filter @musiccloud/backend typecheck
pnpm exec biome check --write apps/backend/src/db
git add apps/backend/src/db
git commit -m "Feat: add slim CC repository (persistCcTrack, findCcTrackByShortId)"
```

---

## Task 3: CC-Resolve-Modul

**Files:**
- Create: `apps/backend/src/services/cc/cc-resolver.ts`
- Test: `apps/backend/src/services/cc/__tests__/cc-resolver.test.ts`

Zwei-Leg. LEG 1 (`resolveCcTextSearch`) nutzt — wie der kommerzielle Pfad (DRY) — `parseStructuredSearchQuery` für `title:/artist:/album:`-Queries und sonst Freitext, ruft `searchCcTracks`, und gibt IMMER eine Trefferliste (`ApiDisambiguationCandidate[]`) mit candidate-id `jamendo:<jamendoId>`. LEG 2 (`resolveCcSelectedCandidate`) parst die id zurück und ruft `getCcTrack`.

- [ ] **Step 1: Failing test** — `apps/backend/src/services/cc/__tests__/cc-resolver.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import * as client from "../jamendo/client.js";
import { ccCandidateId, parseCcCandidateId, resolveCcSelectedCandidate, resolveCcTextSearch } from "../cc-resolver.js";
import type { CcTrack } from "../jamendo/types.js";

const TRACK: CcTrack = {
  jamendoId: "1886393",
  title: "Sample Title",
  artistName: "Sample Artist",
  jamendoArtistId: "338723",
  albumName: "Sample Album",
  jamendoAlbumId: "176136",
  artworkUrl: "https://usercontent.jamendo.com/track.jpg",
  durationMs: 180000,
  licenseCcurl: "http://creativecommons.org/licenses/by-nc-nd/3.0/",
  streamUrl: "https://prod-1.storage.jamendo.com/?trackid=1886393&format=mp31",
  downloadAllowed: true,
  shareUrl: "https://www.jamendo.com/track/1886393",
};

afterEach(() => vi.restoreAllMocks());

describe("ccCandidateId / parseCcCandidateId", () => {
  it("round-trips a jamendo id", () => {
    expect(ccCandidateId("1886393")).toBe("jamendo:1886393");
    expect(parseCcCandidateId("jamendo:1886393")).toBe("1886393");
  });
  it("returns null for a non-cc candidate id", () => {
    expect(parseCcCandidateId("spotify:abc")).toBeNull();
  });
});

describe("resolveCcTextSearch", () => {
  it("maps free-text search hits to disambiguation candidates", async () => {
    vi.spyOn(client, "searchCcTracks").mockResolvedValue([TRACK]);
    const result = await resolveCcTextSearch("sample");
    expect(client.searchCcTracks).toHaveBeenCalledWith(expect.objectContaining({ search: "sample" }));
    expect(result.candidates).toEqual([
      {
        id: "jamendo:1886393",
        title: "Sample Title",
        artists: ["Sample Artist"],
        albumName: "Sample Album",
        artworkUrl: "https://usercontent.jamendo.com/track.jpg",
      },
    ]);
  });

  it("routes a structured query through the structured fields", async () => {
    const spy = vi.spyOn(client, "searchCcTracks").mockResolvedValue([]);
    await resolveCcTextSearch("title: Enjoy The Silence, artist: Depeche Mode");
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Enjoy The Silence", artist_name: "Depeche Mode" }),
    );
  });
});

describe("resolveCcSelectedCandidate", () => {
  it("resolves the selected candidate to a full CcTrack", async () => {
    vi.spyOn(client, "getCcTrack").mockResolvedValue(TRACK);
    const track = await resolveCcSelectedCandidate("jamendo:1886393");
    expect(client.getCcTrack).toHaveBeenCalledWith("1886393");
    expect(track?.jamendoId).toBe("1886393");
  });

  it("throws on a non-cc candidate id", async () => {
    await expect(resolveCcSelectedCandidate("spotify:abc")).rejects.toThrow(/candidate/i);
  });
});
```

- [ ] **Step 2: Run test, confirm FAIL** (`cc-resolver.ts` fehlt).
Run: `pnpm --filter @musiccloud/backend test:run src/services/cc/__tests__/cc-resolver.test.ts`

- [ ] **Step 3: Implementation** — `apps/backend/src/services/cc/cc-resolver.ts`:

```typescript
/**
 * CC resolve orchestration. Deliberately separate from the commercial
 * `services/resolver.ts` (SRP): a two-leg flow with no cross-service, no ISRC,
 * no confidence heuristics. Leg 1 turns a query into a hit list; leg 2 turns a
 * picked candidate into a full track.
 */

import type { ApiDisambiguationCandidate } from "@musiccloud/shared";
import {
  isStructuredSearchQuery,
  parseStructuredSearchQuery,
} from "../structured-search/index.js";
import { getCcTrack, searchCcTracks, type CcTrackQuery } from "./jamendo/client.js";
import type { CcTrack } from "./jamendo/types.js";

/** Candidate-id prefix that marks a CC (Jamendo) candidate. */
const CC_CANDIDATE_PREFIX = "jamendo:";

/** Maximum hit-list size returned to the client. */
const CC_CANDIDATE_LIMIT = 10;

/**
 * Builds the opaque candidate id the client sends back as `selectedCandidate`.
 *
 * @param jamendoId - Jamendo track id.
 * @returns `jamendo:<jamendoId>`.
 */
export function ccCandidateId(jamendoId: string): string {
  return `${CC_CANDIDATE_PREFIX}${jamendoId}`;
}

/**
 * Extracts the Jamendo id from a CC candidate id.
 *
 * @param candidateId - Candidate id from a prior disambiguation round.
 * @returns The Jamendo id, or null when the id is not a CC candidate.
 */
export function parseCcCandidateId(candidateId: string): string | null {
  return candidateId.startsWith(CC_CANDIDATE_PREFIX)
    ? candidateId.slice(CC_CANDIDATE_PREFIX.length)
    : null;
}

/**
 * Maps a CC track to a disambiguation candidate row.
 *
 * @param track - A resolved CC track.
 * @returns The wire-format candidate.
 */
function toCcCandidate(track: CcTrack): ApiDisambiguationCandidate {
  return {
    id: ccCandidateId(track.jamendoId),
    title: track.title,
    artists: [track.artistName],
    albumName: track.albumName,
    artworkUrl: track.artworkUrl,
  };
}

/**
 * Leg 1: resolves a free-text or structured (`title:`/`artist:`/`album:`) query
 * to a CC hit list. Reuses `parseStructuredSearchQuery` (DRY) for the structured
 * case. Always returns a candidate list (possibly empty) — the CC path never
 * auto-resolves a single hit, the user always picks.
 *
 * @param query - Raw query string.
 * @returns The disambiguation candidate list.
 */
export async function resolveCcTextSearch(query: string): Promise<{ candidates: ApiDisambiguationCandidate[] }> {
  let jamendoQuery: CcTrackQuery;
  if (isStructuredSearchQuery(query)) {
    const parsed = parseStructuredSearchQuery(query);
    jamendoQuery = {
      name: parsed.search.title,
      artist_name: parsed.search.artist,
      album_name: parsed.search.album,
      limit: parsed.candidateLimit ?? CC_CANDIDATE_LIMIT,
    };
  } else {
    jamendoQuery = { search: query, limit: CC_CANDIDATE_LIMIT };
  }
  const tracks = await searchCcTracks(jamendoQuery);
  return { candidates: tracks.map(toCcCandidate) };
}

/**
 * Leg 2: resolves a picked CC candidate id to its full track.
 *
 * @param candidateId - `jamendo:<id>` candidate id from leg 1.
 * @returns The full CC track, or null when Jamendo has no such track.
 * @throws Error when the candidate id is not a CC candidate.
 */
export async function resolveCcSelectedCandidate(candidateId: string): Promise<CcTrack | null> {
  const jamendoId = parseCcCandidateId(candidateId);
  if (!jamendoId) {
    throw new Error(`Not a CC candidate id: ${candidateId}`);
  }
  return getCcTrack(jamendoId);
}
```

> **Hinweis zu `parseStructuredSearchQuery`:** Es liefert `{ search: SearchQuery, candidateLimit?, warnings }`. Die Felder `search.title`/`search.artist`/`search.album` sind optional. Der Implementer verifiziert die genaue `SearchQuery`-Form in `apps/backend/src/services/structured-search/` und passt die Feldzugriffe exakt an (z. B. falls die Felder anders heißen). Der Import `type { CcTrackQuery }` kommt aus `./jamendo/client.js` (dort in Plan 1 exportiert).

- [ ] **Step 4: Run test, confirm PASS.**

- [ ] **Step 5: Biome + Commit**

```bash
pnpm exec biome check --write apps/backend/src/services/cc
git add apps/backend/src/services/cc/cc-resolver.ts apps/backend/src/services/cc/__tests__/cc-resolver.test.ts
git commit -m "Feat: add CC resolve module (two-leg text-search + candidate)"
```

---

## Task 4: CC-Route + Registrierung

**Files:**
- Create: `apps/backend/src/routes/cc-resolve.ts`
- Modify: `apps/backend/src/server.ts`
- Test: erweitert `apps/backend/src/services/cc/__tests__/cc-resolver.test.ts` ist Unit; die Route wird über den bestehenden Backend-Integrationspfad mit abgedeckt — hier genügt ein schlanker Handler-Smoke (siehe Step 4).

Spiegelt `routes/resolve.ts` strukturgleich, aber nur mit den zwei CC-Flows (Freitext/Structured → Disambiguation; `selectedCandidate` → persistierter `cc-track`).

- [ ] **Step 1: Route-Plugin** — `apps/backend/src/routes/cc-resolve.ts`:

```typescript
/**
 * POST `/api/v1/cc/resolve` — Creative-Commons resolve endpoint.
 *
 * Registered inside the same `authenticatePublic` scope as the commercial
 * resolve route. Two flows only:
 *  - `query` (free text or `title:`/`artist:`/`album:`) → disambiguation list.
 *  - `selectedCandidate` (`jamendo:<id>`) → resolve + persist → `cc-track`.
 * No URL-paste, no genre, no cross-service (those are separate / out of scope).
 */

import type {
  ApiCcTrack,
  CcResolveSuccessResponse,
  ResolveDisambiguationResponse,
  ResolveErrorResponse,
} from "@musiccloud/shared";
import { ENDPOINTS, formatUserMessage, getErrorEntry } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { getCcRepository } from "../db/index.js";
import { requireEnvList } from "../lib/env.js";
import { log } from "../lib/infra/logger.js";
import { sendRateLimitError } from "../lib/infra/rate-limit-response.js";
import { apiRateLimiter } from "../lib/infra/rate-limiter.js";
import { resolveCcSelectedCandidate, resolveCcTextSearch } from "../services/cc/cc-resolver.js";
import type { CcTrack } from "../services/cc/jamendo/types.js";

const ALLOWED_ORIGINS = requireEnvList("ALLOWED_ORIGINS");

export default async function ccResolveRoutes(app: FastifyInstance) {
  app.post(
    ENDPOINTS.v1.ccResolve,
    {
      schema: {
        tags: ["Resolve"],
        summary: "Resolve a Creative-Commons free-text or structured query (Jamendo)",
        security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
        body: {
          type: "object",
          description: "Exactly one of `query` or `selectedCandidate` must be present.",
          properties: {
            query: { type: "string", minLength: 1, maxLength: 500 },
            selectedCandidate: { type: "string", minLength: 1, maxLength: 200 },
          },
          anyOf: [{ required: ["query"] }, { required: ["selectedCandidate"] }],
          additionalProperties: false,
        },
        response: {
          200: {
            description: "A CC disambiguation list or a resolved cc-track.",
            oneOf: [
              { $ref: "ResolveDisambiguation#" },
              {
                type: "object",
                additionalProperties: true,
                description: "Resolved cc-track success payload.",
              },
            ],
          },
          400: { description: "Malformed body or candidate id.", $ref: "ErrorResponse#" },
          401: { description: "Missing or invalid API key / bearer token.", $ref: "ErrorResponse#" },
          404: { description: "The selected candidate could not be resolved.", $ref: "ErrorResponse#" },
          429: { description: "Rate limit exceeded for this client IP.", $ref: "ErrorResponse#" },
          500: { description: "Unexpected server error.", $ref: "ErrorResponse#" },
        },
      },
    },
    async (request, reply) => {
      const rateLimit = apiRateLimiter.check(request.ip);
      if (rateLimit.limited) {
        return sendRateLimitError(reply, rateLimit);
      }

      const body = request.body as { query?: string; selectedCandidate?: string };
      const query = body.query?.trim();
      const selectedCandidate = body.selectedCandidate?.trim();

      if (!query && !selectedCandidate) {
        return reply.status(400).send(ccError("INVALID_URL", "The 'query' or 'selectedCandidate' field is required."));
      }

      try {
        const origin = getOrigin(request.headers.origin);

        if (selectedCandidate) {
          const track = await resolveCcSelectedCandidate(selectedCandidate);
          if (!track) {
            return reply.status(404).send(ccError("TRACK_NOT_FOUND"));
          }
          return reply.send(await persistCcTrackAndRespond(track, origin));
        }

        const { candidates } = await resolveCcTextSearch(query!);
        const disambiguation: ResolveDisambiguationResponse = { status: "disambiguation", candidates };
        return reply.send(disambiguation);
      } catch (error) {
        log.error("CcResolve", "Unexpected error:", error instanceof Error ? error.message : "Unknown error");
        if (process.env.NODE_ENV !== "production" && error instanceof Error) {
          log.error("CcResolve", "Stack:", error.stack);
        }
        return reply.status(500).send(ccError("NETWORK_ERROR"));
      }
    },
  );
}

/**
 * Picks a whitelisted origin for the minted short URL.
 *
 * @param headerOrigin - raw `Origin` header.
 * @returns a whitelisted origin string.
 */
function getOrigin(headerOrigin?: string): string {
  if (headerOrigin && ALLOWED_ORIGINS.includes(headerOrigin)) {
    return headerOrigin;
  }
  return ALLOWED_ORIGINS[0];
}

/**
 * Builds the wire-format error payload (same shape as the commercial route).
 *
 * @param code - error code from the shared table.
 * @param overrideMessage - optional message override.
 * @returns the error response body.
 */
function ccError(code: string, overrideMessage?: string): ResolveErrorResponse {
  const entry = getErrorEntry(code);
  return { error: entry.code, message: formatUserMessage(entry.code, undefined, overrideMessage) };
}

/**
 * Persists a resolved CC track and shapes the `cc-track` success response.
 *
 * @param track - the resolved CC track.
 * @param origin - validated origin for the short URL.
 * @returns the cc-track success payload.
 */
async function persistCcTrackAndRespond(track: CcTrack, origin: string): Promise<CcResolveSuccessResponse> {
  const repo = await getCcRepository();
  const { ccTrackId, shortId } = await repo.persistCcTrack({
    jamendoId: track.jamendoId,
    title: track.title,
    artistName: track.artistName,
    jamendoArtistId: track.jamendoArtistId,
    albumName: track.albumName,
    jamendoAlbumId: track.jamendoAlbumId,
    artworkUrl: track.artworkUrl,
    durationMs: track.durationMs,
    releaseDate: track.releaseDate,
    licenseCcurl: track.licenseCcurl,
    streamUrl: track.streamUrl,
    downloadUrl: track.downloadUrl,
    downloadAllowed: track.downloadAllowed,
    waveform: track.waveform,
    shareUrl: track.shareUrl,
  });

  const apiTrack: ApiCcTrack = {
    jamendoId: track.jamendoId,
    title: track.title,
    artistName: track.artistName,
    albumName: track.albumName,
    artworkUrl: track.artworkUrl,
    durationMs: track.durationMs,
    releaseDate: track.releaseDate,
    licenseCcurl: track.licenseCcurl,
    streamUrl: track.streamUrl,
    downloadUrl: track.downloadUrl,
    downloadAllowed: track.downloadAllowed,
    waveform: track.waveform,
    shareUrl: track.shareUrl,
  };

  return { type: "cc-track", id: ccTrackId, shortUrl: `${origin}/${shortId}`, track: apiTrack };
}
```

> **Hinweis Fehler-Codes:** `TRACK_NOT_FOUND`/`INVALID_URL`/`NETWORK_ERROR` sind im kommerziellen Pfad belegt (`routes/resolve.ts` nutzt `jsonError("INVALID_URL"|"NETWORK_ERROR")`, `getErrorEntry` löst Legacy- und MC-Codes). Der Implementer verifiziert in `@musiccloud/shared` (`error-codes`), dass `TRACK_NOT_FOUND` existiert; falls nicht, den dort vorhandenen „not found"-Code verwenden.

- [ ] **Step 2: Registrierung** — `apps/backend/src/server.ts` lesen, dann:
  1. Import bei den anderen Route-Importen (`server.ts:36`-Bereich): `import ccResolveRoutes from "./routes/cc-resolve.js";`
  2. Im `protectedRoutes`-Scope (`server.ts:440-445`), neben `await protectedApp.register(resolveRoutes);`, ergänzen: `await protectedApp.register(ccResolveRoutes);`

- [ ] **Step 3: Typecheck.** Run: `pnpm --filter @musiccloud/backend typecheck` → PASS.

- [ ] **Step 4: Smoke-Test der Route-Verdrahtung** — sicherstellen, dass das Backend mit der neuen Route startet (keine Schema-/Registrierungs-Fehler). Da `requireEnvList("ALLOWED_ORIGINS")` beim Modul-Load greift, genügt der Build + ein Boot-Check:
  Run: `pnpm --filter @musiccloud/backend build` → PASS (tsup baut die Route mit).
  Optional (mit lokaler Env): Backend kurz starten (`./app start` bzw. `pnpm dev:backend`) und prüfen, dass es ohne Fehler hochkommt und `/api/v1/cc/resolve` in der Route-Liste erscheint.

- [ ] **Step 5: Volle Backend-Gates + Biome + Commit**

```bash
pnpm --filter @musiccloud/backend test:run
pnpm exec biome check --write apps/backend/src/routes apps/backend/src/server.ts
git add apps/backend/src/routes/cc-resolve.ts apps/backend/src/server.ts
git commit -m "Feat: add CC resolve route and register it in the protected scope"
```

---

## Self-Review (vom Plan-Autor)

**Spec-Abdeckung:** CC-Resolve getrennt vom kommerziellen Pfad (eigene Route/Resolver/Repository) ✓. `parseStructuredSearchQuery` wiederverwendet (DRY) ✓. Trefferliste → Auswahl → persistierter Track + eager short-url ✓. `cc-track`-Shape mit Stream/Waveform/Lizenz/Download ✓. Nicht-Ziele eingehalten (kein URL-Paste-Flow, kein Cross-Service) ✓. **Bewusst nicht hier:** Genre-Discovery, Album-/Artist-Resolve, Similar-Endpoint, Bio, permanente Share-Page — als Folge-Scope dokumentiert.

**Platzhalter-Scan:** Kein „TBD"; jeder Code-Step vollständig. Drei Stellen mit expliziter Implementer-Verifikation (kein Platzhalter, sondern gezielte Verifikationsaufgabe gegen den echten Code): (a) `getCcRepository`-Cast vs. direkter Adapter, (b) exakte `SearchQuery`-Feldnamen in `parseStructuredSearchQuery`, (c) Existenz von `TRACK_NOT_FOUND` im Error-Table. Diese sind als Verifikationsschritte markiert, weil sie von Dateien abhängen, die der Implementer ohnehin liest/ändert.

**Typ-Konsistenz:** `PersistCcTrackData` (repository.ts) ↔ `persistCcTrack`-Aufruf (cc-resolve.ts) feldidentisch. `ApiCcTrack`/`CcResolveSuccessResponse` (api.ts) ↔ Response in `persistCcTrackAndRespond`. `ccCandidateId`/`parseCcCandidateId` round-trip. `downloadAllowed`: Boolean an der Wire/Domain-Grenze, `integer` (0/1) in der DB — Konversion in `persistCcTrack` (`? 1 : 0`) und `findCcTrackByShortId` (`=== 1`).

**Verifizierte Referenzen (am Plan-Write-Time):**
- Route-Muster, `persistTrackAndRespond`, Flows, `getOrigin`/`jsonError` — `apps/backend/src/routes/resolve.ts` (vollständig gelesen).
- TX-Muster `persistTrackWithLinks`, `generateTrackId`/`generateShortId` — `apps/backend/src/db/adapters/postgres-tracks.ts` (vollständig gelesen).
- Wire-Typen `ApiDisambiguationCandidate`/`ResolveDisambiguationResponse`/`UnifiedResolveSuccessResponse`, Anhänge-Stelle — `packages/shared/src/api.ts:51-192` (gelesen).
- Persist-Typen-Muster `PersistTrackData` — `apps/backend/src/db/repository.ts:45-67` (gelesen).
- Registrierungs-Scope `protectedRoutes`, Endpoint-Pattern `resolve: "/api/v1/resolve"`, Delegations-Muster, `getRepository` — Research-Workflow + Refs (`server.ts:440-445`, `endpoints.ts:48`, `postgres.ts:315`, `db/index.ts:11`); vom Implementer beim Ändern dieser Dateien zu re-verifizieren.
- cc_*-Schema + Unique-Indizes (`uq_cc_*_jamendo_id`, `uq_cc_short_urls_cc_track_id`) für die `ON CONFLICT`-Targets — Plan 1, `postgres.ts:1262-1356`.
- Jamendo-Client `searchCcTracks`/`getCcTrack`/`CcTrackQuery`/`CcTrack` — Plan 1, `services/cc/jamendo/`.

## Completed

Status: ✅ Abgeschlossen · 2026-06-21 · lokal nach `main` gemergt

Vier Tasks via Subagent-Driven Development (Implementer + Review je Task, finaler End-to-End-Review „ready to merge"):

- **Task 1** — CC-Wire-Typen (`ApiCcTrack`, `CcResolveSuccessResponse`) + Endpoint `ccResolve` (`57bde6a`).
- **Task 2** — schlankes CC-Repository `postgres-cc.ts` (`persistCcTrack` mit `ON CONFLICT (jamendo_id)` + eager `cc_short_urls`, `findCcTrackByShortId`) + Wiring + Integrationstest (`f01a044`).
- **Task 3** — CC-Resolve-Modul (Zwei-Leg, `parseStructuredSearchQuery` wiederverwendet) (`c3427fc`).
- **Task 4** — CC-Route `/api/v1/cc/resolve` im protected Scope (`71d8158`).

Gates beim Abschluss: typecheck clean, **alle CC-Tests grün (19)**, Biome clean, doctor:diff sauber. Lokaler Merge (Branch `feat/cc-path-resolve` gelöscht).

**Befund (separat geflaggt, NICHT von diesem Plan verursacht):** Der kommerzielle Integrationstest `track-previews-repo.integration.test.ts:110` (album-preview-Lesen, `topTrackPreviewUrl` kommt `undefined`) schlägt fehl — vorbestehend, failt isoliert, nur mit gesetzter `DATABASE_URL` sichtbar. Eigener Task `task_0252723f`.

**Forward-looking Hinweise für Folge-Pläne (aus den Reviews):**
1. **Share-Page-Plan:** CC- und kommerzielle Short-Codes teilen denselben `nanoid(5)`-Keyspace in getrennten Tabellen (`cc_short_urls` vs. `short_urls`). Eine permanente `/{shortId}`-Auflösung muss beide unterscheiden — Pfad-Präfix (`/cc/{shortId}`) oder beide Tabellen prüfen.
2. **Enrichment-Plan (Artist-Bio / Album):** `upsertCcArtist`/`upsertCcAlbum` machen `ON CONFLICT DO UPDATE` und überschreiben optionale Spalten (image/website/artwork/zip/releaseDate) mit `null`, wenn die Quelle sie nicht liefert. Sobald ein Enrichment-Pfad diese Spalten füllt, muss der Resolve-Upsert sie per `COALESCE` schützen, statt sie zu überschreiben.

Folgepläne: Plan 3 (Frontend — Hero-Umschalter + CC-Seiten), Plan 4 (Dashboard). Optionaler Plan 2b: Genre-Discovery, Album-/Artist-Resolve, Similar-Endpoint, Bio, permanente Share-Page.
