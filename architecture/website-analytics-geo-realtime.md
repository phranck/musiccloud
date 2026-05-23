# Website Analytics Geo Realtime

## Scope

The dashboard route `/website-analytics/realtime` shows first-party website analytics activity on a local line-map. It uses
two backend surfaces:

- `GET /api/admin/analytics/website/geo` for initial hydration, country/city summaries and Geo-IP coverage.
- `GET /api/admin/analytics/website/realtime` as a JWT-protected SSE stream for new geolocated events.

The stream is server-to-client only. It uses `fetch` plus `ReadableStream` in the dashboard so the existing Bearer token can
be sent; browser `EventSource` cannot send custom authorization headers.

## MaxMind Configuration

Backend environment variables:

- `MAXMIND_ENABLED`: set to `false` to disable Geo-IP lookup and updates. Any other value leaves it enabled.
- `MAXMIND_DB_PATH`: absolute path to `GeoLite2-City.mmdb`. Takes precedence over `MAXMIND_DB_DIR`.
- `MAXMIND_DB_DIR`: directory for the default `GeoLite2-City.mmdb` file. Defaults to `data/geoip` under the backend working
  directory.
- `MAXMIND_MAX_AGE_DAYS`: maximum acceptable database age. Defaults to `14`. Stale databases are reported in the dashboard
  and are not used for lookups.
- `MAXMIND_ACCOUNT_ID`: optional MaxMind account id for dashboard-triggered updates.
- `MAXMIND_LICENSE_KEY`: optional MaxMind license key for dashboard-triggered updates.
- `MAXMIND_GEOIPUPDATE_BIN`: optional path to the `geoipupdate` binary. Defaults to `geoipupdate`.

If account id and license key are configured, the backend writes a temporary `GeoIP.conf` with mode `0600`, runs
`geoipupdate`, deletes the temporary config directory and reloads the local MMDB cache. If those credentials are not
configured, the backend still attempts to run `geoipupdate` with its system configuration.

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

Private, reserved and documentation IP ranges are ignored before lookup. Missing, stale or disabled MaxMind databases
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
can run without a MaxMind database, but the dashboard will show `missing`, `stale`, `disabled` or `error` until a fresh
database is available.

Production should install `geoipupdate` where the backend process can execute it, and the database directory must be
writable by that process if dashboard updates are enabled.
