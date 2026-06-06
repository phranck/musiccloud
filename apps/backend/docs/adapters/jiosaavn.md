# JioSaavn Adapter Runbook

Last reviewed: 2026-06-06

## Purpose

Resolves JioSaavn song, album, and artist URLs through public JioSaavn
endpoints and response parsing.

## Auth And Env

No credentials are required.

## Enablement

Manifest default: enabled. Runtime enablement is controlled by
`service_plugins`.

## Resolve Flows

- Song URLs are parsed from public JioSaavn paths.
- Album and artist support use adapter optional capability paths.
- Search uses public endpoints that can return either JSON or HTML error
  pages.

## Operational Notes

The API can return non-JSON during maintenance, geo blocking, or throttling.
Parsing must stay defensive.

## Troubleshooting

- If parsing fails, capture whether the upstream body is JSON or HTML.
- If search returns empty but direct URL works, inspect autocomplete/search
  endpoint behaviour separately.

## Verification

- `pnpm --filter @musiccloud/backend test:run jiosaavn`
- `pnpm --filter @musiccloud/backend test:run adapter-urls`
- `pnpm --filter @musiccloud/backend typecheck`

## Maintenance

Review this runbook whenever JioSaavn parsing, HTML fallback handling, URL
detection, or search behaviour changes.
