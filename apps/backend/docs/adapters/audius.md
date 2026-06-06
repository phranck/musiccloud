# Audius Adapter Runbook

Last reviewed: 2026-06-06

## Purpose

Resolves Audius track and album-like playlist URLs through the public Audius
discovery API.

## Auth And Env

No credentials are required. Requests include the adapter app-name parameter
expected by the public API.

## Enablement

Manifest default: enabled. Runtime enablement is controlled by
`service_plugins`.

## Resolve Flows

- Track URLs are parsed from Audius artist/slug paths.
- Album support is implemented through playlist-like responses because Audius
  albums share URL structure with tracks.
- Search uses the public discovery API.

## Operational Notes

Track and album URL shapes overlap. The adapter relies on API response shape to
decide how to normalize a result.

## Troubleshooting

- If a URL resolves as the wrong entity type, inspect the Audius API response
  before changing regexes.
- If the public API changes app-name requirements, update the fetch helper and
  this runbook together.

## Verification

- `pnpm --filter @musiccloud/backend test:run audius`
- `pnpm --filter @musiccloud/backend test:run adapter-urls`
- `pnpm --filter @musiccloud/backend typecheck`

## Maintenance

Review this runbook whenever Audius API parameters, URL parsing, album
detection, or error handling changes.
