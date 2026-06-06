# QQ Music Adapter Runbook

Last reviewed: 2026-06-06

## Purpose

Resolves QQ Music track and album URLs through Tencent/QQ Music public internal
API endpoints.

## Auth And Env

No credentials are required.

## Enablement

Manifest default: enabled. Runtime enablement is controlled by
`service_plugins`.

## Resolve Flows

- Track URLs use QQ song mids.
- Album URLs use album mids.
- Search calls `u.y.qq.com/cgi-bin/musicu.fcg` with browser-like headers.

## Operational Notes

Artwork is derived from QQ image URL conventions when the API omits a direct
image URL.

## Troubleshooting

- If direct detail lookup is weak, verify whether search-by-mid fallback still
  returns the item.
- If images break, inspect URL-template assumptions before changing resolver
  logic.

## Verification

- `pnpm --filter @musiccloud/backend test:run qqmusic`
- `pnpm --filter @musiccloud/backend test:run adapter-urls`
- `pnpm --filter @musiccloud/backend typecheck`

## Maintenance

Review this runbook whenever QQ Music internal API payloads, artwork templates,
URL parsing, or search fallback changes.
