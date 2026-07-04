# Developer-Portal Self-Service-UI + Pricing-Commitment

Plan-Nr.: MC-089

## Preface

Free-first Phase 0 (siehe [`2026-07-04-developer-api-monetization-design.md`](../../../docs/superpowers/specs/2026-07-04-developer-api-monetization-design.md)). **Reines Frontend** in `apps/developer` — das komplette Backend (MC-077 `dev-api-access.ts`, 6 Self-Service-Endpunkte) existiert bereits. Aktiviert die drei „Soon"-Tabs und baut die Ansichten dagegen, plus eine öffentliche Pricing/Commitment-Seite. Portal ist **EN-only** (MC-066, kein i18n).

Setzt Abschnitt E des Self-Service-Designs ([`2026-07-01-developer-api-access-self-service-design.md`](../../../docs/superpowers/specs/2026-07-01-developer-api-access-self-service-design.md)) um.

## Ziel

- Die drei Dashboard-Tabs live schalten:
  - **API access** — Antrag stellen (`appName`, `appDescription`, `estimatedRequestsPerDay`) + Liste der eigenen Requests mit Status.
  - **API keys** — eigene Clients + deren Tokens: erstellen / rotieren / widerrufen, Raw-Token **einmalig** anzeigen (Reveal + Copy).
  - **Usage** — pro Client: Limits (`requestsPerMinute`/`requestsPerDay`) + `lastUsedAt` je Token.
- Öffentliche **Pricing/Commitment-Seite** mit dem Anti-Enshittification-Versprechen; verlinkt aus Dashboard + Landing/Footer.
- Overview-„Get started"-Karte auf die neue API-access-Seite verlinken.

## Nicht-Ziele (YAGNI)

- Keine Billing-/Upgrade-/Polar-UI (zurückgestellt).
- Keine Voll-Usage-Analytics — nur Limits + `lastUsedAt`, mit Hinweis „detailed analytics later".
- Kein i18n. Kein Backend-Change (Antrag → Admin-Approval-Flow von MC-077 bleibt; ob Free-Anträge später auto-approved werden, ist eine separate Backend-Entscheidung, nicht Teil dieses Plans).

## Design

### Tabs / Navigation

`lib/dashboardTabs.ts` — in `DASHBOARD_NAV` bei `ApiAccess`/`ApiKeys`/`Usage` `href` setzen und `comingSoon: false`. Reihenfolge unverändert.

Neue Seiten unter `pages/dashboard/`: `api-access.astro`, `api-keys.astro`, `usage.astro`. Jede: `prerender = false`, `getDeveloperSession(Astro)` → sonst `/login`, `DashboardLayout account={account} active={DashboardTab.X}`. Design-Tokens (`rounded-card`, `border-border`, `bg-surface`, `text-body`, `text-fg-muted` …) und Phosphor-Icons wie in `pages/dashboard/index.astro`.

### API access (Antrag + Status)

React-Island `ApiAccessPanel` (`client:load`), ruft den BFF-Proxy `/api/dev/api-access/*` mit `credentials: "include"`:

- Formular → `POST ENDPOINTS.dev.apiAccess.requestsCreate`; clientseitige Validierung spiegelt das Backend (appName ≤ 200, appDescription ≤ 2000, `estimatedRequestsPerDay` positive int).
- Liste eigener Requests (`GET requestsList`) mit Status-Badge.
- Request-Status als PascalCase-`as const`-Namespace (domain-literals-Doctor-Regel), z. B. `RequestStatus.Pending` (`pending`/`approved`/`rejected`/`archived`).

### API keys (Clients + Tokens)

React-Island `ApiKeysPanel`: `GET clientsList` → pro Client eine Card (`appName`, `status`, `requestsPerMinute`/`requestsPerDay`) mit Token-Liste (`tokenPrefix` maskiert via `formatApiTokenForDisplay`-Analogon, `status`, `createdAt`, `lastUsedAt`).

- Aktionen: **Create** (`POST clientCreateToken`) → `rawToken` einmalig in Reveal-Box + Copy; **Rotate** (`tokenRotate`, neuer `rawToken` einmalig); **Revoke** (`tokenRevoke`, mit Bestätigung).
- Backend drosselt die Token-Mutationen auf 20/min → `429` sauber behandeln (Retry-Hinweis, kein harter Fehler).
- Clients erscheinen erst nach Admin-Approval eines Requests (MC-077-Flow) — Leerzustand entsprechend formulieren.

### Usage

Pro Client Limits (`requestsPerMinute`/`requestsPerDay`) + `lastUsedAt` je Token; Hinweis „Detailed usage analytics coming later". Datenquelle = `clientsList` (enthält Limits + Tokens inkl. `lastUsedAt`). `lastUsedAt` wird erst durch **MC-088** befüllt — bis dahin „never/—".

### Pricing / Commitment

Neue öffentliche Seite `pages/pricing.astro` (kein Login). Inhalt = das englische Commitment aus der Spec (free while building out; free tier stays free; early users grandfathered; ≥ 30 days notice; no degradation). Verlinkt aus `DashboardLayout` (Footer/Nav), Landing (`pages/index.astro`) und ggf. `pages/docs/`. Overview: kleiner „Free plan — see our pricing commitment"-Hinweis mit Link.

### Shared UI / Konventionen

- Wiederkehrende Muster (Card, Status-Badge, Copy-Button, Reveal-once-Token-Box) in `components/dashboard/` extrahieren (code-quality-Regel), nicht pro Seite duplizieren.
- React-Doctor: Islands klein halten, Logik/Utils in `lib/` (nicht in der Komponentendatei); `useEffect`-Cleanup + Fetch-Cancellation; keine Inline-SVG (nur Phosphor); Domain-Literale als PascalCase-Namespaces. Nach jedem `.ts/.tsx`-Edit `biome check --write`.
- a11y: Formular-Labels, `aria-label` an Icon-only-Buttons, Fokus-Handling im Reveal-Dialog.

## Gates (vor Push)

- `apps/developer` `astro check` · `pnpm lint` (Biome) · `pnpm run doctor:diff` · Build (`astro build`) grün.

## Verifizierte Fakten (2026-07-04)

- **Backend komplett** — `apps/backend/src/routes/dev-api-access.ts` registriert alle 6 Endpunkte hinter `authenticateDeveloper`. Konstanten: `ENDPOINTS.dev.apiAccess.{requestsCreate,requestsList,clientsList}` (`packages/shared/src/endpoints.ts:430`) + `ROUTE_TEMPLATES.dev.apiAccess.{clientCreateToken,tokenRevoke,tokenRotate}` (ebd. `:528`). Token-Create/Rotate liefern `rawToken` einmalig (`dev-api-access.ts:172,213`).
- **BFF-Proxy** — `apps/developer/src/pages/api/dev/[...path].ts` leitet `/api/dev/*` an den Backend weiter, relayt Cookies (`mc_dev_session`). Frontend ruft also same-origin `/api/dev/api-access/...` mit `credentials: "include"`.
- **Tabs** — `apps/developer/src/lib/dashboardTabs.ts:52` (`DASHBOARD_NAV`; `ApiAccess`/`ApiKeys`/`Usage` = `comingSoon: true, href: null`).
- **Dashboard-Seiten-Muster** — `apps/developer/src/pages/dashboard/index.astro` (`getDeveloperSession` → `/login`, `DashboardLayout active={DashboardTab.Overview}`, Design-Tokens, Phosphor; „Get started"-Platzhalter-Karte, die verlinkt werden soll). Session-Helper `lib/session.ts`. React-Island-Muster `components/dashboard/DeleteAccountSection.tsx` (`client:load`).
- **Token-Display-Helper** — `formatApiTokenForDisplay(prefix)` in `apps/backend/src/services/api-access-token.ts:61` (Referenz für die Maskierung; Front-end nutzt den bereits maskierten `tokenPrefix` aus der Response).

## Checkliste

- [ ] `DASHBOARD_NAV`: `ApiAccess`/`ApiKeys`/`Usage` live (`href` + `comingSoon: false`)
- [ ] `pages/dashboard/api-access.astro` + `ApiAccessPanel`-Island (Antrag + Requests-Liste + Status-Badge)
- [ ] `pages/dashboard/api-keys.astro` + `ApiKeysPanel`-Island (Clients/Tokens, create/rotate/revoke, Reveal-once + Copy, 429-Handling)
- [ ] `pages/dashboard/usage.astro` (Limits + `lastUsedAt` + „analytics later")
- [ ] `pages/pricing.astro` (Commitment-Text) + Verlinkung (Dashboard/Landing/Footer)
- [ ] Overview-„Get started"-Karte verlinkt auf API access
- [ ] Status-Literale als PascalCase-Namespace; Shared-Komponenten extrahiert (Card/Badge/Copy/Reveal)
- [ ] a11y (Labels/aria/Fokus), Phosphor-Icons, Design-Tokens
- [ ] Alle Code-Referenzen verifiziert (Endpunkte, Pfade, Tabs, BFF)
- [ ] Gates grün (`astro check`, `lint`, `doctor:diff`, `astro build`)

## Verwandt

- Spec [`2026-07-04-developer-api-monetization-design.md`](../../../docs/superpowers/specs/2026-07-04-developer-api-monetization-design.md)
- MC-088 (macht die Tokens wirksam + befüllt `lastUsedAt`; empfohlene Reihenfolge: MC-088 zuerst, hart blockierend ist es nicht)
- MC-077 (Backend-Fundament, done), MC-066 (Portal-Auth-UI, done)
- Self-Service-Design Abschnitt E [`2026-07-01-developer-api-access-self-service-design.md`](../../../docs/superpowers/specs/2026-07-01-developer-api-access-self-service-design.md)
