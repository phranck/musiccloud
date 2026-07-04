# Public-API Token-Enforcement + Per-Client-Rate-Limiting

Plan-Nr.: MC-088

## Preface

Free-first Phase 0 (siehe [`2026-07-04-developer-api-monetization-design.md`](../../../docs/superpowers/specs/2026-07-04-developer-api-monetization-design.md)). Dieser Plan macht die bereits ausgebbaren `mc_live_`-Tokens **zum ersten Mal wirksam** und setzt die Pro-Client-Limits durch. Kostenlos, genau ein Free-Tier — die Limits sind die bestehenden `api_clients`-Defaults (`requestsPerMinute` 60, `requestsPerDay` 10.000), kein Tier-Konstrukt.

Entspricht dem Kern von **MC-025 Phase 2** (Codex-Plan, durch MC-077 teil-überholt). Baut auf **MC-077** (Backend-Fundament: Tabellen, Token-Ausgabe, Self-Service-Routen — alle vorhanden).

## Ziel

- `authenticatePublic` akzeptiert zusätzlich einen `mc_live_`-Token via `X-API-Key`, validiert ihn gegen `api_client_tokens` (SHA-256-Hash-Lookup), hängt den aufgelösten aktiven `api_client` an den Request und stempelt `lastUsedAt`.
- Token-authentifizierte Requests werden **pro Client** rate-limitiert (`requestsPerMinute` + `requestsPerDay`), `429` bei Cap (bestehende Fehler-Envelope).
- Bestehende Pfade unverändert: `INTERNAL_API_KEY` (BFF) und `Authorization: Bearer <JWT>` passieren weiter; anonyme Per-IP-Requests bleiben erlaubt.

## Nicht-Ziele (YAGNI)

- **Kein erzwungener Anonymous-Cutover** — anonyme Public-Requests werden in Phase 0 nicht abgelehnt (das wäre ein Breaking Change ohne Not).
- **Kein persistenter Usage-Zähler / keine Analytics-Tabelle** — `lastUsedAt` genügt für den Usage-Tab; Voll-Analytics ist der zurückgestellte Plan.
- Kein Tier-Konstrukt, keine Billing-Logik, kein Redis (In-Memory-Limiter wie bestehende Infra; Single-Process pro Replica).

## Design

### 1. Token-Validierung in `authenticatePublic` (`plugins/auth.ts`)

Reihenfolge im Decorator:

1. `X-API-Key === INTERNAL_API_KEY` → pass-through (BFF, unverändert).
2. `X-API-Key` vorhanden und beginnt mit `mc_live_` → **Token-Pfad**: `hashApiToken(key)` → `repo.findActiveApiClientByTokenHash(hash)`.
   - Treffer (Token `active` **und** Client `active`) → `request.apiClient = client`; `lastUsedAt` stempeln (fire-and-forget, Fehler nur loggen, um den Hot-Path nicht zu blockieren); **Per-Client-Rate-Limit prüfen** (siehe 2); dann pass-through.
   - Kein Treffer / Token `revoked`|`rotated` / Client `suspended`|`revoked` → `401` (gleiche Shape wie die bestehenden 401er).
3. `Authorization: Bearer <JWT>` → `request.jwtVerify()` wie bisher.
4. sonst → `401`.

`FastifyRequest`-Augmentation: `apiClient?: ApiClient` im bestehenden `declare module "fastify"`-Block (analog zu `developerAccount`).

### 2. Per-Client-Rate-Limiting

Problem: `RateLimiter` hat `maxRequests` fix im Konstruktor; Pro-Client-Limits variieren. Lösung (KISS): eine Limit-pro-`check`-Variante — ein `Map<string, number[]>`-Store mit zwei Schlüsseln je Client:

- `rpm:<clientId>` (Fenster 60 s, Limit `client.requestsPerMinute`)
- `rpd:<clientId>` (Fenster 86.400 s, Limit `client.requestsPerDay`)

Umsetzung entweder als neue Methode `check(key, maxRequests, windowMs)` oder kleine Schwesterklasse `DynamicRateLimiter` in `lib/infra/rate-limiter.ts`; Cleanup-Interval wie bei `apiRateLimiter`. Enforcement **zentral in `authenticatePublic`** direkt nach Client-Auflösung (deckt alle `authenticatePublic`-Routen ab, DRY): erst `rpm`, dann `rpd`; bei Cap `sendRateLimitError(reply, check)` + return.

### 3. Interaktion mit dem Per-IP-`apiRateLimiter`

Routen, die inline `apiRateLimiter.check(request.ip)` aufrufen, würden einen token-authentifizierten Client zusätzlich mit dem strengen 10/min-Per-IP-Bucket kappen (der die Client-`rpm` von 60 überschreibt). Fix: die Per-IP-Prüfung **überspringen, wenn `request.apiClient` gesetzt ist** — analog zum bestehenden `isInternalRequest`-Bypass. Minimal: in den betroffenen Routen die Guard-Bedingung um `&& !request.apiClient` ergänzen (bzw. Helper `hasResolvedApiClient(request)`). Betroffene Routen siehe Verifizierte Fakten. (Der grössere Umbau — Per-IP-Check zentral in einen Hook ziehen — ist für Phase 0 YAGNI.)

### 4. Repository

`ApiAccessRepository` (`api-access-repository.ts`) + einziger Adapter `postgres-api-access.ts`:

- `findActiveApiClientByTokenHash(tokenHash): Promise<{ client: ApiClient; token: ApiClientToken } | null>` — Join `api_client_tokens` × `api_clients`, `token.status='active' AND client.status='active'`; nutzt `uq_api_client_tokens_hash`.
- `touchApiClientTokenLastUsed(tokenId): Promise<void>` — `UPDATE ... SET last_used_at = NOW()`.

Präzedenz für Hash-Lookup + `NOW()`-Stempel: `findActiveDeveloperEmailToken` (`developer-repository.ts:245`, Impl `adapters/postgres.ts:1157`). DTOs `ApiClient`/`ApiClientToken` existieren bereits.

### 5. Tests (Vitest, echte DB via `DATABASE_URL`)

- Valider aktiver Token → Request passiert, `apiClient` gesetzt, `lastUsedAt` gestempelt.
- Unbekannter `mc_live_`-Token → `401`; revoked Token → `401`; suspended/revoked Client → `401`.
- `rpm`-Cap → `429` nach N Requests; `rpd`-Cap → `429`.
- `INTERNAL_API_KEY` passiert weiterhin (BFF); `Bearer`-JWT passiert weiterhin.
- Token-authentifizierte Route wird **nicht** vom Per-IP-10/min gekappt (`apiClient`-Bypass greift).
- `isRateLimitDisabled()`/`DISABLE_RATE_LIMIT` beachten: Limit-Tests dürfen es nicht setzen.

## Gates (vor Push)

- `apps/backend` `tsc --noEmit` · `pnpm lint` (Biome) · `pnpm run doctor:diff` · `pnpm test:run` (`DATABASE_URL` aus `apps/backend/.env.local`).

## Verifizierte Fakten (2026-07-04)

- **`authenticatePublic`** — `apps/backend/src/plugins/auth.ts:122`; akzeptiert heute nur `X-API-Key === INTERNAL_API_KEY` oder `Bearer <JWT>`, **keine** `mc_live_`-Tokens. `declare module "fastify"`-Augmentation (`developerAccount`) als Muster: `:56`.
- **Rate-Limit-Infra** — `RateLimiter` (fixe `maxRequests` im Ctor), `apiRateLimiter = new RateLimiter(10, 60_000)`, `isInternalRequest`: `apps/backend/src/lib/infra/rate-limiter.ts:30,139,164`. `sendRateLimitError` (Code `MC-API-0003`, `Retry-After` + `429`): `rate-limit-response.ts:7`.
- **Per-IP-Aufrufer** (`apiRateLimiter.check`) — `resolve.ts:201`, `resolve-public-get.ts:135`, `link.ts:87`, `auth.ts:113`, `artist-info.ts:152`, `share.ts:104`, `share-preview.ts:65`, `cc-resolve.ts:81`, `cc-audio.ts:104`, `cc-bandcamp.ts:128`, `cc-download.ts:77`, `cc-artist-info.ts:39` (alle unter `apps/backend/src/routes/`).
- **Token-Helper** — `hashApiToken(raw)` (SHA-256 hex), Shape `mc_live_<prefix>_<secret>`: `apps/backend/src/services/api-access-token.ts:50`.
- **Schema steht, kein Migration-Bedarf** — `apiClients` (`requestsPerMinute` Default 60, `requestsPerDay` Default 10.000, `status`): `apps/backend/src/db/schemas/postgres.ts:1686`; `apiClientTokens` (`tokenHash`, Unique-Index `uq_api_client_tokens_hash`, `status`, `lastUsedAt`): ebd. `:1725,1742`.
- **Repo ohne Hash-Lookup** — `ApiAccessRepository`: `apps/backend/src/db/api-access-repository.ts:130` (Methoden `findApiClientById`, `listApiClientTokensByClient` etc., **kein** By-Hash). Präzedenz `findActiveDeveloperEmailToken`: `developer-repository.ts:245` / `adapters/postgres.ts:1157`. **Nur ein Adapter** `adapters/postgres-api-access.ts`, gewählt in `db/index.ts:37`.

## Checkliste

- [ ] `request.apiClient`-Augmentation in `plugins/auth.ts`
- [ ] `authenticatePublic`: `mc_live_`-Token-Pfad (Hash-Lookup, `401` bei ungültig/inaktiv)
- [ ] Repo: `findActiveApiClientByTokenHash` + `touchApiClientTokenLastUsed` (Interface + `postgres-api-access.ts`)
- [ ] `lastUsedAt`-Stempelung (fire-and-forget, Fehler geloggt)
- [ ] Dynamischer Per-Client-Limiter (`rpm` + `rpd`), `429` via `sendRateLimitError`
- [ ] Per-IP-`apiRateLimiter`-Bypass bei gesetztem `request.apiClient` (betroffene Routen)
- [ ] Tests: valid / unknown / revoked / suspended / rpm / rpd / BFF / Bearer / Bypass
- [ ] Alle Code-Referenzen verifiziert (Funktionen, Pfade, Schema, Endpunkte)
- [ ] Gates grün (`tsc`, `lint`, `doctor:diff`, `test:run`)

## Verwandt

- Spec [`2026-07-04-developer-api-monetization-design.md`](../../../docs/superpowers/specs/2026-07-04-developer-api-monetization-design.md)
- MC-089 (Portal-UI; konsumiert die dann wirksamen Tokens + zeigt `lastUsedAt`)
- MC-077 (Backend-Fundament, done), MC-025 (Codex, Enforcement + Analytics)
