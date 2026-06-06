# Bugs! Adapter Runbook

Last reviewed: 2026-06-06

## Purpose

Resolves Bugs! track and album URLs by scraping public `music.bugs.co.kr`
detail pages.

## Auth And Env

No credentials are required.

## Enablement

Manifest default: enabled. Runtime enablement is controlled by
`service_plugins`.

## Resolve Flows

- Track URLs use `/track/<id>`.
- Album URLs use `/album/<id>`.
- Search relies on public Bugs! pages and conservative candidate scoring.

## Operational Notes

The adapter uses a desktop browser User-Agent because Bugs! can return reduced
or blocked content to generic HTTP clients.

## Troubleshooting

- If pages return unexpected HTML, check user-agent handling first.
- If titles normalize poorly, verify Korean/English mixed metadata before
  changing parser rules.

## Verification

- `pnpm --filter @musiccloud/backend test:run bugs`
- `pnpm --filter @musiccloud/backend test:run adapter-urls`
- `pnpm --filter @musiccloud/backend typecheck`

## Maintenance

Review this runbook whenever Bugs! scraping, user-agent handling, album support,
or parser normalization changes.
