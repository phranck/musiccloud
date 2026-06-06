# Beatport Adapter Runbook

Last reviewed: 2026-06-06

## Purpose

Resolves Beatport track and release URLs by scraping the public Next.js
`__NEXT_DATA__` payload.

## Auth And Env

No credentials are required.

## Enablement

Manifest default: enabled. Runtime enablement is controlled by
`service_plugins`.

## Resolve Flows

- Track URLs use `/track/...`.
- Release URLs route through album capabilities.
- Search parses Beatport result pages and embedded Next.js state.

## Operational Notes

Beatport is markup-coupled. A Beatport redesign or Next.js data shape change can
break both direct URL and search flows.

## Troubleshooting

- 403 or missing `__NEXT_DATA__` usually means the scraper path needs review.
- If release pages fail, inspect album-capability paths separately from track
  paths.

## Verification

- `pnpm --filter @musiccloud/backend test:run beatport`
- `pnpm --filter @musiccloud/backend test:run adapter-urls`
- `pnpm --filter @musiccloud/backend typecheck`

## Maintenance

Review this runbook whenever Beatport page parsing, user-agent handling, release
support, or matching changes.
