# Deezer Adapter Runbook

Last reviewed: 2026-06-06

## Purpose

Resolves Deezer track, album, and artist URLs through the public Deezer API.
Deezer is a primary resolver source because it is keyless, supports ISRC, and
provides stable preview URLs.

## Auth And Env

No credentials are required.

## Enablement

Manifest default: enabled. Runtime enablement is controlled by
`service_plugins`.

## Resolve Flows

- Track URLs use Deezer track ids.
- Album URLs use Deezer album ids.
- Artist URLs use Deezer artist ids.
- ISRC lookups and search go through the public API.

## Operational Notes

The resolver often prefers Deezer previews because they are more stable than
many other providers' preview URLs.

## Troubleshooting

- If preview playback fails, inspect Deezer preview refresh and cache expiry
  paths.
- If public API responses include an `error` object, treat it as an upstream
  lookup miss or service issue depending on status.

## Verification

- `pnpm --filter @musiccloud/backend test:run deezer`
- `pnpm --filter @musiccloud/backend test:run adapter-urls`
- `pnpm --filter @musiccloud/backend typecheck`

## Maintenance

Review this runbook whenever Deezer API mapping, preview handling, ISRC lookup,
or resolver priority changes.
