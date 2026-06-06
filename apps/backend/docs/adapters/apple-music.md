# Apple Music Adapter Runbook

Last reviewed: 2026-06-06

## Purpose

Resolves Apple Music track, album, and artist URLs through the Apple Music API.
It is one of the primary cross-service sources because it provides ISRC and UPC
metadata plus broad catalog coverage.

## Auth And Env

Required env:

- `APPLE_MUSIC_KEY_ID`
- `APPLE_MUSIC_TEAM_ID`
- `APPLE_MUSIC_PRIVATE_KEY`

The adapter signs an Apple developer JWT. Keep key rotation coordinated with
Zerops env updates and local `.env.local`.

## Enablement

Manifest default: enabled. Runtime enablement is controlled by
`service_plugins`. Missing credentials make the adapter unavailable even when
the plugin toggle is enabled.

## Resolve Flows

- Track URL detection preserves the storefront and track id.
- Album URL detection supports album pages without a track `i` parameter.
- Artist URL detection supports storefront artist pages.
- Search uses Apple Music catalog search against the relevant storefront.

## Operational Notes

Apple storefront matters. Do not drop the country/storefront prefix during URL
parsing, because the API request must target the same regional catalog.

## Troubleshooting

- Auth failures usually mean a bad private key, team id, key id, or expired
developer-token generation path.
- Region-specific misses can be valid catalog gaps.
- Treat 401/403 as credential/configuration issues before debugging resolver
matching.

## Verification

- `pnpm --filter @musiccloud/backend test:run apple-music`
- `pnpm --filter @musiccloud/backend test:run adapter-urls`
- `pnpm --filter @musiccloud/backend typecheck`

## Maintenance

Review this runbook whenever Apple Music adapter auth, storefront parsing,
search strategy, environment variables, or error handling changes.
