# MusicBrainz Adapter Runbook

Last reviewed: 2026-10-12

## Purpose

MusicBrainz is a metadata-only resolver source. It enriches tracks, albums, and artists with canonical identifiers such as MBID, ISWC, ISNI, ISRC, and UPC. It is not a streaming service and is hidden from public playable platform links.

It is also the source of artist lifecycle dates and band memberships, which the artist identity enrichment records. See [Artist identity enrichment](#artist-identity-enrichment).

## Auth And Env

No API key is required.

Required operational env:

- `MUSICBRAINZ_CONTACT`

The adapter sends `User-Agent: musiccloud/1.0 ( <contact> )`. The contact must be a reachable email address or URL.

## Enablement

Manifest default: disabled. Runtime enablement is controlled by `service_plugins`. The adapter reports available when enabled because the API is keyless.

The switch governs MusicBrainz as a resolver source only. The identity enrichment runs from the backend's cron whatever the switch says, and removing its crontab entry in `zerops.yml` is what stops it.

## Resolve Flows

- Recording URLs resolve through `/ws/2/recording/<mbid>`.
- Release URLs resolve through `/ws/2/release/<mbid>`.
- Release-group URLs fall back through `/ws/2/release-group/<mbid>`.
- Artist URLs resolve through `/ws/2/artist/<mbid>`.
- ISRC, UPC, track search, album search, and artist search use WS/2 JSON.

## Artist Identity Enrichment

`dist/scripts/artist-identity-enrichment.js` runs every ten minutes from the backend's Zerops crontab. Each run checks one batch of artist entities and records their type, their lifecycle dates (birth and death for a person, formation and disbanding for a group) and their band memberships.

An entity is checked when it is a catalog artist with a profile, or one band membership away from one. It is identified exactly or not at all: by the MusicBrainz id it already carries, or by its Spotify or Deezer artist page through `/ws/2/url?resource=<page>&inc=artist-rels`. There is no search by name. The artist itself comes from `/ws/2/artist/<mbid>?inc=artist-rels`.

Each check is recorded in `artist_identity_checks`. A check holds for 90 days and a failed one is retried after a day. The batch size and both ages are constants in `services/artist-identity/enrich.ts`.

A refetch replaces what MusicBrainz said before, so dates and memberships never appear twice. MusicBrainz lists one relation per instrument, and relations to the same band over the same years become one membership with every role.

The keyed operations `GET /api/v1/artists/events`, `GET /api/v1/artists/{artistEntityId}/members` and `GET /api/v1/artists/{artistEntityId}/memberships` publish these dates and memberships. They leave out the source, its URL and its confidence, and `services/artist-identity/public.ts` builds their answers.

## Operational Notes

Every MusicBrainz call, the adapter's and the enrichment's, goes through `mbFetch()`. That helper enforces the 1 request per second gate, sets User-Agent and JSON headers, and retries one transient `503` using `Retry-After`.

Malformed JSON is parsed through `parseMusicBrainzJson()`. Direct ID lookups throw controlled service errors. Search lookups return empty results so the resolver chain can continue.

## Troubleshooting

- `SERVICE_DISABLED`: enable `musicbrainz` in admin or `service_plugins`.
- Repeated `503`: verify every call uses `mbFetch()` and check `MUSICBRAINZ_CONTACT`.
- Missing artwork: Cover Art Archive URLs are derived but not probed.
- Missing ISWC: not every MusicBrainz recording relation includes ISWC data.
- An artist without lifecycle dates: its check in `artist_identity_checks` says whether MusicBrainz did not know its pages (`no_match`), another catalog artist already holds its MusicBrainz id (`conflict`), or the request failed (`failed`, logged with the artist's entity id).

## Verification

- `pnpm --filter @musiccloud/backend test:run musicbrainz`
- `pnpm --filter @musiccloud/backend test:run artist-identity`
- `pnpm --filter @musiccloud/backend test:run external-ids`
- `pnpm --filter @musiccloud/backend test:run url-parser`
- `pnpm --filter @musiccloud/backend typecheck`

## Maintenance

Review this runbook whenever MusicBrainz URL validation, rate limiting, JSON handling, identifier mapping, enablement, resolver integration, or the identity enrichment changes.
