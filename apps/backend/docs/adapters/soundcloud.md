# SoundCloud Adapter Runbook

Last reviewed: 2026-06-06

## Purpose

Resolves SoundCloud track, playlist/album-like, and artist URLs through the
internal API plus scraping fallback.

## Auth And Env

No configured credentials are required. The adapter extracts a SoundCloud
`client_id` from public web assets.

## Enablement

Manifest default: enabled. Runtime enablement is controlled by
`service_plugins`.

## Resolve Flows

- Track URLs use `soundcloud.com/<artist>/<slug>`.
- Playlist/set URLs route through album capabilities.
- Artist profile URLs route through artist capabilities.
- Search uses the internal API once a `client_id` is available.

## Operational Notes

The cached `client_id` can expire. A 401 should reset it and trigger a refresh.
The adapter has scraping fallback for direct URL resolution.

## Troubleshooting

- If search fails with auth-like errors, refresh `client_id`.
- If direct URL resolve fails, compare internal API `/resolve` with scraping
  fallback output.

## Verification

- `pnpm --filter @musiccloud/backend test:run soundcloud`
- `pnpm --filter @musiccloud/backend test:run adapter-urls`
- `pnpm --filter @musiccloud/backend typecheck`

## Maintenance

Review this runbook whenever SoundCloud `client_id` extraction, API fallback,
playlist handling, or scraping changes.
