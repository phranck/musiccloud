# Bandcamp Adapter Runbook

Last reviewed: 2026-06-06

## Purpose

Resolves Bandcamp track and album URLs by scraping public Bandcamp pages and
their embedded JSON metadata.

## Auth And Env

No credentials are required.

## Enablement

Manifest default: enabled. Runtime enablement is controlled by
`service_plugins`.

## Resolve Flows

- Track URLs use `{artist}.bandcamp.com/track/...`.
- Album URLs use `{artist}.bandcamp.com/album/...`.
- Search and fallback paths parse public page/search results.

## Operational Notes

Bandcamp is scraping-based. The adapter can break when page markup or embedded
metadata changes. Keep confidence thresholds conservative because cover tracks
and remixes are common.

## Troubleshooting

- If direct URLs fail, inspect embedded page metadata first.
- If many remixes are matched, adjust scoring or candidate filtering, not broad
  URL regexes.

## Verification

- `pnpm --filter @musiccloud/backend test:run bandcamp`
- `pnpm --filter @musiccloud/backend test:run adapter-urls`
- `pnpm --filter @musiccloud/backend typecheck`

## Maintenance

Review this runbook whenever Bandcamp scraping, search parsing, URL detection,
or matching thresholds change.
