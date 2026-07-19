# Apple Music Adapter Runbook

Last reviewed: 2026-06-06

## Purpose

Resolves Apple Music track, album, and artist URLs through the Apple Music API.
It is one of the primary cross-service sources because it provides ISRC and UPC
metadata plus broad catalog coverage.

## Auth And Env

Use one existing developer-token profile:

- Static development token: `APPLE_MUSIC_TOKEN`.
- Signed profile: `APPLE_MUSIC_KEY_ID`, `APPLE_MUSIC_TEAM_ID`, and
  `APPLE_MUSIC_PRIVATE_KEY` together.

The adapter signs and caches an Apple developer JWT for the signed profile.
Keep key rotation coordinated with Zerops env updates and local `.env.local`.
Neither profile's value belongs in logs, run notes, issue comments, or example
commands.

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

### Crawler source

`apple-music-charts` reuses the adapter's token cache, JWT generation, timeout,
and authenticated request helper. It is a separate crawler source and remains
disabled by default in every environment, including environments with valid
Apple credentials.

Its exact config is:

```json
{ "storefront": "us", "chart": "most-played", "type": "songs", "limit": 100 }
```

The source accepts one lower-case two-letter storefront, `most-played` song
charts only, and a limit from 1 through 100. Enabling, run-now, and the
heartbeat validate the static or signed developer-token profile before making a
catalog request. A malformed signing profile therefore fails safely before
network work; chart HTTP, timeout, token, catalog, or response-shape errors
become failed crawler runs and participate in the existing five-consecutive-
failure auto-disable policy.

To recover, correct the profile or config, explicitly enable the source in the
crawler admin API, and use run-now. A successful tick resets the consecutive
error counter. Incomplete chart rows are skipped; only valid Apple Music song
URLs with optional ISRC values reach the shared resolver and persistence path.

## Troubleshooting

- Auth failures usually mean a bad private key, team id, key id, or expired
developer-token generation path.
- Region-specific misses can be valid catalog gaps.
- Treat 401/403 as credential/configuration issues before debugging resolver
matching.
- Inspect crawler run history for safe failure counts and notes. Do not add
  authorization headers, tokens, JWTs, private keys, or upstream payloads to
  diagnostic output.

## Verification

- `pnpm --filter @musiccloud/backend test:run apple-music`
- `pnpm --filter @musiccloud/backend test:run adapter-urls`
- `pnpm --filter @musiccloud/backend typecheck`

## Maintenance

Review this runbook whenever Apple Music adapter auth, storefront parsing,
search strategy, environment variables, or error handling changes.
