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
instead. Strategy is declarative in `services/artist-composition/strategy.ts`
for fields aggregated through the composition layer.

| Field | Spotify pre-Feb-2026 | Primary | Secondary | Strategy source |
| --- | --- | --- | --- | --- |
| `track.isrc` | `external_ids.isrc` (reverted) | Spotify (reverted) | Deezer `track.isrc`, Apple Music ISRC | resolver-pipeline |
| `album.upc` | `external_ids.upc` (reverted) | Spotify (reverted) | Deezer `album.upc`, Apple Music UPC | resolver-pipeline |
| `album.label` | `raw.label` | Deezer `album.label` (`deezer/adapter.ts`) | Apple Music `attrs.recordLabel` (`apple-music/adapter.ts`) | resolver-pipeline |
| `artist.imageUrl` | `images[0].url` | Deezer `picture_xl` (`plugins/deezer/artist-image.ts`) | Spotify (`artist-composition/sources/spotify-source.ts`) | composition-layer |
| `artist.genres` | `raw.genres` | Spotify `artist.genres` | Last.fm `artist.getTopTags` (filtered) | composition-layer |
| `artist.popularity` | `raw.popularity` (0–100) | Last.fm `stats.listeners` | — (UI shows null) | composition-layer |
| `artist.followers` | `raw.followers.total` | Deezer `nb_fan` (`plugins/deezer/artist-fans.ts`) | Last.fm `stats.listeners` (scale-different surrogate) | composition-layer |
| `artist.bioSummary` | — | Last.fm `artist.bio.summary` | — | composition-layer |
| `artist.scrobbles` | — | Last.fm `stats.playcount` | — | composition-layer |
| `artist.similarArtists` | — | Last.fm `similar.artist[]` | — | composition-layer |
| `artist.topTracks` | `/artists/{id}/top-tracks` (REMOVED) | Deezer `/artist/{id}/top` (`plugins/deezer/artist-top-tracks.ts`) | Last.fm `artist.getTopTracks` | composition-layer |
| `track` (regional 404) | `linked_from` (REMOVED) | Spotify oEmbed (`plugins/spotify/oembed.ts`) — Title+Artist only | Cross-service search via Title+Artist | adapter-fallback |

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

The musiccloud Spotify client ID currently runs in **Dev Mode** (no
Extended Quota). All Feb-2026 restrictions therefore apply with full
weight. The owner account is Premium (verified 2026-04-29). Migration
to Extended Quota Mode is operational, not code, and tracked
separately.

## Permanently-removed endpoints / fields

The composition layer routes around these; do not add new code that
depends on them.

- `GET /artists/{id}/top-tracks` — removed Feb-2026. Code path is
  gone; `services/artist-info.ts::fetchArtistTopTracks` uses Deezer
  primary, Last.fm fallback.
- `Track.linked_from` — removed Feb-2026. Spotify track-by-ID returns
  404 for regionally-unavailable tracks. Adapter falls through to
  oEmbed (`plugins/spotify/oembed.ts`) and emits a minimal
  `NormalizedTrack` so the resolver can cross-service-search by
  Title+Artist.
- `artist.popularity`, `artist.followers` on `/artists/{id}` — see
  fallback matrix above.

## Pre-deploy environment checks

- `SPOTIFY_CLIENT_ID` + `SPOTIFY_CLIENT_SECRET` — required for all
  Spotify-touching pipelines. Without these, composition layer drops
  the Spotify source silently and leaves the field gap to be filled
  by other sources.
- `LASTFM_API_KEY` — required for `popularity`, `bioSummary`,
  `scrobbles`, `similarArtists`, and as `topTracks` fallback when
  Deezer misses. Without it the profile still renders, but those
  fields are null.
- Bandsintown / Ticketmaster keys — independent path
  (`fetchArtistEvents`); not a composition source.
