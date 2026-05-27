# Zerops Networking Notes

## Dashboard to backend proxy path

Production traffic for the admin dashboard uses this path:

```text
browser -> Zerops public ingress -> dashboard nginx -> backend:4000 -> Fastify
```

The dashboard serves static assets itself, but every `/api/...` request is proxied by `apps/dashboard/site_config.tmpl` to `http://backend:4000` inside the Zerops private network.

## Node service bind addresses

Node-based production services must bind to IPv6 as well as IPv4 in Zerops:

```yaml
HOST: "::"
```

Do not change backend or frontend services back to `0.0.0.0` in production. Zerops routing and service discovery can use both IPv4 and IPv6 upstreams. If a Node service only listens on IPv4, a proxy or ingress hop can try an IPv6 address first, fail, and only then fall back to IPv4.

For the dashboard backend proxy this was observed directly: dashboard nginx occasionally tried IPv6 upstream addresses for `backend:4000`, saw `502`, and then retried an IPv4 address. In some runs this showed up as multi-second dashboard login delays even though the Fastify handler itself completed in a few milliseconds.

Observed diagnostic pattern before the backend fix:

```http
X-MC-Upstream-Addr: [fda0:...]:4000, 10.0.224.x:4000
X-MC-Upstream-Status: 502, 200
```

After binding the backend to `::`, auth probes should return `200` directly for reachable upstreams without IPv6 `502` fallback.

The public frontend is also a Node service. Keep it on `HOST: "::"` for the same reason, so `https://musiccloud.io` can accept IPv6 ingress/upstream traffic without waiting for an IPv4 fallback.

## Auth upstream diagnostics

`apps/dashboard/site_config.tmpl` currently exposes upstream timing headers for `/api/admin/auth/...` only:

```http
X-MC-Request-Time
X-MC-Upstream-Addr
X-MC-Upstream-Status
X-MC-Upstream-Connect-Time
X-MC-Upstream-Header-Time
X-MC-Upstream-Response-Time
```

These headers are intentionally scoped to auth endpoints because the login page is the first dashboard surface that reveals proxy delays. They should not be enabled globally for public API responses.

Use them to distinguish where a delay occurs:

- high browser total time, low `X-MC-Request-Time`: delay is before dashboard nginx or in the external ingress path.
- high `X-MC-Upstream-Connect-Time`: dashboard nginx is waiting to connect to a backend upstream.
- high `X-MC-Upstream-Header-Time`: backend accepted the connection but delayed the first byte.
- `X-MC-Upstream-Status` containing multiple values, e.g. `502, 200`: nginx retried multiple upstream addresses before succeeding.

## Verification probes

Quick auth probe:

```bash
curl -s -o /dev/null -D - \
  "https://dashboard.musiccloud.io/api/admin/auth/setup-status?diag=$(date +%s%N)" \
  -w "curl_total=%{time_total} ttfb=%{time_starttransfer}\n"
```

Expected healthy shape:

```http
HTTP/2 200
X-MC-Request-Time: 0.00x
X-MC-Upstream-Status: 200
X-MC-Upstream-Connect-Time: 0.000
```

## Deployment note

Backend, frontend and dashboard can deploy from the same monorepo workflow. If dashboard login suddenly becomes slow after a deploy, check the auth upstream headers before changing React auth flow or SQL queries. Static `/login` HTML and dashboard assets can be fast while proxied `/api/...` calls are delayed by the internal service hop.

If the public landing page at `https://musiccloud.io` becomes slow, remember that it is SSR and waits for backend data during render (`header` navigation, `footer` navigation and the random example teaser). First compare IPv4/IPv6 timings and check whether a Node service was accidentally changed back to `HOST: 0.0.0.0` before optimizing landing-page React or backend SQL.
