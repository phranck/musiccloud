# KKBOX Adapter Runbook

Last reviewed: 2026-06-06

## Purpose

Resolves KKBOX track, album, and artist URLs through the KKBOX Open API.

## Auth And Env

Required env:

- `KKBOX_CLIENT_ID`
- `KKBOX_CLIENT_SECRET`

Optional env:

- `KKBOX_TERRITORY`

## Enablement

Manifest default: enabled. Runtime enablement is controlled by
`service_plugins`. Missing required credentials make the adapter unavailable.

## Resolve Flows

- Track, album, and artist URL ids are resolved through the API.
- Album details may require a separate track-listing call.
- Search targets the configured territory.

## Operational Notes

Territory affects catalog availability and URLs. Preserve or document territory
changes carefully.

## Troubleshooting

- Auth failures usually indicate client credentials or token exchange issues.
- Territory-specific misses are not automatically adapter bugs.
- If album track listing fails, the adapter should tolerate it and still return
  album metadata where possible.

## Verification

- `pnpm --filter @musiccloud/backend test:run kkbox`
- `pnpm --filter @musiccloud/backend test:run adapter-urls`
- `pnpm --filter @musiccloud/backend typecheck`

## Maintenance

Review this runbook whenever KKBOX auth, territory handling, album track
listing, or API mapping changes.
