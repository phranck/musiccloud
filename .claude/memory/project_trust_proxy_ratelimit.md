---
name: trustProxy + Rate-Limiter Kopplung
description: Backend-Rate-Limiter buckets by request.ip — requires Fastify trustProxy behind Zerops ingress, controlled via TRUST_PROXY env var
type: project
originSessionId: fb9d86da-46eb-4365-9892-958e0cb40dec
---
Fastify-Backend (App/apps/backend/src/server.ts) setzt `trustProxy` aus `TRUST_PROXY` env var. Prod `zerops.yml` setzt `TRUST_PROXY: "1"` (Zerops-Ingress = 1 Hop). Cloudflare davor → "2".

**Why:** Sliding-window Rate-Limiter `apiRateLimiter` (`30 req / 60s`, definiert in `App/apps/backend/src/lib/infra/rate-limiter.ts`) plus globaler `@fastify/rate-limit` (`300 req / 60s`) buckets nach `request.ip`. Ohne `trustProxy` liefert Fastify hinter dem Zerops-Ingress für alle Clients die gleiche Proxy-IP — ein Bucket für alle, 2-3 normale Searches triggern 429 für jeden. User-sichtbar: "Rate limit exceeded, retry in 2 seconds" nach wenigen Requests auf musiccloud.io.

**How to apply:**
- Rate-Limit-Zahlen (30/60s, 300/60s) nicht senken, wenn 429 auftaucht — erst `TRUST_PROXY` und `request.ip` im Log prüfen.
- Neue Ingress-Topologie (z.B. zusätzliches Cloudflare) erfordert Anpassung des Hop-Counts in `zerops.yml`.
- Lokal + Tests: `TRUST_PROXY` unset lassen (default false), sonst spoofbar.
- `resolve-public-get.ts` hat keinen JWT preHandler, IP-Limiter ist dort primäre Abuse-Defense.

**How to apply (random-example 404):**
- `/api/random-example` darf am Browser nie 404 werfen (devtools-Noise). BFF in `apps/frontend/src/pages/api/random-example.ts` mappt Backend-404 auf `200 { shortId: null }`. Backend-404 bleibt für externe v1-Consumer.
