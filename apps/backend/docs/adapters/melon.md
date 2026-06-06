# Melon Adapter Runbook

Last reviewed: 2026-06-06

## Purpose

Resolves Melon track and album URLs by scraping public Melon detail pages.

## Auth And Env

No credentials are required.

## Enablement

Manifest default: enabled. Runtime enablement is controlled by
`service_plugins`.

## Resolve Flows

- Track URLs use Melon song detail pages.
- Album URLs use Melon album detail pages.
- Search parses public Melon result pages and candidate ids.

## Operational Notes

Melon pages can be locale/markup sensitive. Treat low-confidence search matches
carefully.

## Troubleshooting

- If search candidates have `Unknown Artist`, inspect the detail-page parser.
- If direct URLs fail, check desktop user-agent and HTML selectors.

## Verification

- `pnpm --filter @musiccloud/backend test:run melon`
- `pnpm --filter @musiccloud/backend test:run adapter-urls`
- `pnpm --filter @musiccloud/backend typecheck`

## Maintenance

Review this runbook whenever Melon scraping, URL parsing, album support, or
candidate scoring changes.
