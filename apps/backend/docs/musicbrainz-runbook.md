# MusicBrainz adapter runbook

Operational notes for the MusicBrainz adapter
(`apps/backend/src/services/plugins/musicbrainz/`).

## Why this adapter exists

MusicBrainz is the only platform-independent canonical-identity
source. It is **not** a streaming target: the adapter exists to
harvest MBIDs (recording / release / artist), ISWC (composition), and
ISNI (artist) into the `*_external_ids` aggregation tables introduced
by Phase A. Cross-service links to `musicbrainz.org` are emitted but
hidden from the public share UI via the `hidden: true` flag in
`PLATFORM_CONFIG`.

## Toggling on / off

The plugin defaults to **disabled** (`defaultEnabled: false` in
`services/plugins/musicbrainz/index.ts`). Enable it via the admin UI
once env config is in place:

1. Set `MUSICBRAINZ_CONTACT` to a real contact email (defaults to
   `musiccloud@layered.work`). The adapter uses it to build the
   mandatory `User-Agent` for every API call.
2. In the dashboard, navigate to *Services* → MusicBrainz, toggle on.
3. Confirm via `GET /api/admin/plugins` that `enabled: true` and
   `id: "musicbrainz"` are returned.

When in doubt, disable. The pipeline keeps running without it (other
adapters provide ISRC / UPC); the only loss is MBID coverage in the
aggregation table.

## Rate limit

MusicBrainz enforces **1 req/s** for unauthenticated callers. The
adapter serialises every outgoing request through
`acquireMusicBrainzSlot()` (in `./rate-limit.ts`), which releases one
slot every 1100 ms. This is intentional headroom: 1000 ms still
produces sporadic 503s under load.

If MB starts returning 503 with `Retry-After`, do **not** bypass the
gate. Bump the interval in `rate-limit.ts:13` instead.

## User-Agent

MB requires a descriptive `User-Agent` with a contact channel.
The adapter builds it as:

```
musiccloud/1.0 ( <MUSICBRAINZ_CONTACT or default> )
```

Calls without a UA get rate-limited harder and may be banned. The
header is set inside `mbFetch()` and is not optional.

## Cover art

Cover Art Archive (`coverartarchive.org`) serves images by URL
convention:

```
https://coverartarchive.org/release/<release-mbid>/front-500.jpg
```

No extra request, no 404 fallback in the adapter — if the URL 404s,
the share page's existing artwork-backfill logic in
`album-resolver.ts` borrows artwork from a streaming adapter (Spotify,
Apple Music) instead.

## Pre-deploy verification

Run these manually before each release that touches the MusicBrainz
adapter:

```bash
# 1. ISRC lookup
curl -s -H 'User-Agent: musiccloud/1.0 ( musiccloud@layered.work )' \
  'https://musicbrainz.org/ws/2/isrc/GBDUW0000059?fmt=json' \
  | jq '.recordings[0] | {id,title}'
# Expected: { "id": "<MBID>", "title": "One More Time" } (Daft Punk)

# 2. Recording by MBID with work-rels (ISWC inside)
curl -s -H 'User-Agent: musiccloud/1.0 ( musiccloud@layered.work )' \
  'https://musicbrainz.org/ws/2/recording/<MBID>?inc=artists+releases+isrcs+work-rels&fmt=json' \
  | jq '{title, isrcs, relations: [.relations[]? | select(.type=="performance") | .work.iswcs]}'

# 3. UPC -> release lookup (Lucene query syntax)
curl -s -H 'User-Agent: musiccloud/1.0 ( musiccloud@layered.work )' \
  'https://musicbrainz.org/ws/2/release?query=barcode:724384960728&limit=1&fmt=json' \
  | jq '.releases[0] | {id, title, barcode}'

# 4. End-to-end resolve: take a real Spotify track URL, pass through
#    POST /api/v1/resolve, query the DB:
#    SELECT id_type, id_value, source_service FROM track_external_ids
#    WHERE track_id = (SELECT id FROM tracks WHERE short_id = '<short>');
#    Expect at least one row with source_service='musicbrainz'.
```

## Troubleshooting

**Symptom:** all MB calls return 503.
**Cause:** UA missing or banned, or rate-limit gate bypassed.
**Fix:** confirm `MUSICBRAINZ_CONTACT` is set, restart backend, watch
the gate logs. If still 503: bump the gate interval to 1500 ms.

**Symptom:** MB calls succeed but no rows show up in
`track_external_ids` with `source_service='musicbrainz'`.
**Cause:** the adapter is disabled in admin, or the resolver chain
short-circuited before it hit MB.
**Fix:** check `service_plugins` table for `enabled=true`, then check
backend logs for `[musicbrainz] matched` lines. If absent, the
streaming-side resolves are returning fast enough that MB never gets
contacted — verify the registry order in
`services/plugins/registry.ts` still puts `musicbrainzPlugin` after
the streaming block.

**Symptom:** Cover Art Archive returns 404 for many releases.
**Cause:** community-curated art coverage is incomplete; many less
popular releases have no art.
**Fix:** none needed — `album-resolver.ts` artwork backfill is the
intended fallback.
