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

The pattern that identifies it is nginx recording two upstream addresses for one request, an IPv6 one answering `502` followed by an IPv4 one answering `200`. It is visible in the dashboard nginx access and error log for that request.

After binding the backend to `::`, a reachable upstream answers directly and no IPv6 `502` fallback occurs.

The public frontend is also a Node service. Keep it on `HOST: "::"` for the same reason, so `https://musiccloud.io` can accept IPv6 ingress/upstream traffic without waiting for an IPv4 fallback.

## Diagnosing proxy delays

No response header carries upstream timings. `apps/dashboard/site_config.tmpl` proxies every `/api/` request, auth included, without diagnostics, because those paths answer to unauthenticated callers: `$upstream_addr` would publish the internal backend address, and a server-measured response time on the login path is a timing oracle with the network noise removed.

Diagnose from the two logs instead, which together cover the same ground.

The backend's structured log carries `reqId`, the route, the status, and `responseTime` for every request, so it answers how long the Fastify handler itself took. The dashboard nginx access log carries `$request_time`, `$upstream_connect_time`, `$upstream_header_time`, `$upstream_response_time`, and `$upstream_addr` for the same request, so it answers where the remaining time went.

Read them together to place a delay:

- high browser total time, low nginx `$request_time`: the delay is before dashboard nginx, in the external ingress path.
- high `$upstream_connect_time`: dashboard nginx is waiting to connect to a backend upstream.
- high `$upstream_header_time` whilst the backend log reports a short `responseTime`: the backend accepted the connection but delayed the first byte.
- `$upstream_addr` holding two values for one request: nginx retried a second upstream address, which is the IPv6 fallback described above.

If a delay genuinely cannot be placed from the logs, add the timing headers to a scratch deployment, take the measurement, and remove them again. They do not belong in a production configuration.

## Verification probes

Quick auth probe:

```bash
curl -s -o /dev/null -D - \
  "https://dashboard.musiccloud.io/api/admin/auth/setup-status?diag=$(date +%s%N)" \
  -w "curl_total=%{time_total} ttfb=%{time_starttransfer}\n"
```

A healthy run answers `HTTP/2 200` with `ttfb` in the low tens of milliseconds. A `ttfb` in the seconds whilst the backend log reports a `responseTime` of a few milliseconds for the same request is the IPv6 fallback pattern described above.

## The dashboard caches the backend's address

nginx resolves the `backend` upstream in `apps/dashboard/site_config.tmpl` once, when it loads the file, and keeps that address for the life of the process. It does not re-resolve per request.

That makes the dashboard sensitive to the backend being replaced under it. When the backend container gets a new internal address, the dashboard goes on sending `/api/` traffic to the old one and answers `502` or times out, whilst static delivery keeps working and the container keeps reporting itself healthy. The failure therefore looks like the backend is down when the backend is fine, and `api.musiccloud.io` answering normally is what tells the two apart.

Observed on 7 August 2026: the dashboard deploy finished 51 seconds before the backend deploy, and every `/api/` path through `dashboard.musiccloud.io` failed from then on. The frontend, which resolves per request from Node, was unaffected throughout.

Two consequences to keep in mind:

The deploy workflow orders `deploy-dashboard` after `deploy-backend` so a shared deploy cannot reopen that window. A backend restart outside a deploy is not covered by that, and needs the dashboard restarted with it.

Resolving per request would remove the problem entirely, but it needs a `resolver` directive with a literal DNS address, and Zerops does not document one. Until that address is known, ordering plus a deliberate restart is the arrangement.

## Deployment note

Backend, frontend and dashboard can deploy from the same monorepo workflow. If dashboard login suddenly becomes slow after a deploy, compare the dashboard nginx access log with the backend's `responseTime` for the same request before changing React auth flow or SQL queries. Static `/login` HTML and dashboard assets can be fast while proxied `/api/...` calls are delayed by the internal service hop.

If the public landing page at `https://musiccloud.io` becomes slow, remember that it is SSR and waits for backend data during render (`header` navigation, `footer` navigation and the random example teaser). First compare IPv4/IPv6 timings and check whether a Node service was accidentally changed back to `HOST: 0.0.0.0` before optimizing landing-page React or backend SQL.
