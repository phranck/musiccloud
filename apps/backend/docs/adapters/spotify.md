# Spotify Adapter Runbook

Last reviewed: 2026-06-06

## Purpose

Resolves Spotify track, album, and artist URLs through the Spotify Web API.
Spotify remains important for URL detection and cross-service links, but it is
not the first resolver source in the registry order.

## Auth And Env

Required env:

- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`

## Enablement

Manifest default: enabled. Runtime enablement is controlled by
`service_plugins`. Missing credentials make the adapter unavailable.

## Resolve Flows

- Track URLs support standard and `intl-xx` paths.
- Album URLs use album capability paths.
- Artist URLs use artist capability paths.
- ISRC lookup and search use Web API search endpoints.

## Operational Notes

Spotify preview URLs can expire and should not be preferred over stable Deezer
previews. Keep token handling centralized through the adapter helper.

## Troubleshooting

- 401/403 usually means token/client credential issues.
- If ISRC search misses, check market/catalog restrictions before adjusting
  matching.
- Spotify URL detection is order-independent in the registry.

## Verification

- `pnpm --filter @musiccloud/backend test:run spotify`
- `pnpm --filter @musiccloud/backend test:run adapter-urls`
- `pnpm --filter @musiccloud/backend typecheck`

## Maintenance

Review this runbook whenever Spotify auth, URL parsing, market assumptions,
preview handling, or search strategy changes.
