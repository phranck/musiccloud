# Spotify Web API Runbook

Last reviewed: 2026-06-06

## Purpose

Spotify remains active for Spotify URL resolution, cross-service Spotify links,
ISRC lookup, UPC album lookup, direct track/album/artist fetches, and paged
search within Spotify's per-request search cap. It is no longer the primary
resolver source in the plugin registry.

## February 2026 Mitigation

Spotify's February 2026 Web API changes removed `album.label`,
`artist.popularity`, and `artist.followers` from the useful metadata surface.
musiccloud keeps those product features through other sources:

| Product field | Primary source | Fallback |
|---|---|---|
| Album label | Deezer `album.label` | Apple Music `recordLabel` |
| Artist popularity | Last.fm `stats.listeners` | `null` |
| Artist followers | Deezer `nb_fan` | Last.fm `stats.listeners` |
| Track ISRC | Spotify `external_ids.isrc` | Deezer / Apple Music / other ISRC-capable adapters |
| Album UPC | Spotify `external_ids.upc` | Apple Music / Deezer / other UPC-capable adapters |

## Pre-Deploy Verification

Run these checks whenever Spotify publishes API changes or the Spotify adapter
changes. They require a valid app-token in `TOKEN`.

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://api.spotify.com/v1/tracks/2WfaOiMkCvy7F5fcp2zZ8L" \
  | jq '.external_ids'
```

Expected shape:

```json
{ "isrc": "GBUM71505078" }
```

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://api.spotify.com/v1/albums/6dVIqQ8qmQ5GBnJ9shOYGE" \
  | jq '.external_ids'
```

Expected shape:

```json
{ "upc": "<known upc>" }
```

## Local Verification

```bash
pnpm --filter @musiccloud/backend test:run spotify
pnpm --filter @musiccloud/backend test:run artist-info.test.ts artist-fans.test.ts artist-composition
pnpm --filter @musiccloud/backend typecheck
```

## Troubleshooting

- 401 or 403 usually means token/client credential issues.
- If ISRC search misses, check market/catalog restrictions before adjusting
  matching.
- If artist reach numbers disappear, verify Deezer fan-count and Last.fm
  listener calls before changing Spotify code.
- Spotify URL detection is order-independent in the registry.
