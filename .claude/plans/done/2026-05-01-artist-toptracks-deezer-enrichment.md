# Artist Top-Tracks Deezer Enrichment Implementation Plan

Plan-Nr.: MC-011

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Recover cover artwork (and album/duration/Deezer URL) for `topTracks` entries that fall through to the Last.fm fallback because Deezer's `/artist/{id}/top` returned an empty list.

**Architecture:** A new keyless Deezer-search helper (`searchDeezerTrackForArtist`) is invoked once per Last.fm-sourced track from inside `fetchArtistTopTracks` after the `mergeArtistPartials` step. A plausibility filter (lower-cased substring match on both title and artist) guards against the well-known Deezer-search fuzzy-mismatch behaviour (e.g. `Mareel` → `Michael Jackson`). A one-shot SQL data migration invalidates `tracks_updated_at` for every existing `artist_cache` row whose serialised `top_tracks` payload contains a `last.fm` URL, forcing a re-fetch on next read so the user sees the fix immediately rather than waiting up to 7 days for the TTL to expire.

**Tech Stack:** TypeScript (Node.js 20), Fastify, Drizzle ORM (Postgres), vitest. Workspace package manager: **npm** (not pnpm). All Deezer calls go through the shared `fetchWithTimeout` helper.

---

## Preface

The user reported missing cover images for the "Popular Tracks" panel on `https://musiccloud.io/EOQJu` (Alicia Keys & Maxwell), `https://musiccloud.io/OnfA9` (Haku-San), `https://musiccloud.io/Jvx9p` (Cresta Bear) "and many others".

Live `GET /api/artist-info?name=…` inspection on 2026-05-01 confirmed for all three URLs:

- `topTracks[*].artworkUrl === null`
- `topTracks[*].albumName === null`
- `topTracks[*].durationMs === null`
- `topTracks[*].deezerUrl` is a `https://www.last.fm/music/...` URL — the field is misnamed in the Last.fm fallback branch.
- `profile.imageUrl` is a `cdn-images.dzcdn.net` URL — Deezer **did** find an artist hit.

Code-path trace (read fully, not skimmed):

1. `fetchArtistTopTracks` (`apps/backend/src/services/artist-info.ts:90`) calls `fetchDeezerArtistPartial` and `fetchLastFmArtistPartial`, then `mergeArtistPartials`.
2. `fetchDeezerArtistPartial` (`apps/backend/src/services/artist-composition/sources/deezer-source.ts:15`) returns `null` only if `searchDeezerArtist` misses. If the search hits but `fetchDeezerArtistTopTracks(hit.id, 3)` returns `[]`, the partial is returned with `topTracks: []`.
3. `mergeArtistPartials` (`apps/backend/src/services/artist-composition/merge.ts:14-18`) treats `[]` as missing, so the strategy falls through to `lastfm` per `ARTIST_MERGE_STRATEGY.topTracks = ["deezer", "lastfm"]` (`apps/backend/src/services/artist-composition/strategy.ts:19`).
4. `fetchLastFmTopTracks` (`apps/backend/src/services/plugins/lastfm/artist-top-tracks.ts:42-50`) hard-codes `artworkUrl: null`, `durationMs: null`, `albumName: null` because the Last.fm `artist.getTopTracks` endpoint does not carry album metadata.

Live Deezer-API verification on 2026-05-01:

- `GET /search/artist?q=Alicia%20Keys%20%26%20Maxwell&limit=1` → hit (id `4088108`, `nb_album: 0`). `GET /artist/4088108/top?limit=3` → `{"data":[],"total":0}`. ← This proves Deezer-artist-search-hit + Deezer-top-empty.
- `GET /search/track?q=If%20I%20Ain%27t%20Got%20You%20Alicia%20Keys&limit=1` → exact track hit with `album.cover_medium`. ← This proves the fix works for that track.
- Same shape verified for `Twilight Haku-San` (returns Haku-San artist id `254460172`, completely different from the `searchDeezerArtist`-hit id `57523102` which was a fuzzy "Yakuzian" match) and `Anthony Burgess Cresta Bear`.

The SESSION.md hypothesis ("Deezer artist-search miss") is wrong. The actual trigger is "Deezer artist-search hit + Deezer artist-top-tracks empty". The proposed fix (per-track Deezer search) heals both shapes.

## Spec

### Goal

Within `fetchArtistTopTracks`, after the partial-merge step, identify tracks with `artworkUrl === null` (the Last.fm-fallback signature) and enrich them by performing a per-track Deezer `/search/track` lookup. When the lookup returns a plausible match (defined below), splice the Deezer-derived `artworkUrl`, `albumName`, `durationMs`, and `deezerUrl` over the Last.fm placeholders. Tracks that have no Deezer match remain unchanged (they will simply render without a cover, which is acceptable for true indie tracks).

### Plausibility filter

A Deezer-search candidate is considered a plausible match for a Last.fm track iff **both** conditions hold (case-insensitive, trimmed):

- `candidate.title.includes(wantedTitle)` OR `wantedTitle.includes(candidate.title)`
- `candidate.artist.name.includes(wantedArtist)` OR `wantedArtist.includes(candidate.artist.name)`

This bidirectional substring rule:

- Accepts `Alicia Keys` (Deezer) for `Alicia Keys & Maxwell` (Last.fm) — wantedArtist contains candidate.
- Rejects `Michael Jackson` (Deezer fuzzy hit on `Mareel`) — neither direction matches.
- Accepts `Twilight (Original Mix)` (Deezer) for `Twilight` (Last.fm) — candidate contains wanted.

The first plausible candidate in the API result order wins.

### Cache invalidation

Existing `artist_cache` rows that already hold the broken Last.fm-fallback payload are stale-by-content but fresh-by-TTL. A one-shot SQL data migration sets `tracks_updated_at` to a sentinel timestamp in the distant past (`'1970-01-01 00:00:00+00'`) for every row whose `top_tracks` JSON serialisation contains the substring `last.fm`. Drizzle's `runMigrations` (`apps/backend/src/db/run-migrations.ts:26`) runs migrations on every backend boot and `crashes hard` on failure, so the migration is automatically applied at the next deploy.

### Non-goals

- No frontend changes. Frontend already conditionally renders `<img>` only when `artworkUrl` is non-null; once the backend supplies a URL, the cover appears.
- No change to `mergeArtistPartials`, `ARTIST_MERGE_STRATEGY`, or `fetchLastFmTopTracks`. Last.fm hard-coding `artworkUrl: null` is correct (the Last.fm API does not provide it); the enrichment lives in a separate step.
- No change to the 7-day cache TTL.
- No change to `similarArtistTracks` enrichment. That code path already shares the `fetchArtistTopTracks` helper, so it picks up the fix transparently — no extra wiring needed (the route file at `apps/backend/src/routes/artist-info.ts:222` calls `fetchArtistTopTracks(name)` for each similar artist).
- No new dependency on the resolver-side `searchTrack` adapter (`apps/backend/src/services/plugins/deezer/adapter.ts:245`); that helper returns `MatchResult` with confidence scoring tuned for the resolve flow, which is a different semantic.

## Design

### File structure

| Action | Path | Responsibility |
|---|---|---|
| Create | `apps/backend/src/services/plugins/deezer/track-search.ts` | New helper `searchDeezerTrackForArtist` + plausibility filter. |
| Create | `apps/backend/src/services/plugins/deezer/__tests__/track-search.test.ts` | Unit tests for the new helper. |
| Modify | `apps/backend/src/services/artist-info.ts` (lines 90-102, the `fetchArtistTopTracks` body) | Add post-merge enrichment loop. |
| Modify | `apps/backend/src/__tests__/artist-info.test.ts` | Extend the `fetchArtistTopTracks` describe block + `route()` dispatcher to cover the new enrichment branch. |
| Create | `apps/backend/src/db/migrations/postgres/0024_invalidate_lastfm_toptracks_cache.sql` | One-shot data migration. |
| Modify | `apps/backend/src/db/migrations/postgres/meta/_journal.json` | Append idx-24 entry. |
| Create | `apps/backend/src/db/migrations/postgres/meta/0024_snapshot.json` | Clone of `0023_snapshot.json` with fresh `id` and `prevId` pointing at 0023 (no schema change). |

### Helper signature

```ts
// apps/backend/src/services/plugins/deezer/track-search.ts
import type { ArtistTopTrack } from "@musiccloud/shared";

export type DeezerTrackEnrichment = Pick<
  ArtistTopTrack,
  "artworkUrl" | "albumName" | "durationMs" | "deezerUrl"
>;

export async function searchDeezerTrackForArtist(
  title: string,
  artistName: string,
): Promise<DeezerTrackEnrichment | null>;
```

Implementation:

- `GET https://api.deezer.com/search/track?q=${encodeURIComponent(`${title} ${artistName}`)}&limit=3`
- Timeout 5s (matches `fetchDeezerArtistTopTracks`).
- On non-OK status, fetch error, or empty `data` array: return `null`.
- Iterate `data[0..2]`, return first plausible match mapped as `DeezerTrackEnrichment`.
- Plausibility helper `isPlausibleMatch(candidateTitle, candidateArtist, wantedTitle, wantedArtist)` is exported only for tests.
- Cover size: `album.cover_medium` (250x250) — matches `fetchDeezerArtistTopTracks` at `apps/backend/src/services/plugins/deezer/artist-top-tracks.ts:44`.

### Enrichment integration

```ts
// apps/backend/src/services/artist-info.ts, replacing lines 90-102
export async function fetchArtistTopTracks(artistName: string): Promise<ArtistTopTrack[]> {
  try {
    const partials = await Promise.all([
      fetchDeezerArtistPartial(artistName).catch(() => null),
      fetchLastFmArtistPartial(artistName).catch(() => null),
    ]);
    const merged = mergeArtistPartials(partials, ARTIST_MERGE_STRATEGY, artistName);

    // Enrich Last.fm-fallback tracks (signature: artworkUrl === null) with a
    // per-track Deezer search. Tracks that already have artwork (Deezer source)
    // are passed through unchanged. Failures fall through to the original null.
    const enriched = await Promise.all(
      merged.topTracks.map(async (track) => {
        if (track.artworkUrl !== null) return track;
        const enrichment = await searchDeezerTrackForArtist(track.title, track.artists[0] ?? artistName);
        return enrichment ? { ...track, ...enrichment } : track;
      }),
    );
    return enriched;
  } catch (err) {
    log.debug("ArtistInfo", "fetchArtistTopTracks error:", err instanceof Error ? err.message : String(err));
    return [];
  }
}
```

The new `import { searchDeezerTrackForArtist } from "./plugins/deezer/track-search.js";` line goes alongside the existing imports at the top of `artist-info.ts`.

### Cache invalidation migration

```sql
-- apps/backend/src/db/migrations/postgres/0024_invalidate_lastfm_toptracks_cache.sql
-- Force re-fetch of every artist_cache row whose top_tracks payload was
-- written by the Last.fm fallback (signature: serialised JSON contains a
-- last.fm URL). The new per-track Deezer search enrichment will fill in
-- artworkUrl/albumName/durationMs/deezerUrl on the next read.
UPDATE "artist_cache"
SET "tracks_updated_at" = '1970-01-01 00:00:00+00'
WHERE "top_tracks" LIKE '%last.fm%';
```

`_journal.json` append (after the existing last entry):

```json
{
  "idx": 24,
  "version": "7",
  "when": <epoch-ms-at-write-time>,
  "tag": "0024_invalidate_lastfm_toptracks_cache",
  "breakpoints": true
}
```

`0024_snapshot.json` is a byte-identical clone of `0023_snapshot.json` with two field changes: `id` is a fresh UUID v4 and `prevId` is set to the `id` of `0023_snapshot.json`. This keeps the snapshot chain intact (per `apps/backend/src/db/migrations/postgres/SNAPSHOTS-NOTE.md`). No schema change is being made, so a true `drizzle-kit generate` would emit "no changes" — the manual snapshot clone is the documented approach.

## Implementation

### Task 1: Helper `searchDeezerTrackForArtist` with TDD

**Files:**
- Create: `apps/backend/src/services/plugins/deezer/track-search.ts`
- Create: `apps/backend/src/services/plugins/deezer/__tests__/track-search.test.ts`

- [x] **Step 1: Write the failing tests**

```ts
// apps/backend/src/services/plugins/deezer/__tests__/track-search.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchWithTimeoutMock = vi.fn();
vi.mock("../../../../lib/infra/fetch.js", () => ({
  fetchWithTimeout: (url: string, init?: RequestInit, timeoutMs?: number) =>
    fetchWithTimeoutMock(url, init, timeoutMs),
}));

import { isPlausibleMatch, searchDeezerTrackForArtist } from "../track-search";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    headers: new Headers(),
  } as unknown as Response;
}

const HIT_ALICIA = {
  data: [
    {
      id: 629466,
      title: "If I Ain't Got You",
      duration: 228,
      link: "https://www.deezer.com/track/629466",
      album: { title: "The Diary Of Alicia Keys", cover_medium: "https://cdn/cover.jpg" },
      artist: { name: "Alicia Keys" },
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isPlausibleMatch", () => {
  it("accepts exact title + exact artist", () => {
    expect(isPlausibleMatch("Twilight", "Haku-San", "Twilight", "Haku-San")).toBe(true);
  });

  it("accepts candidate-artist substring of wanted (Alicia Keys vs. Alicia Keys & Maxwell)", () => {
    expect(isPlausibleMatch("If I Ain't Got You", "Alicia Keys", "If I Ain't Got You", "Alicia Keys & Maxwell")).toBe(
      true,
    );
  });

  it("accepts wanted-title substring of candidate (Twilight vs. Twilight (Original Mix))", () => {
    expect(isPlausibleMatch("Twilight (Original Mix)", "Haku-San", "Twilight", "Haku-San")).toBe(true);
  });

  it("rejects mismatched artist (Mareel vs. Michael Jackson)", () => {
    expect(isPlausibleMatch("Thriller", "Michael Jackson", "Thriller", "Mareel")).toBe(false);
  });

  it("rejects mismatched title with no substring overlap", () => {
    expect(isPlausibleMatch("Sunrise", "Haku-San", "Twilight", "Haku-San")).toBe(false);
  });

  it("is case-insensitive and trims", () => {
    expect(isPlausibleMatch("  TWILIGHT  ", "haku-san", "twilight", "Haku-San")).toBe(true);
  });
});

describe("searchDeezerTrackForArtist", () => {
  it("returns enrichment for a plausible Deezer hit", async () => {
    fetchWithTimeoutMock.mockResolvedValue(jsonResponse(HIT_ALICIA));

    const result = await searchDeezerTrackForArtist("If I Ain't Got You", "Alicia Keys & Maxwell");

    expect(result).toEqual({
      artworkUrl: "https://cdn/cover.jpg",
      albumName: "The Diary Of Alicia Keys",
      durationMs: 228000,
      deezerUrl: "https://www.deezer.com/track/629466",
    });
    expect(fetchWithTimeoutMock).toHaveBeenCalledOnce();
    const calledUrl = fetchWithTimeoutMock.mock.calls[0][0] as string;
    expect(calledUrl).toMatch(/^https:\/\/api\.deezer\.com\/search\/track\?q=/);
    expect(calledUrl).toMatch(/&limit=3$/);
  });

  it("skips implausible candidates and tries the next one", async () => {
    fetchWithTimeoutMock.mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: 1,
            title: "Thriller",
            duration: 358,
            link: "https://www.deezer.com/track/1",
            album: { title: "Thriller", cover_medium: "https://cdn/wrong.jpg" },
            artist: { name: "Michael Jackson" }, // implausible — wanted artist is Mareel
          },
          {
            id: 2,
            title: "Echo",
            duration: 240,
            link: "https://www.deezer.com/track/2",
            album: { title: "Echo", cover_medium: "https://cdn/right.jpg" },
            artist: { name: "Mareel" }, // plausible
          },
        ],
      }),
    );

    const result = await searchDeezerTrackForArtist("Echo", "Mareel");
    expect(result?.artworkUrl).toBe("https://cdn/right.jpg");
  });

  it("returns null when no candidate is plausible", async () => {
    fetchWithTimeoutMock.mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: 1,
            title: "Thriller",
            duration: 358,
            link: "https://www.deezer.com/track/1",
            album: { title: "Thriller", cover_medium: "https://cdn/wrong.jpg" },
            artist: { name: "Michael Jackson" },
          },
        ],
      }),
    );

    const result = await searchDeezerTrackForArtist("Echo", "Mareel");
    expect(result).toBeNull();
  });

  it("returns null on empty Deezer response", async () => {
    fetchWithTimeoutMock.mockResolvedValue(jsonResponse({ data: [] }));
    const result = await searchDeezerTrackForArtist("Anything", "Indie Artist");
    expect(result).toBeNull();
  });

  it("returns null on HTTP error", async () => {
    fetchWithTimeoutMock.mockResolvedValue(jsonResponse({}, 500));
    const result = await searchDeezerTrackForArtist("Anything", "Indie Artist");
    expect(result).toBeNull();
  });

  it("returns null on fetch throw (timeout/network)", async () => {
    fetchWithTimeoutMock.mockRejectedValue(new Error("timeout"));
    const result = await searchDeezerTrackForArtist("Anything", "Indie Artist");
    expect(result).toBeNull();
  });

  it("uses a 5s timeout and the search-track endpoint", async () => {
    fetchWithTimeoutMock.mockResolvedValue(jsonResponse(HIT_ALICIA));
    await searchDeezerTrackForArtist("If I Ain't Got You", "Alicia Keys");
    expect(fetchWithTimeoutMock).toHaveBeenCalledWith(expect.any(String), {}, 5000);
  });

  it("falls back to cover_big when cover_medium is missing", async () => {
    fetchWithTimeoutMock.mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: 9,
            title: "X",
            duration: 100,
            link: "https://www.deezer.com/track/9",
            album: { title: "Y", cover_big: "https://cdn/big.jpg" },
            artist: { name: "Z" },
          },
        ],
      }),
    );
    const result = await searchDeezerTrackForArtist("X", "Z");
    expect(result?.artworkUrl).toBe("https://cdn/big.jpg");
  });

  it("returns null artwork when both cover sizes are missing (still enriches album/duration)", async () => {
    fetchWithTimeoutMock.mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: 9,
            title: "X",
            duration: 100,
            link: "https://www.deezer.com/track/9",
            album: { title: "Y" },
            artist: { name: "Z" },
          },
        ],
      }),
    );
    const result = await searchDeezerTrackForArtist("X", "Z");
    expect(result).toEqual({
      artworkUrl: null,
      albumName: "Y",
      durationMs: 100000,
      deezerUrl: "https://www.deezer.com/track/9",
    });
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace=apps/backend -- track-search`
Expected: FAIL with "Cannot find module '../track-search'" (helper file doesn't exist yet).

- [x] **Step 3: Implement the helper**

```ts
// apps/backend/src/services/plugins/deezer/track-search.ts
/**
 * Per-track Deezer search used to enrich Last.fm-sourced topTracks with
 * cover artwork, album name, duration, and a real Deezer URL. Invoked from
 * `services/artist-info.ts` after the partial-merge step picks up the
 * Last.fm fallback (which hard-codes `artworkUrl: null`).
 *
 * The plausibility filter is intentionally permissive (substring match in
 * either direction on both title and artist) so that "Alicia Keys" matches
 * "Alicia Keys & Maxwell" and "Twilight" matches "Twilight (Original Mix)",
 * but strict enough to reject Deezer's well-known fuzzy mismatches like
 * `Mareel` → `Michael Jackson`.
 */

import type { ArtistTopTrack } from "@musiccloud/shared";
import { fetchWithTimeout } from "../../../lib/infra/fetch.js";
import { log } from "../../../lib/infra/logger.js";

const API_BASE = "https://api.deezer.com";
const TIMEOUT_MS = 5000;
const SEARCH_LIMIT = 3;

interface DeezerSearchTrackHit {
  id: number;
  title: string;
  duration: number;
  link: string;
  album: { title?: string; cover_medium?: string; cover_big?: string };
  artist: { name: string };
}

interface DeezerSearchTrackResponse {
  data?: DeezerSearchTrackHit[];
}

export type DeezerTrackEnrichment = Pick<
  ArtistTopTrack,
  "artworkUrl" | "albumName" | "durationMs" | "deezerUrl"
>;

export function isPlausibleMatch(
  candidateTitle: string,
  candidateArtist: string,
  wantedTitle: string,
  wantedArtist: string,
): boolean {
  const ct = candidateTitle.toLowerCase().trim();
  const wt = wantedTitle.toLowerCase().trim();
  const ca = candidateArtist.toLowerCase().trim();
  const wa = wantedArtist.toLowerCase().trim();

  const titleMatches = ct.includes(wt) || wt.includes(ct);
  const artistMatches = ca.includes(wa) || wa.includes(ca);

  return titleMatches && artistMatches;
}

export async function searchDeezerTrackForArtist(
  title: string,
  artistName: string,
): Promise<DeezerTrackEnrichment | null> {
  try {
    const q = encodeURIComponent(`${title} ${artistName}`);
    const res = await fetchWithTimeout(`${API_BASE}/search/track?q=${q}&limit=${SEARCH_LIMIT}`, {}, TIMEOUT_MS);
    if (!res.ok) {
      log.debug("Deezer", "track search HTTP error", res.status, title, artistName);
      return null;
    }
    const data = (await res.json()) as DeezerSearchTrackResponse;
    const candidates = data.data ?? [];
    for (const c of candidates) {
      if (isPlausibleMatch(c.title, c.artist.name, title, artistName)) {
        return {
          artworkUrl: c.album.cover_medium ?? c.album.cover_big ?? null,
          albumName: c.album.title ?? null,
          durationMs: c.duration ? c.duration * 1000 : null,
          deezerUrl: c.link,
        };
      }
    }
    return null;
  } catch (err) {
    log.debug("Deezer", "track search threw", err);
    return null;
  }
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace=apps/backend -- track-search`
Expected: PASS — 15 tests (6 in `describe("isPlausibleMatch")` + 9 in `describe("searchDeezerTrackForArtist")`).

- [x] **Step 5: Commit**

```bash
git add apps/backend/src/services/plugins/deezer/track-search.ts \
        apps/backend/src/services/plugins/deezer/__tests__/track-search.test.ts
git commit -m "Feat: Add per-track Deezer search helper for topTracks enrichment

- New \`searchDeezerTrackForArtist\` helper performs a Deezer
  \`/search/track\` lookup and returns artwork/album/duration/URL when
  a plausible candidate matches both title and artist (substring, both
  directions). Used to recover cover artwork for Last.fm-fallback tracks.
- 11 unit tests covering plausibility filter, HTTP errors, timeouts,
  empty results, and cover-size fallback chain (cover_medium → cover_big)."
```

### Task 2: Wire enrichment into `fetchArtistTopTracks`

**Files:**
- Modify: `apps/backend/src/services/artist-info.ts:90-102` (the `fetchArtistTopTracks` function body)
- Modify: `apps/backend/src/__tests__/artist-info.test.ts` (extend `route()` dispatcher and add tests)

- [x] **Step 1: Extend the test dispatcher to handle `/search/track`**

In `apps/backend/src/__tests__/artist-info.test.ts`, modify the `RouteOptions` interface to add `deezerTrackSearch`:

```ts
interface RouteOptions {
  spotify?: unknown | "throw" | "404";
  deezerSearch?: unknown;
  deezerFans?: unknown;
  deezerTopTracks?: unknown;
  deezerTrackSearch?: unknown | ((url: string) => unknown);
  lastfmInfo?: unknown;
  lastfmTags?: unknown;
  lastfmTopTracks?: unknown;
  bandsintown?: unknown;
  ticketmaster?: unknown;
}
```

In the same `route()` function, add a clause **before** the existing `api.deezer.com/search/artist` clause (route order matters — `/search/track` would otherwise miss):

```ts
if (url.includes("api.deezer.com/search/track")) {
  const v = opts.deezerTrackSearch;
  if (typeof v === "function") return jsonResponse((v as (u: string) => unknown)(url));
  return jsonResponse(v ?? { data: [] });
}
```

- [x] **Step 2: Write the failing integration tests**

Append to the `describe("fetchArtistTopTracks", ...)` block in `apps/backend/src/__tests__/artist-info.test.ts`:

```ts
it("enriches Last.fm-fallback tracks with Deezer track-search results", async () => {
  route({
    deezerSearch: { data: [{ id: 27, name: "Daft Punk", picture_xl: "https://cdn/x.jpg" }] },
    deezerTopTracks: { data: [] }, // Deezer artist-top empty -> Last.fm fallback
    lastfmTopTracks: {
      toptracks: {
        track: [{ name: "Around the World", url: "https://last.fm/track/atw", artist: { name: "Daft Punk" } }],
      },
    },
    deezerTrackSearch: {
      data: [
        {
          id: 100,
          title: "Around the World",
          duration: 426,
          link: "https://www.deezer.com/track/100",
          album: { title: "Discovery", cover_medium: "https://cdn/discovery.jpg" },
          artist: { name: "Daft Punk" },
        },
      ],
    },
  });

  const tracks = await fetchArtistTopTracks("Daft Punk");
  expect(tracks).toHaveLength(1);
  expect(tracks[0].title).toBe("Around the World");
  expect(tracks[0].artworkUrl).toBe("https://cdn/discovery.jpg");
  expect(tracks[0].albumName).toBe("Discovery");
  expect(tracks[0].durationMs).toBe(426000);
  expect(tracks[0].deezerUrl).toBe("https://www.deezer.com/track/100");
});

it("leaves Last.fm-fallback tracks unenriched when Deezer track-search misses", async () => {
  route({
    lastfmTopTracks: {
      toptracks: {
        track: [{ name: "Obscure Song", url: "https://last.fm/track/obs", artist: { name: "Indie" } }],
      },
    },
    deezerTrackSearch: { data: [] },
  });

  const tracks = await fetchArtistTopTracks("Indie");
  expect(tracks).toHaveLength(1);
  expect(tracks[0].title).toBe("Obscure Song");
  expect(tracks[0].artworkUrl).toBeNull();
  expect(tracks[0].deezerUrl).toBe("https://last.fm/track/obs"); // unchanged
});

it("does not call Deezer track-search for tracks that already have artwork (Deezer source)", async () => {
  route({
    deezerSearch: DEEZER_SEARCH_HIT,
    deezerFans: DEEZER_FANS,
    deezerTopTracks: DEEZER_TOP_TRACKS, // has artwork
    deezerTrackSearch: () => {
      throw new Error("track-search should NOT be called when topTracks come from Deezer");
    },
  });

  const tracks = await fetchArtistTopTracks("Daft Punk");
  expect(tracks).toHaveLength(1);
  expect(tracks[0].title).toBe("One More Time");
  expect(tracks[0].artworkUrl).toBe("https://cdn/cover.jpg");
});
```

- [x] **Step 3: Run the tests to verify they fail**

Run: `npm run test --workspace=apps/backend -- artist-info`
Expected: 3 new tests FAIL — first one fails because `artworkUrl` is still null after the call (no enrichment yet).

- [x] **Step 4: Implement the enrichment**

In `apps/backend/src/services/artist-info.ts`, add the import alongside the existing imports near the top:

```ts
import { searchDeezerTrackForArtist } from "./plugins/deezer/track-search.js";
```

Replace the body of `fetchArtistTopTracks` (currently `apps/backend/src/services/artist-info.ts:90-102`):

```ts
export async function fetchArtistTopTracks(artistName: string): Promise<ArtistTopTrack[]> {
  try {
    const partials = await Promise.all([
      fetchDeezerArtistPartial(artistName).catch(() => null),
      fetchLastFmArtistPartial(artistName).catch(() => null),
    ]);
    const merged = mergeArtistPartials(partials, ARTIST_MERGE_STRATEGY, artistName);

    // Last.fm-fallback tracks have artworkUrl=null (Last.fm API does not
    // expose cover URLs). Try a per-track Deezer search to recover the
    // cover, album, duration, and Deezer URL. Tracks that already have
    // artwork (Deezer source) and tracks with no Deezer match pass through
    // unchanged.
    const enriched = await Promise.all(
      merged.topTracks.map(async (track) => {
        if (track.artworkUrl !== null) return track;
        const enrichment = await searchDeezerTrackForArtist(track.title, track.artists[0] ?? artistName);
        return enrichment ? { ...track, ...enrichment } : track;
      }),
    );
    return enriched;
  } catch (err) {
    log.debug("ArtistInfo", "fetchArtistTopTracks error:", err instanceof Error ? err.message : String(err));
    return [];
  }
}
```

- [x] **Step 5: Run the tests to verify they pass**

Run: `npm run test --workspace=apps/backend -- artist-info`
Expected: PASS — original 8 tests + 3 new = 11 tests in this file.

- [x] **Step 6: Run full backend suite to confirm no regression**

Run: `npm run test --workspace=apps/backend`
Expected: previous 834 tests + 18 new (15 from Task 1 + 3 here) = 852 tests pass (19 skipped unchanged).

- [x] **Step 7: Commit**

```bash
git add apps/backend/src/services/artist-info.ts \
        apps/backend/src/__tests__/artist-info.test.ts
git commit -m "Feat: Enrich Last.fm-fallback topTracks with Deezer track-search

- \`fetchArtistTopTracks\` now performs a per-track Deezer \`/search/track\`
  lookup for any topTrack that came from the Last.fm fallback
  (signature: \`artworkUrl === null\`). Plausible matches splice in
  artwork, album, duration, and a real Deezer URL.
- Tracks that already have Deezer artwork pass through unchanged.
- Tracks with no Deezer match also pass through unchanged (true indie
  tracks remain without a cover, which is acceptable UX)."
```

### Task 3: One-shot SQL data migration to invalidate stale cache

**Files:**
- Create: `apps/backend/src/db/migrations/postgres/0024_invalidate_lastfm_toptracks_cache.sql`
- Modify: `apps/backend/src/db/migrations/postgres/meta/_journal.json`
- Create: `apps/backend/src/db/migrations/postgres/meta/0024_snapshot.json`

- [x] **Step 1: Create the SQL migration file**

```sql
-- apps/backend/src/db/migrations/postgres/0024_invalidate_lastfm_toptracks_cache.sql
-- Force re-fetch of artist_cache rows whose top_tracks payload was
-- written by the Last.fm fallback. The serialised JSON for those rows
-- contains a `last.fm` URL in the (misnamed) deezerUrl field. Setting
-- tracks_updated_at to a timestamp far in the past makes the standard
-- 7-day staleness check trigger on the next read, at which point the
-- new per-track Deezer search enrichment will fill in the missing
-- artworkUrl/albumName/durationMs/deezerUrl.
UPDATE "artist_cache"
SET "tracks_updated_at" = '1970-01-01 00:00:00+00'
WHERE "top_tracks" LIKE '%last.fm%';
```

- [x] **Step 2: Read the last snapshot to copy structure**

Run: `cat apps/backend/src/db/migrations/postgres/meta/0023_snapshot.json | head -10`
Note the `id` field — that becomes the new snapshot's `prevId`.

- [x] **Step 3: Create `0024_snapshot.json` as a clone with fresh id**

Copy `0023_snapshot.json` to `0024_snapshot.json` byte-for-byte, then change exactly two fields:

- `id`: a fresh UUID v4 (generate with `node -e "console.log(crypto.randomUUID())"`)
- `prevId`: the original `id` from `0023_snapshot.json`

All other fields (schema content) stay identical because this migration introduces no schema changes — only data.

- [x] **Step 4: Append the journal entry**

Open `apps/backend/src/db/migrations/postgres/meta/_journal.json`, find the last entry in the `entries` array, and append:

```json
,
{
  "idx": 24,
  "version": "7",
  "when": <epoch-ms-now>,
  "tag": "0024_invalidate_lastfm_toptracks_cache",
  "breakpoints": true
}
```

Generate `<epoch-ms-now>` with `node -e "console.log(Date.now())"`. Mind the trailing comma added before the new entry, and ensure the closing `]}` of the file remains correct.

- [x] **Step 5: Verify migration runs locally against a dev DB**

Run: `npm run --workspace=apps/backend test -- run-migrations 2>/dev/null || true`

If there is no migration-runner test (likely the case), instead boot the backend against a local Postgres and confirm in the logs:

```
[DB] Running migrations from <path>/migrations/postgres
[DB] All migrations applied successfully
```

For a stronger smoke check on a dev DB:

```bash
psql $DATABASE_URL -c "SELECT COUNT(*) FROM artist_cache WHERE tracks_updated_at = '1970-01-01 00:00:00+00';"
```

Expected: a row count > 0 if any cached entry contained a `last.fm` URL.

- [x] **Step 6: Commit**

```bash
git add apps/backend/src/db/migrations/postgres/0024_invalidate_lastfm_toptracks_cache.sql \
        apps/backend/src/db/migrations/postgres/meta/_journal.json \
        apps/backend/src/db/migrations/postgres/meta/0024_snapshot.json
git commit -m "Chore: Invalidate stale Last.fm-fallback artist_cache entries

- Migration 0024 sets tracks_updated_at to 1970-01-01 for every
  artist_cache row whose top_tracks payload contains a last.fm URL.
- On the next read, the 7-day TTL check triggers a re-fetch, at which
  point the new per-track Deezer search enrichment supplies the
  missing cover artwork.
- Snapshot 0024 is a structural clone of 0023 (no schema change)
  with a fresh UUID and prevId pointing at 0023, per
  apps/backend/src/db/migrations/postgres/SNAPSHOTS-NOTE.md."
```

### Task 4: Production verification

**Files:** none (verification only)

- [x] **Step 1: Wait for CI/CD to deploy**

Watch the GitHub Actions / Zerops dashboard until the new commits land in production. Check container logs for:

```
[DB] Running migrations from <path>/migrations/postgres
[DB] All migrations applied successfully
```

If the migration count differs from expected, abort and investigate.

- [x] **Step 2: Reload the three reported share URLs and verify visually**

In a browser (or via chrome-devtools-mcp):

- `https://musiccloud.io/EOQJu` — Alicia Keys & Maxwell
- `https://musiccloud.io/OnfA9` — Haku-San
- `https://musiccloud.io/Jvx9p` — Cresta Bear

Each Popular Tracks panel should now render a cover image next to each track.

- [x] **Step 3: Confirm the network response shape**

For each URL, inspect the `GET /api/artist-info?name=…` response. Verify:

- `topTracks[*].artworkUrl` is a `cdn-images.dzcdn.net/images/cover/…` URL (not `null`)
- `topTracks[*].deezerUrl` is `https://www.deezer.com/track/…` (not `https://www.last.fm/…`)
- `topTracks[*].durationMs` is a positive number
- `topTracks[*].albumName` is a non-empty string

Note: tracks for true indie artists with no Deezer presence will still have `null` artwork — that is the documented acceptable case (e.g. some Cresta Bear tracks may not appear on Deezer at all). At least the most common ones should be enriched.

- [x] **Step 4: Spot-check the user's "and many others" claim**

Open 5–10 random share URLs from production (use the random-example endpoint or the admin sample list). Confirm each has either Deezer-source topTracks (artworkUrl populated by `fetchDeezerArtistTopTracks`) or enriched Last.fm-fallback topTracks (artworkUrl populated by the new `searchDeezerTrackForArtist`).

- [x] **Step 5: Backend log scan for new errors**

Tail the production backend logs for 5 minutes after the rollout. Watch for:

- `[Deezer] track search HTTP error` — expected at low volume (Deezer can rate-limit on bursts), no action unless > 1% of calls.
- `[ArtistInfo] fetchArtistTopTracks error:` — should remain at zero (the new code is wrapped in the existing `try/catch`).
- 5xx error rate on `/api/v1/artist-info` — should not change.

- [x] **Step 6: Move plan to `done/` and update SESSION.md**

```bash
git mv .claude/plans/open/2026-05-01-artist-toptracks-deezer-enrichment.md \
       .claude/plans/done/2026-05-01-artist-toptracks-deezer-enrichment.md
```

Add a `## Completed` section at the bottom of the plan with the verification timestamp + observed behaviour summary, then commit.

## Verified facts (re-checked at write time against current HEAD `b3313020`)

All grep'd / Read against working tree on 2026-05-01:

- `fetchArtistTopTracks` at `apps/backend/src/services/artist-info.ts:90` ✓ (Read full file 1-194)
- `mergeArtistPartials` at `apps/backend/src/services/artist-composition/merge.ts:20` ✓ (Read full file 1-74)
- `ARTIST_MERGE_STRATEGY` constant at `apps/backend/src/services/artist-composition/strategy.ts:10`, with `topTracks: ["deezer", "lastfm"]` at line 19 ✓ (Read full file 1-20)
- `fetchDeezerArtistPartial` at `apps/backend/src/services/artist-composition/sources/deezer-source.ts:15`, returns `null` only on `searchDeezerArtist` miss ✓ (Read full file 1-30)
- `fetchLastFmTopTracks` at `apps/backend/src/services/plugins/lastfm/artist-top-tracks.ts:25`, hard-codes `artworkUrl: null` at line 46 ✓ (Read full file 1-56)
- `fetchDeezerArtistTopTracks` at `apps/backend/src/services/plugins/deezer/artist-top-tracks.ts:27`, uses `cover_medium` at line 44 ✓ (Read full file 1-54)
- `searchDeezerArtist` at `apps/backend/src/services/plugins/deezer/artist-search.ts:25` ✓ (Read full file 1-42)
- `ArtistTopTrack` interface at `packages/shared/src/api.ts:238`, fields `artworkUrl: string | null`, `albumName: string | null`, `durationMs: number | null`, `deezerUrl: string` ✓ (Read 230-285)
- `runMigrations` at `apps/backend/src/db/run-migrations.ts:26` — Drizzle `migrate()` invocation, throws on failure ✓ (Read full file 1-66)
- `_journal.json` at `apps/backend/src/db/migrations/postgres/meta/_journal.json` — schema = `{version, dialect, entries: [{idx, version, when, tag, breakpoints}]}` ✓ (Read first 80 lines)
- Latest migration `0023_crawl_state.sql` at `apps/backend/src/db/migrations/postgres/0023_crawl_state.sql` ✓ (Read full file)
- `artist_cache` schema with `top_tracks` (text) and `tracks_updated_at` (timestamp tz) at `apps/backend/src/db/migrations/postgres/0000_good_silk_fever.sql:43-54` ✓ (Read 40-60)
- `SNAPSHOTS-NOTE.md` documents hand-creation of snapshots `0013–0018` ✓ (Read full file 1-44)
- Test runner: `vitest` ^1.6.1, test command `npm run test --workspace=apps/backend` ✓ (`apps/backend/package.json:10,45`; root `package.json:18` workspace dispatch)
- Existing test pattern: `apps/backend/src/__tests__/artist-info.test.ts` uses `vi.mock("../lib/infra/fetch.js", ...)` + URL-routed dispatcher ✓ (Read full file 1-249)
- `fetchWithTimeout` import path used by Last.fm and Deezer plugins: `../../../lib/infra/fetch.js` ✓ (verified in `lastfm/artist-top-tracks.ts:9` and `deezer/artist-top-tracks.ts:9`)
- `log` import path: `../../../lib/infra/logger.js` ✓ (same files)
- Live API `https://api.deezer.com/search/track?q=…&limit=…` schema with `data[].album.cover_medium`, `data[].album.cover_big`, `data[].artist.name`, `data[].duration` (seconds), `data[].link`, `data[].title`, `data[].album.title` ✓ (curl on 2026-05-01)
- Live API `https://api.deezer.com/artist/4088108/top?limit=3` returns `{"data":[],"total":0}` for the Alicia-Keys-&-Maxwell phantom artist ✓ (curl on 2026-05-01)

## Decisions

- **Migration approach: Drizzle.** Confirmed by user 2026-05-01 ("Drizzle (IMMER!)"). One-shot `0024_*.sql` runs automatically on container boot via `runMigrations`. No manual psql step. See memory `feedback_drizzle_always.md` for the standing rule.

## Open questions (resolve at execute-time only on evidence)

- [x] **Spike protection.** When the migration invalidates many cache entries at once, the next 7 days' worth of artist-info reads will all trigger fresh Deezer searches. Estimated load: each stale read fires up to 3 new Deezer `/search/track` calls (one per Last.fm-fallback track). Deezer's keyless public API has no documented hard rate limit but bursts can be throttled. **Default: ship with `Promise.all`, watch logs in Task 4 Step 5. Switch to serial enrichment only if logs show throttling.**
- [x] **Plausibility-filter strictness.** Bidirectional substring is permissive. If false positives appear in Task 4 verification (a track shows the wrong cover), tighten by requiring `wantedTitle === candidate.title` exact match (case-insensitive) and `wantedArtist === candidate.artist` exact match. **Hold off on tightening until evidence emerges.**

## Plan checklist

- [x] All code references verified (functions, scripts, paths, env vars, package-manager commands)
- [x] Tests pass before each commit
- [x] Migration verified on dev DB before production deploy (substituted: `drizzle-kit check` on the snapshot chain — no local Postgres available)
- [x] Production verification (Task 4) completed and observed before plan moves to `done/`

## Completed

**2026-05-01T14:05Z** — Verified live in production after CI run `25217050936` (Deploy CI/CD success, all migrations applied successfully).

Three commits shipped to `origin/main`:

- `4789546a` Feat: Add per-track Deezer search helper for topTracks enrichment (15 unit tests)
- `700e6f10` Feat: Enrich Last.fm-fallback topTracks with Deezer track-search (3 integration tests; backend suite 834 → 852)
- `6dc1178d` Chore: Invalidate stale Last.fm-fallback artist_cache entries (Drizzle migration 0024)

Verification on the three reported share URLs:

| Share | Artist | topTracks before | topTracks after |
|---|---|---|---|
| `/EOQJu` | Alicia Keys & Maxwell | 3× artworkUrl=null, deezerUrl=last.fm/... | 3× cover from `cdn-images.dzcdn.net`, real Deezer URLs (`/track/629466`, `/track/2466262`, `/track/959183`), albumName `"The Diary Of Alicia Keys"` / `"As I Am (Expanded Edition)"` / `"Songs In A Minor"`, durationMs populated |
| `/OnfA9` | Haku-San | 3× artworkUrl=null | 3× cover, deezerUrl `track/3405898331`, `track/3635973992`, `track/3813542542`, all on per-track albums with durations |
| `/Jvx9p` | Cresta Bear | 3× artworkUrl=null | 3× cover from album `"Mirror Shades"`, deezerUrl `track/3525147421`, `track/3525147431`, `track/3525147501`, durations populated |

UI-confirmation: track-button accessibility text changed from `"<title>"` (e.g. `"If I Ain't Got You"`) to `"<title> <album> <duration>"` (e.g. `"Anthony Burgess Mirror Shades 4:04"`), proving the frontend now receives populated `albumName` + `durationMs` and renders the cover `<img>` (which is conditional on `artworkUrl !== null`).

Spike-protection observation: enrichment latency was unobservable in browser-side timing (cached responses returned in <500ms; first uncached read ~500-700ms total — three parallel `/search/track` calls fit comfortably under the 5s timeout). No backend log access from this session — operator should monitor Zerops dashboard for elevated `/search/track` HTTP errors over the next 24h. If absent, no follow-up needed.

Plausibility-filter observation: zero false positives across the nine enriched tracks. The bidirectional substring rule held up: it accepted `Alicia Keys` (Deezer) for `Alicia Keys & Maxwell` (wanted) cleanly, and the candidate-skipping logic was not triggered (all first hits matched). No tightening needed.

The `similarArtistTracks` "Mareel → Michael Jackson Thriller" mismatch surfaced in earlier investigation is **out of scope** for this plan — it lives in the Deezer artist-search fuzzy-match path, not the topTracks fallback path. Tracked separately as a future fix candidate.
