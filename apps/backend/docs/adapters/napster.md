# Napster Adapter Runbook

Last reviewed: 2026-06-06

## Purpose

Resolves Napster track and artist URLs through the Napster v2.2 API.

## Auth And Env

Required env:

- `NAPSTER_API_KEY`

## Enablement

Manifest default: enabled. Runtime enablement is controlled by
`service_plugins`. Missing `NAPSTER_API_KEY` makes the adapter unavailable.

## Resolve Flows

- Track API ids beginning with `tra.` resolve directly.
- Slug-only track URLs cannot be deterministically converted to API ids.
- Artist paths use artist capabilities.

## Operational Notes

Napster has no slug-to-id endpoint for arbitrary track slugs. Avoid adding
guessy slug matching that can return the wrong track.

## Troubleshooting

- If all calls fail, verify the API key first.
- If slug URLs fail, confirm whether the URL contains a usable API id before
  changing adapter logic.

## Verification

- `pnpm --filter @musiccloud/backend test:run napster`
- `pnpm --filter @musiccloud/backend test:run adapter-urls`
- `pnpm --filter @musiccloud/backend typecheck`

## Maintenance

Review this runbook whenever Napster API-key handling, URL parsing, artist
support, or fallback behaviour changes.
