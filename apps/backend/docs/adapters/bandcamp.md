# Bandcamp Adapter Runbook

Last reviewed: 2026-11-18

## Purpose

Resolves Bandcamp track and album URLs by scraping public Bandcamp pages and their embedded JSON metadata.

## Auth And Env

No credentials are required. The backend needs the `curl` executable, which the `alpine/nodejs` base image in `zerops.yml` provides.

## Enablement

Manifest default: enabled. Runtime enablement is controlled by `service_plugins`.

## Resolve Flows

- Track URLs use `{artist}.bandcamp.com/track/...`.
- Album URLs use `{artist}.bandcamp.com/album/...`.
- Search uses Bandcamp's fuzzysearch JSON endpoint, then reads each candidate's page.

## Requests

Bandcamp's CDN answers requests from Node's HTTP stack with a JavaScript "Client Challenge" page instead of the content, whatever the headers. Every Bandcamp request therefore goes through `curl`, in `src/services/plugins/bandcamp/transport.ts`. The transport only contacts `https://bandcamp.com` and its subdomains, follows redirects only within those hosts, and bounds each request's time and size.

A request that meets the challenge anyway, or that `curl` cannot complete, is reported as Bandcamp being unavailable with `MC-API-8201`, never as "not found" (`MC-API-8204`). A "not found" makes the resolver skip Bandcamp for that item.

## Labels That Name Their Bands In The Title

Some labels publish their bands' releases on the label's own account and name each one `Band - Title`, while every structured field on the page names the label as the artist. When a release title reads that way, names an artist other than the account, and the page names the account as the artist, the adapter reads the account's release titles from Bandcamp's `band_details` app endpoint. If the account has at least 5 releases and at least 80 % of them name another artist as `Band - Title`, the release resolves as `Title` by `Band`, and a track takes its band from its album title. The rule lives in `src/services/plugins/bandcamp/label-credits.ts`. A failed lookup keeps the page's data and logs `"operation":"bandcamp_account_releases"`.

## Operational Notes

Bandcamp is scraping-based. The adapter can break when page markup or embedded metadata changes, or when the CDN starts challenging `curl` as well. Keep confidence thresholds conservative because cover tracks and remixes are common.

## Troubleshooting

- If every Bandcamp link fails with `MC-API-8201`, search the backend logs for `"operation":"bandcamp_request"`. The `outcome` field says what happened: `client_challenge`, `curl_failed`, `redirect_limit` or `blocked_target`.
- If direct URLs fail with `MC-API-8204`, Bandcamp answered without the page's JSON-LD. Inspect the embedded page metadata first.
- If many remixes are matched, adjust scoring or candidate filtering, not broad URL regexes.

## Verification

```bash
pnpm --filter @musiccloud/backend test:run bandcamp
```

```bash
pnpm --filter @musiccloud/backend test:run adapter-urls
```

```bash
pnpm --filter @musiccloud/backend typecheck
```

## Maintenance

Review this runbook whenever Bandcamp scraping, the transport, search parsing, URL detection, or matching thresholds change.
