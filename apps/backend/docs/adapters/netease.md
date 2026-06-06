# NetEase Cloud Music Adapter Runbook

Last reviewed: 2026-06-06

## Purpose

Resolves NetEase Cloud Music track, album, and artist URLs through internal
NetEase web endpoints.

## Auth And Env

No credentials are required.

## Enablement

Manifest default: enabled. Runtime enablement is controlled by
`service_plugins`.

## Resolve Flows

- Track URLs use `music.163.com` song ids.
- Album and artist support use optional adapter capability paths.
- Search uses internal web API endpoints with browser-like headers.

## Operational Notes

NetEase is an internal-API adapter. Endpoint shape, required headers, or geo
behaviour can change without notice.

## Troubleshooting

- If API responses fail, inspect status and body before changing parsing.
- If direct URL parsing fails, verify `#/song?id=` and `song?id=` variants.

## Verification

- `pnpm --filter @musiccloud/backend test:run netease`
- `pnpm --filter @musiccloud/backend test:run adapter-urls`
- `pnpm --filter @musiccloud/backend typecheck`

## Maintenance

Review this runbook whenever NetEase internal API requests, headers, URL
normalization, or parser handling changes.
