# Audiomack Adapter Runbook

Last reviewed: 2026-06-06

## Purpose

Resolves Audiomack song and album URLs using public search APIs and page
metadata scraping. It is a keyless, best-effort adapter.

## Auth And Env

No credentials are required.

## Enablement

Manifest default: enabled. Runtime enablement is controlled by
`service_plugins`.

## Resolve Flows

- Song and album URLs are parsed from public Audiomack paths.
- Search uses public endpoints where possible.
- Direct URL lookups may scrape Open Graph/page metadata because the public
  API does not expose every slug lookup needed by the resolver.

## Operational Notes

The adapter does not provide previews. It should not be used as a preview
source. HTML/page changes can break direct lookups.

## Troubleshooting

- If direct URL resolve fails but search works, inspect the page metadata
  parser first.
- If search returns unrelated results, check confidence scoring before changing
  URL parsing.

## Verification

- `pnpm --filter @musiccloud/backend test:run audiomack`
- `pnpm --filter @musiccloud/backend test:run adapter-urls`
- `pnpm --filter @musiccloud/backend typecheck`

## Maintenance

Review this runbook whenever Audiomack URL parsing, scraping, search, preview
capability, or error handling changes.
