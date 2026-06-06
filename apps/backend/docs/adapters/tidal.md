# Tidal Adapter Runbook

Last reviewed: 2026-06-06

## Purpose

Resolves Tidal track, album, and artist URLs through Tidal OpenAPI v2.

## Auth And Env

Required env:

- `TIDAL_CLIENT_ID`
- `TIDAL_CLIENT_SECRET`

## Enablement

Manifest default: enabled. Runtime enablement is controlled by
`service_plugins`. Missing credentials make the adapter unavailable.

## Resolve Flows

- Track URLs support `tidal.com/track` and `listen.tidal.com` variants.
- Album and artist support use optional capability paths.
- Search uses Tidal OpenAPI JSON:API responses.

## Operational Notes

Tidal OpenAPI v2 returns JSON:API shaped responses. Keep `data` and `included`
resource handling explicit. Album artwork can require URL derivation because
some API resources omit image links.

## Troubleshooting

- Auth errors point first to client credentials.
- If mappings break, inspect JSON:API relationship/included resources.
- If album artwork disappears, verify derivation rules.

## Verification

- `pnpm --filter @musiccloud/backend test:run tidal`
- `pnpm --filter @musiccloud/backend test:run adapter-urls`
- `pnpm --filter @musiccloud/backend typecheck`

## Maintenance

Review this runbook whenever Tidal auth, JSON:API mapping, artwork derivation,
URL parsing, or search changes.
