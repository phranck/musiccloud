# Website Analytics Geo Realtime

## Scope

The dashboard route `/website-analytics/realtime` shows first-party website analytics activity on a local line-map. It uses
two backend surfaces:

- `GET /api/admin/analytics/website/geo` for initial hydration, country/city summaries and Geo-IP coverage.
- `GET /api/admin/analytics/website/realtime` as a JWT-protected SSE stream for new geolocated events.

The stream is server-to-client only. It uses `fetch` plus `ReadableStream` in the dashboard so the existing Bearer token can
be sent; browser `EventSource` cannot send custom authorization headers.

## DB-IP Configuration

Backend environment variables:

- `DBIP_ENABLED`: set to `false` to disable Geo-IP lookup and updates. Any other value leaves it enabled.
- `DBIP_DB_PATH`: absolute path to `dbip-city-lite.mmdb`. Takes precedence over `DBIP_DB_DIR`.
- `DBIP_DB_DIR`: directory for the default `dbip-city-lite.mmdb` file. Defaults to `data/geoip` under the backend working
  directory.
- `DBIP_MAX_AGE_DAYS`: maximum acceptable database age. Defaults to `45`. Stale databases are reported in the dashboard
  and are not used for lookups.
- `DBIP_UPDATE_ON_START`: set to `true` in production so a missing/stale local database is downloaded before the backend
  starts serving.
- `DBIP_REQUIRE_READY`: set to `true` in production so `/health/ready` returns 503 when the local database is missing,
  stale or behind the latest DB-IP release.
- `DBIP_DOWNLOAD_PAGE_URL`: optional override for the DB-IP City Lite download page.
- `DBIP_DOWNLOAD_URL`: optional direct `.mmdb.gz` download URL override.

The backend downloads DB-IP City Lite directly as `.mmdb.gz`, verifies the published checksum against the decompressed
MMDB, decompresses the file and atomically swaps the local database. The dashboard update button and startup update use
the same code path. Lookups use the neutral `mmdb-lib` reader against the local DB-IP MMDB, so no raw visitor IP is sent
to DB-IP.

DB-IP City Lite is licensed under Creative Commons Attribution. Dashboard views that display or use DB-IP results include
the required `IP Geolocation by DB-IP` attribution link.

## Data Boundary

The raw request IP is used only inside request-scoped backend code. It is not persisted and is not exposed to the
dashboard. Persisted Geo-IP analytics fields are:

- country code
- region code and name
- city
- latitude and longitude
- accuracy radius in kilometers
- timezone
- provider
- database build timestamp

Private, reserved and documentation IP ranges are ignored before lookup. Missing, stale or disabled DB-IP databases
produce no Geo-IP enrichment.

## Dashboard Behaviour

The map hydrates recent geolocated events from the JSON endpoint and then merges new SSE events. Points use this lifecycle:

- flash on arrival
- subtle pulse for one minute
- fade out after the pulse window

Activity categories drive point color:

- page view
- search
- resolve
- listen
- player
- interaction
- bot

The map is local SVG and does not load external map tiles. Zoom increases graticule density and city labels.

## Deployment Notes

Run the Postgres migration that adds the `analytics_events.geo_*` fields before deploying the dashboard page. The backend
can run without a DB-IP database, but the dashboard will show `missing`, `stale`, `disabled` or `error` until a fresh
database is available.

Production should set `DBIP_UPDATE_ON_START=true`, `DBIP_REQUIRE_READY=true` and a writable `DBIP_DB_DIR`. No Homebrew,
system updater binary or external provider account is required for DB-IP City Lite.
