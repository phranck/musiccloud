# Spotify Web API runbook

Operational notes for the Spotify adapter post Feb-2026 changes.

## Pre-deploy verification

Run these against staging (or a Spotify dev token) before each release
that touches the Spotify adapter, and **after every Spotify changelog
entry** that mentions endpoint or field changes.

The `external_ids` block on `/tracks/{id}` and `/albums/{id}` was
*reverted* in March 2026 — both ISRC and UPC are expected to come
back. If a verification call returns no `external_ids`, treat it as
a regression and surface a fallback path immediately (Deezer + Apple
Music both still expose ISRC/UPC).

```bash
TOKEN=<your spotify access token>

# 1. ISRC on a known track (Daft Punk — One More Time)
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://api.spotify.com/v1/tracks/0DiWol3AO6WpXZgp0goxAV" \
  | jq '.external_ids'
# expected: { "isrc": "GBDUW0000059" }

# 2. UPC on a known album (Daft Punk — Discovery)
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://api.spotify.com/v1/albums/2noRn2Aes5aoNVsU6iWThc" \
  | jq '.external_ids'
# expected: { "upc": "<UPC string>" }

# 3. /search limit cap (must accept up to 10, reject >10)
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://api.spotify.com/v1/search?type=track&q=daft%20punk&limit=10" \
  | jq '.tracks.items | length'
# expected: 10

# 4. Confirm the permanently-removed fields stay removed.
#    These should NOT appear on the artist payload.
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://api.spotify.com/v1/artists/4tZwfgrHOc3mvqYlEYSvVi" \
  | jq '{popularity, followers}'
# expected: { "popularity": null, "followers": null }
# If either field returns a value, Spotify reverted further — note
# the date and reconsider whether to re-prefer Spotify in the
# resolver chain.
```

## Fallback matrix

What the adapter no longer guarantees, and where the value comes from
instead.

| Field | Spotify pre-Feb-2026 | Primary replacement | Secondary replacement |
| --- | --- | --- | --- |
| `track.isrc` | `external_ids.isrc` (reverted) | Spotify (reverted) | Deezer `track.isrc`, Apple Music ISRC |
| `album.upc` | `external_ids.upc` (reverted) | Spotify (reverted) | Deezer `album.upc`, Apple Music UPC |
| `album.label` | `raw.label` | Deezer `album.label` (`deezer/adapter.ts`) | Apple Music `attrs.recordLabel` (`apple-music/adapter.ts`) |
| `artist.popularity` | `raw.popularity` (0–100) | Last.fm `stats.listeners` | — (UI shows null) |
| `artist.followers` | `raw.followers.total` | Deezer `nb_fan` (`deezer/artist-fans.ts`) | Last.fm `stats.listeners` (different scale; UI must label source) |

## Resolver chain order

`apps/backend/src/services/plugins/registry.ts` defines `PLUGINS`. The
post-Feb-2026 order is:

```
deezerPlugin, appleMusicPlugin, tidalPlugin, youtubePlugin, spotifyPlugin, …
```

Spotify is intentionally last in the major-adapter block. It stays
wired up for:

- Spotify URL detection (`identifyService` matches by `detectUrl`,
  order-independent)
- Cross-service Spotify links emitted by any other resolver hit
- Last-fallback ISRC lookup if earlier adapters miss

## Caps

- `MAX_CANDIDATES` is asserted at module load to stay
  ≤ `SPOTIFY_SEARCH_LIMIT_MAX` (10). If you bump `MAX_CANDIDATES` past
  10, the backend refuses to start.
- `/search` calls in `spotify/adapter.ts` use the 1/5/10 ladder; all
  within the cap.

## Dev-mode constraints (non-code, organisational)

The Feb-2026 dev-mode tightening (1 client ID per dev, max 5
authorised users, Spotify Premium required) is out of scope for the
backend code, but coordinate with QA/test accounts before each
Spotify-touching release.
