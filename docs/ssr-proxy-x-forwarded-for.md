# SSR proxies must forward `X-Forwarded-For`

## The rule (non-negotiable)

**Any server-side proxy or SSR fetch that re-issues a request on behalf of a
visitor MUST forward the visitor's real IP as `X-Forwarded-For`.**

If it does not, every downstream consumer (rate limiter, analytics geo-lookup,
audit log, abuse heuristics, …) sees the IP of the proxy pod — on Zerops that is
the ingress/SSR pod in **Prague** — instead of the visitor. The visitor IP is
effectively erased the moment a request crosses a proxy that drops it.

This is a recurring incident class in musiccloud. It has hit production three
times in three different layers, each with a different visible symptom but the
**same** root cause.

## Why it keeps happening

Requests reach our consumers through more than one hop:

```
visitor browser
   │  (real IP in X-Forwarded-For, set by Zerops ingress)
   ▼
Astro SSR frontend  ──────────────┐
   │                              │ same-origin proxy routes
   │ backend API calls            │ (/api/mc/* → Umami)
   ▼                              ▼
Fastify backend             umami.layered.work
   │ apiRateLimiter keyed by request.ip
```

Each hop that re-issues a request starts a **new** TCP connection. Unless the
original `X-Forwarded-For` is copied onto that new request, the next hop only
sees the previous hop's pod IP. There is no automatic propagation — it is the
proxy author's job, every time.

## The three incidents

| # | Layer | Root cause | Visible symptom | Fixed |
|---|---|---|---|---|
| 1 | Backend trust-proxy | `TRUST_PROXY=1` missing in `zerops.yml` → Fastify ignored `X-Forwarded-For`, saw ingress IP | All users shared one `apiRateLimiter` bucket → 429 / 302→/404 after 2-3 requests | earlier |
| 2 | SSR backend fetchers | Astro SSR calls to backend did not forward `X-Forwarded-For` → backend saw frontend pod IP | Same rate-limit symptom as #1 | 2026-05-01, `894146d9` |
| 3 | Umami analytics proxy | `/api/mc/api/send` re-posted tracking events without the client IP → Umami geolocated by the Zerops pod IP (Prague) | Location analytics collapsed to ~100% Czech Republic | 2026-06-30, `True-Client-IP` / `CF-Connecting-IP` (see note) |

> **Incident #3 note — `X-Forwarded-For` is not enough for Umami.** The first
> attempt (`23a94a9e`, 2026-06-27) forwarded `X-Forwarded-For` and assumed
> Umami would honour it. It did not, and the analytics stayed ~100% CZ. An
> empirical probe against the live instance (send synthetic events with
> spoofed IP headers, read the country breakdown back through the Umami API)
> showed the **reverse proxy in front of the managed Umami overwrites the
> standard forwarding headers** (`X-Forwarded-For`, `X-Real-IP`,
> `X-Client-IP`) with the immediate peer before Umami reads them, while it
> passes the vendor headers `True-Client-IP` and `CF-Connecting-IP` through
> untouched — and Umami honours those (they win even when `X-Forwarded-For`
> is also present). The working fix carries the visitor IP in **both** vendor
> headers. No Umami-side config change was needed.

Incident #3 is instructive about detection: the regression was introduced on
2026-04-10 (`cf3e7044`, the ad-blocker-friendly refactor that replaced the
direct browser→`umami.layered.work` script load with a same-origin proxy), but
only became obvious weeks later. A 30-day analytics window — fully inside the
proxy era — showed all-Czech-Republic, while a 90-day window still carried the
healthy pre-proxy country mix. **Same-root regressions can hide behind
aggregation windows; compare a short window against a long one.**

## How the codebase implements the rule

- **Backend trust** — `zerops.yml` sets `TRUST_PROXY=1`; Fastify then honours the
  proxy chain so `request.ip` resolves to the real visitor. See the
  `apiRateLimiter` doc-comment in
  [`apps/backend/src/lib/infra/rate-limiter.ts`](../apps/backend/src/lib/infra/rate-limiter.ts).
- **SSR backend calls** — every backend fetch from the Astro frontend goes
  through the `forwardedForExtra(Astro.clientAddress)` helper in
  [`apps/frontend/src/api/client.ts`](../apps/frontend/src/api/client.ts), which
  attaches `X-Forwarded-For`.
- **Same-origin analytics proxy** — the Umami send-proxy
  [`apps/frontend/src/pages/api/mc/api/send.ts`](../apps/frontend/src/pages/api/mc/api/send.ts)
  carries the visitor IP (first hop of the incoming `X-Forwarded-For`, with
  `clientAddress` as fallback) in the `True-Client-IP` and `CF-Connecting-IP`
  vendor headers, because the managed Umami's reverse proxy clobbers
  `X-Forwarded-For`. See the file header and the incident #3 note above.

## Checklist for any NEW proxy or SSR fetch

Before merging a route that re-issues a request to another service (backend,
analytics, third-party API, image/asset proxy, …):

1. **Does a downstream consumer depend on the caller IP?** Rate limiting,
   geolocation, geo-blocking, abuse scoring, audit/security logs all do. If yes,
   the IP must survive the hop.
2. **Read the visitor IP from the incoming request** — the `X-Forwarded-For`
   header (set by Zerops ingress), with `Astro.clientAddress` / `clientAddress`
   as the fallback for local dev.
3. **Set `X-Forwarded-For` on the outgoing request** — reuse `forwardedForExtra`
   where it fits, or replicate the same pattern. Never send only `User-Agent`
   and call it done.
4. **Confirm the receiving service actually uses the header you set — do not
   assume.** A service behind its own reverse proxy often never sees your
   `X-Forwarded-For`: that proxy overwrites the standard forwarding headers
   (`X-Forwarded-For`, `X-Real-IP`, `X-Client-IP`) with its immediate peer.
   The managed Umami is exactly this case — it only honours the visitor IP via
   the vendor headers `True-Client-IP` / `CF-Connecting-IP`, which the proxy
   passes through untouched (incident #3). Probe it empirically: send synthetic
   events with spoofed IPs across candidate headers and read the country
   breakdown back through the service's API to see which header wins.
5. **Verify with a real visitor.** Geolocation is resolved and stored per event
   at ingest, so a fix only affects data written after deploy; check a fresh
   short window after release, not the historical aggregate.

## See also

- [`apps/frontend/src/api/client.ts`](../apps/frontend/src/api/client.ts) — `forwardedForExtra`, the canonical helper.
- [`apps/frontend/src/pages/api/mc/api/send.ts`](../apps/frontend/src/pages/api/mc/api/send.ts) — same-origin Umami proxy, incident #3 fix.
- [`apps/backend/src/lib/infra/rate-limiter.ts`](../apps/backend/src/lib/infra/rate-limiter.ts) — `apiRateLimiter` doc-comment, incidents #1 and #2.
