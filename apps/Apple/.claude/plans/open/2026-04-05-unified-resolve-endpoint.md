# Unified Resolve Endpoint

## Preface

The backend currently has three separate resolve endpoints:

| Content Type | Frontend Proxy         | Backend                  |
|--------------|------------------------|--------------------------|
| Track        | `/api/resolve`         | `/api/v1/resolve`        |
| Album        | `/api/resolve-album`   | `/api/v1/resolve-album`  |
| Artist       | `/api/resolve-artist`  | `/api/v1/resolve-artist` |

Clients must detect the content type (track/album/artist) and call the correct endpoint. This duplicates URL detection logic across every client (frontend React, macOS app, future iOS app). The macOS app currently only calls `/api/resolve`, which is why album and artist URLs fail.

## Goal

Single `/api/v1/resolve` endpoint that auto-detects content type. Clients send any streaming URL without needing to know if it's a track, album, or artist. One source of truth for URL classification lives in the backend.

## Current Architecture

### Three Route Handlers

All in `backend/src/routes/`:

1. **`resolve.ts`** (Track) - Most complex
   - Supports disambiguation (text search with candidate selection)
   - Supports `selectedCandidate` parameter
   - Deezer preview URL refresh
   - Short link alias saving
   - Resolver: `resolveQuery()` / `resolveUrl()` / `resolveTextSearchWithDisambiguation()`

2. **`resolve-album.ts`** (Album)
   - No disambiguation
   - Top track preview URL from Deezer
   - Resolver: `resolveAlbumUrl()` / `resolveAlbumTextSearch()`

3. **`resolve-artist.ts`** (Artist)
   - Simplest handler
   - No preview/disambiguation
   - Resolver: `resolveArtistUrl()` / `resolveArtistTextSearch()`

### Shared Components

- Rate limiting, CORS origin validation, auth (`authenticatePublic`)
- Error handling via `ResolveError` exception mapping
- URL stripping via `stripTrackingParams()`
- DB persistence pattern (different repo methods)

### URL Detection (backend/src/lib/platform/url.ts)

Backend already has all detection functions: `isAlbumUrl()`, `isArtistUrl()`, `isMusicUrl()`. These are the source of truth.

### Response Structures (different per type)

- Track: `{ id, shortUrl, track: { title, artists, albumName, artworkUrl, durationMs, ... }, links }`
- Album: `{ id, shortUrl, album: { name, artists, artworkUrl, totalTracks, ... }, links }`
- Artist: `{ id, shortUrl, artist: { name, genres, artworkUrl, ... }, links }`

## Design

### Option A: Unified Handler with Auto-Detection (Recommended)

One route handler that:
1. Receives `{ query, selectedCandidate? }`
2. Detects content type using existing `isAlbumUrl()` / `isArtistUrl()` / `isUrl()`
3. Dispatches to the correct resolver
4. Persists via the correct repo method
5. Returns a response with a `type` discriminator

**Request** (unchanged):
```json
{ "query": "https://open.spotify.com/intl-de/album/...", "selectedCandidate": "spotify:trackId" }
```

**Response** (add `type` field):
```json
{
  "type": "album",
  "id": "...",
  "shortUrl": "https://musiccloud.io/abc",
  "album": { "name": "...", "artists": [...], ... },
  "links": [...]
}
```

The `type` field (`"track"`, `"album"`, `"artist"`) lets clients know which payload to parse. The existing `track`/`album`/`artist` fields are already mutually exclusive in the macOS app's `ResolveResponse`.

### Option B: Keep Separate Handlers, Add Router Endpoint

A thin `/api/v1/resolve` that detects type and internally forwards to the existing handlers. Less refactoring but adds a redirect hop.

**Recommendation:** Option A. The three handlers share enough structure that a single handler with conditional dispatch is cleaner than three files with duplicated boilerplate.

## Implementation

### Step 1: Backend - Unified Route Handler

**File:** `backend/src/routes/resolve.ts` (modify existing)

1. Import `isAlbumUrl`, `isArtistUrl` from `../lib/platform/url`
2. Import album/artist resolvers
3. After input validation, detect content type:
   ```typescript
   const contentType = isAlbumUrl(query) ? "album"
     : isArtistUrl(query) ? "artist"
     : "track";
   ```
4. Dispatch to correct resolver based on `contentType`
5. Persist via correct repo method
6. Add `type` field to response
7. Keep `selectedCandidate` and disambiguation for tracks only

### Step 2: Backend - Keep Existing Endpoints (Backwards Compatibility)

Keep `/api/v1/resolve-album` and `/api/v1/resolve-artist` working during transition. Mark as deprecated. Remove once all clients use the unified endpoint.

### Step 3: Frontend - Simplify Routing

**File:** `frontend/src/hooks/useAppState.ts`

Remove `isAlbumUrl()` / `isArtistUrl()` checks. Always call `/api/resolve`. Parse response `type` field to determine which UI to show.

**File:** `frontend/src/lib/platform/url.ts`

Keep `isMusicUrl()` for paste detection. Remove `isAlbumUrl()` / `isArtistUrl()` exports (or keep for non-routing uses).

### Step 4: Frontend - Remove Separate Astro Proxy Routes

**Files to remove (eventually):**
- `frontend/src/pages/api/resolve-album.ts`
- `frontend/src/pages/api/resolve-artist.ts`

**File to keep:**
- `frontend/src/pages/api/resolve.ts` (now handles all types)

### Step 5: macOS App - No Changes Needed

The macOS app already calls `/api/resolve` and its `ResolveResponse` already has optional `track`/`album`/`artist` fields. It just needs to handle the new `type` field (optional, since `contentType` computed property already works).

Only change: add `ClipboardMonitor` whitespace trimming (already prepared but reverted).

## Affected Files

### Backend
| File | Action |
|------|--------|
| `backend/src/routes/resolve.ts` | **Modify** - Add album/artist dispatch |
| `backend/src/routes/resolve-album.ts` | **Keep** - Deprecate, remove later |
| `backend/src/routes/resolve-artist.ts` | **Keep** - Deprecate, remove later |
| `backend/src/lib/platform/url.ts` | **No change** - Already has all detection |

### Frontend
| File | Action |
|------|--------|
| `frontend/src/hooks/useAppState.ts` | **Modify** - Always call `/api/resolve` |
| `frontend/src/pages/api/resolve.ts` | **No change** - Already proxies to backend |
| `frontend/src/pages/api/resolve-album.ts` | **Remove later** |
| `frontend/src/pages/api/resolve-artist.ts` | **Remove later** |
| `frontend/src/lib/platform/url.ts` | **Modify** - Remove routing exports |

### macOS App
| File | Action |
|------|--------|
| `App/API/MusicCloudAPI.swift` | **No change** - Already calls `/api/resolve` |
| `App/API/ResolveResponse.swift` | **No change** - Already handles all types |
| `App/Manager/ClipboardMonitor.swift` | **Minor** - Add whitespace trimming |

## Checklist

- [ ] Backend: Add content type detection to `/api/v1/resolve`
- [ ] Backend: Dispatch to album/artist resolvers from unified handler
- [ ] Backend: Add `type` field to response
- [ ] Backend: Test with track, album, and artist URLs
- [ ] Frontend: Remove client-side content type routing
- [ ] Frontend: Parse `type` field from response
- [ ] macOS App: Add clipboard whitespace trimming
- [ ] macOS App: Test album and artist URLs
- [ ] Deprecate old `/api/v1/resolve-album` and `/api/v1/resolve-artist`
