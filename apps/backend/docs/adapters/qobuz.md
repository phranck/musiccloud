# Qobuz Adapter Runbook

Last reviewed: 2026-06-06

## Purpose

Resolves Qobuz track, album, and artist URLs through the Qobuz API.

## Auth And Env

Required env:

- `QOBUZ_EMAIL`
- `QOBUZ_PASSWORD`

Optional env:

- `QOBUZ_APP_ID`

## Enablement

Manifest default: enabled. Runtime enablement is controlled by
`service_plugins`. Missing credentials make the adapter unavailable.

## Resolve Flows

- Track and album URLs use Qobuz ids.
- Artist URLs use artist capability paths.
- Search and ISRC/UPC fallback use authenticated API calls.

## Operational Notes

The adapter logs in and caches token state. A 401 can require token refresh and
retry. Keep user-agent and app-id behaviour aligned with the adapter.

## Troubleshooting

- Auth errors usually mean credentials, app id, or token-refresh issues.
- Geo/catalog misses can be valid Qobuz behaviour.
- If every lookup fails after login, inspect request headers and API status.

## Verification

- `pnpm --filter @musiccloud/backend test:run qobuz`
- `pnpm --filter @musiccloud/backend test:run adapter-urls`
- `pnpm --filter @musiccloud/backend typecheck`

## Maintenance

Review this runbook whenever Qobuz login, token refresh, app id, URL parsing, or
API mapping changes.
