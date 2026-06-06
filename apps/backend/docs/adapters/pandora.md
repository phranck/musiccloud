# Pandora Adapter Runbook

Last reviewed: 2026-06-06

## Purpose

Resolves Pandora track URLs and searches through a hybrid of page scraping and
Pandora internal search API calls.

## Auth And Env

No configured credentials are required. The adapter fetches and caches a CSRF
token from Pandora pages.

## Enablement

Manifest default: enabled. Runtime enablement is controlled by
`service_plugins`.

## Resolve Flows

- Track URLs preserve the path after `/artist/`.
- Direct track lookup can scrape page metadata.
- Search uses the internal API with cached CSRF token and cookie headers.

## Operational Notes

The CSRF token is cached and coalesced. Token acquisition failures make search
unavailable until refreshed.

## Troubleshooting

- `No CSRF token available`: inspect `fetchCsrfToken()` and Pandora page
  cookies.
- If search fails but direct URL scraping works, debug CSRF and internal API
  headers separately.

## Verification

- `pnpm --filter @musiccloud/backend test:run pandora`
- `pnpm --filter @musiccloud/backend test:run adapter-urls`
- `pnpm --filter @musiccloud/backend typecheck`

## Maintenance

Review this runbook whenever Pandora CSRF handling, scraping, search payloads,
or URL parsing changes.
