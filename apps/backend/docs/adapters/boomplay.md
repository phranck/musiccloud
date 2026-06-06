# Boomplay Adapter Runbook

Last reviewed: 2026-06-06

## Purpose

Resolves Boomplay track and album URLs by scraping public web-player pages and
Open Graph/JSON-LD metadata.

## Auth And Env

No credentials are required.

## Enablement

Manifest default: enabled. Runtime enablement is controlled by
`service_plugins`.

## Resolve Flows

- Track URLs use `/songs/<id>`.
- Album URLs use `/albums/<id>`.
- Search retrieves candidate IDs and then resolves candidate pages.

## Operational Notes

Search can be noisy. Candidate scoring is important because page metadata can be
minimal or region-dependent.

## Troubleshooting

- If search finds IDs but confidence is low, inspect normalized artist/title
  fields before adjusting thresholds.
- If direct pages fail, inspect Open Graph and JSON-LD extraction.

## Verification

- `pnpm --filter @musiccloud/backend test:run boomplay`
- `pnpm --filter @musiccloud/backend test:run adapter-urls`
- `pnpm --filter @musiccloud/backend typecheck`

## Maintenance

Review this runbook whenever Boomplay scraping, search candidate resolution,
URL parsing, or scoring changes.
