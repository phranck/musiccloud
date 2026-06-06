# MusicBrainz Adapter Runbook

Last reviewed: 2026-06-06

## Purpose

MusicBrainz is a metadata-only resolver source. It enriches tracks, albums, and
artists with canonical identifiers such as MBID, ISWC, ISNI, ISRC, and UPC. It
is not a streaming service and is hidden from public playable platform links.

## Auth And Env

No API key is required.

Required operational env:

- `MUSICBRAINZ_CONTACT`

The adapter sends `User-Agent: musiccloud/1.0 ( <contact> )`. The contact must
be a reachable email address or URL.

## Enablement

Manifest default: disabled. Runtime enablement is controlled by
`service_plugins`. The adapter reports available when enabled because the API is
keyless.

## Resolve Flows

- Recording URLs resolve through `/ws/2/recording/<mbid>`.
- Release URLs resolve through `/ws/2/release/<mbid>`.
- Release-group URLs fall back through `/ws/2/release-group/<mbid>`.
- Artist URLs resolve through `/ws/2/artist/<mbid>`.
- ISRC, UPC, track search, album search, and artist search use WS/2 JSON.

## Operational Notes

All MusicBrainz calls go through the local `mbFetch()` helper. That helper
enforces the 1 request per second gate, sets User-Agent and JSON headers, and
retries one transient `503` using `Retry-After`.

Malformed JSON is parsed through `parseMusicBrainzJson()`. Direct ID lookups
throw controlled service errors; search/enrichment lookups return empty results
so the resolver chain can continue.

## Troubleshooting

- `SERVICE_DISABLED`: enable `musicbrainz` in admin or `service_plugins`.
- Repeated `503`: verify every call uses `mbFetch()` and check
  `MUSICBRAINZ_CONTACT`.
- Missing artwork: Cover Art Archive URLs are derived but not probed.
- Missing ISWC: not every MusicBrainz recording relation includes ISWC data.

## Verification

- `pnpm --filter @musiccloud/backend test:run musicbrainz`
- `pnpm --filter @musiccloud/backend test:run external-ids`
- `pnpm --filter @musiccloud/backend test:run url-parser`
- `pnpm --filter @musiccloud/backend typecheck`

## Maintenance

Review this runbook whenever MusicBrainz URL validation, rate limiting, JSON
handling, identifier mapping, enablement, or resolver integration changes.
