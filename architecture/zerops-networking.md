# Zerops Networking Notes

## Dashboard to backend proxy path

Production traffic for the admin dashboard uses this path:

```text
browser -> Zerops public ingress -> dashboard nginx -> backend.zerops:4000 -> Fastify
```

The dashboard serves static assets itself, but every `/api/...` request is proxied by `apps/dashboard/site_config.tmpl` to `backend.zerops:4000` inside the Zerops private network.

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

## The dashboard resolves the backend per request

`apps/dashboard/site_config.tmpl` proxies through a variable, `$backend_upstream`, which holds `backend.zerops:4000`. A `proxy_pass` through a variable makes nginx resolve the name at request time instead of once at start, so a backend container replaced by a deploy or by Zerops is found without restarting the dashboard. The dashboard therefore deploys on its own changes only.

nginx does not read `/etc/resolv.conf`, so the template names the resolver: `resolver 10.0.224.1 ipv6=off valid=10s`. That is the project network's resolver, as `/etc/resolv.conf` in the dashboard and backend containers lists it. It belongs to this project's network, and another project has another one. nginx also does not apply the `zerops` search domain from that file, which is why the name is `backend.zerops`: through the resolver, the short name `backend` answers NXDOMAIN. `ipv6=off` keeps nginx on the backend's IPv4 address, so the IPv6 fallback described above cannot occur on this hop. A lookup is cached for ten seconds.

To read the resolver again, connect with `zcli vpn up` and run `cat /etc/resolv.conf` over `ssh dashboard.zerops`.

The dashboard deploy probes `https://dashboard.musiccloud.io/api/admin/auth/setup-status`, which goes through the proxy, as well as the static page. A resolver that does not answer therefore fails the deploy rather than passing it.

## Deployment note

Backend, frontend and dashboard can deploy from the same monorepo workflow. If dashboard login suddenly becomes slow after a deploy, compare the dashboard nginx access log with the backend's `responseTime` for the same request before changing React auth flow or SQL queries. Static `/login` HTML and dashboard assets can be fast while proxied `/api/...` calls are delayed by the internal service hop.

If the public landing page at `https://musiccloud.io` becomes slow, remember that it is SSR and waits for backend data during render (`header` navigation, `footer` navigation and the random example teaser). First compare IPv4/IPv6 timings and check whether a Node service was accidentally changed back to `HOST: 0.0.0.0` before optimizing landing-page React or backend SQL.
