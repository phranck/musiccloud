# Developer-Portal Sub-Projekt 3: API-Zugriffsverwaltung + Token-Self-Service — Design-Spec

Status: Design abgenommen (2026-07-01)
Scope: Zugriffsanträge, Clients und API-Keys für externe Entwickler — Backend-Datenmodell, Admin-API (Dashboard) und Developer-Self-Service-API (developer.musiccloud.io). Dieser Durchgang implementiert nur den Backend-Teil (Abschnitte A–C); die beiden UI-Hälften (D, E) sind eigene Folge-Pläne.
Verwandt: [MC-025](../../../.codex/plans/open/2026-06-05-public-api-access-key-and-analytics-plan.md) (Zugriffsverwaltung + Enforcement + Analytics — Fundament dieses Specs), [developer-site-design.md](2026-06-26-developer-site-design.md) (Sub-Projekt 3: „Token-Self-Service + MC-025 Admin-Verwaltung"), MC-064/065/066 (Developer-Account-System, bereits live).

## Überblick

MC-025 wurde am 2026-06-05 geschrieben und beschreibt ein vollständiges Zugriffsverwaltungs- und Analytics-System für die Public API, phasiert in „Phase 1 — Zugriffsverwaltung" (Fundament) und „Phase 2 — Enforcement + Usage Analytics". MC-025 datiert von **vor** dem Developer-Account-System (MC-064, 2026-06-27) und geht deshalb noch von einer eigenen, MC-025-internen Antragsteller-Verifikation (Magic-Link) aus — Phase 2 in MC-025s eigener Zählung.

Da Entwickler jetzt bereits einen verifizierten, eingeloggten Account auf developer.musiccloud.io haben (Session-Cookie, `authenticateDeveloper`-Guard), ist MC-025s eigene Magic-Link-Idee redundant. Dieser Spec reconciled MC-025 mit dem aktuellen Stand: Antragstellung und Self-Service-Key-Verwaltung laufen über den bestehenden Developer-Account (kein separates Verfahren), genau wie es der bereits abgenommene [developer-site-design.md](2026-06-26-developer-site-design.md) unter „Sub-Projekt 3 (verzahnt)" vorsieht.

**Dieser Durchgang (A–C) baut ausschliesslich das Backend:** Datenmodell, Token-Service, Admin-API und Developer-Self-Service-API. Beide Dashboard-UIs (Admin-Verwaltungsseite und Developer-Portal-Self-Service-Tabs) sind separate Folge-Pläne. Bis dahin sind ausgestellte Tokens nicht gegen die echte Public API durchgesetzt (bleibt MC-025 Phase 2).

## Entscheidungen (dieser Durchgang)

1. **Berechtigung:** `owner` + `admin` dürfen Anträge prüfen und Clients/Tokens verwalten (MC-025s eigene Präferenz). Serverseitig per frischem DB-Rollen-Lookup (`getCaller`-Pattern aus `admin-users.ts`), nie per JWT-`role`-Claim.
2. **Umfang „verzahnt":** `api_access_requests` und `api_clients` bekommen eine `developer_account_id`-FK (wie in developer-site-design.md vorgesehen). Antragstellung UND Self-Service-Tokenverwaltung laufen für den Entwickler über seinen bestehenden Account — kein separates Magic-Link-Verfahren.
3. **Self-Service-Lücke geschlossen:** MC-025s Admin-Endpunkte deckten nur Admin-seitige Token-Erstellung/-Rotation/-Widerruf ab. Der abgenommene Spec sagt aber explizit, Entwickler „verwalten nach manueller Freigabe ihre Keys **selbst**" — deshalb bekommt der Entwickler eigene, ownership-geprüfte Endpunkte für Tokens seiner eigenen Clients, zusätzlich zu (nicht anstelle von) den Admin-Endpunkten für Moderation/Eingriff.
4. **ID-Typ:** Alle neuen Tabellen nutzen `text("id").primaryKey()` mit `nanoid()` statt der in MC-025 vorgeschlagenen `uuid`-PKs. Grund: **kein einziger** Tabelle im aktuellen Schema nutzt `uuid` (verifiziert, siehe unten) — jede bestehende Tabelle inkl. `developer_accounts` nutzt `text`+`nanoid()`. Ein `uuid`-Ausreisser wäre Inkonsistenz ohne Nutzen; MC-025 selbst formuliert das als "dürfen", nicht als Pflicht.
5. **Token-Format:** `mc_live_<prefix>_<secret>`, SHA-256-Hash gespeichert, `X-API-Key`-Header — bereits so in Landing/Docs gezeigt (`apps/developer/src/pages/index.astro:63`, `docs/api.astro:113`), kein Token-Tausch-Flow.
6. **Audit-Trail-Lücke geschlossen:** `api_access_audit_events` bekommt zusätzlich zu `actor_admin_id` ein `actor_developer_account_id` (fehlte in MC-025, weil vor Self-Service geschrieben) — sonst gäbe es keinen Audit-Trail für Self-Service-Aktionen.
7. **Rate-Limit-Defaults:** `requests_per_minute` default `60`, `requests_per_day` default `10000` (Free-Tier-Startwerte). Ohne Live-Konsequenz in diesem Durchgang, da Enforcement erst in MC-025 Phase 2 kommt — vom Admin bei Genehmigung änderbar.

## Datenmodell (Migration `0048`, `apps/backend/src/db/schemas/postgres.ts`)

Syntax-Vorlage: `adminUsers` (`postgres.ts:824-839`) für Grundmuster, `developerAccounts`/`developerIdentities` (`postgres.ts:1425-1477`) für `check(...)`/`index(...)`-Constraint-Syntax mit `text`-IDs. Neue Tabellen werden ans Dateiende angehängt (nach `developerEmailTokens`, aktuell endend bei Zeile 1509).

### `api_access_requests`
```
id text primary key (nanoid)
developer_account_id text not null references developer_accounts(id) onDelete cascade
contact_email text not null            -- Anzeigewert (= account.email zum Zeitpunkt des Antrags)
app_name text not null
app_description text not null
estimated_requests_per_day integer not null
status text not null default 'pending' -- check IN ('pending','approved','rejected','archived')
submitted_at timestamptz not null defaultNow
reviewed_at timestamptz null
reviewed_by_admin_id text null references admin_users(id)
review_note text null
```
Indizes: `(status, submitted_at)`, `(developer_account_id)`.

### `api_clients`
```
id text primary key (nanoid)
request_id text null references api_access_requests(id)
developer_account_id text not null references developer_accounts(id) onDelete cascade
app_name text not null
contact_email text not null
description text not null
status text not null default 'active'  -- check IN ('active','suspended','revoked')
requests_per_minute integer not null default 60
requests_per_day integer not null default 10000
created_at timestamptz not null defaultNow
updated_at timestamptz not null defaultNow
created_by_admin_id text null references admin_users(id)
```
Indizes: `(status)`, `(developer_account_id)`.

### `api_client_tokens`
```
id text primary key (nanoid)
client_id text not null references api_clients(id) onDelete cascade
token_prefix text not null
token_hash text not null
status text not null default 'active'  -- check IN ('active','revoked','rotated')
created_at timestamptz not null defaultNow
last_used_at timestamptz null
revoked_at timestamptz null
rotated_from_token_id text null references api_client_tokens(id)
```
Indizes: unique `(token_prefix)`, unique `(token_hash)`, `(client_id, status)`.

### `api_access_audit_events`
```
id text primary key (nanoid)
client_id text null references api_clients(id)
request_id text null references api_access_requests(id)
token_id text null references api_client_tokens(id)
event_type text not null                -- request_submitted, request_approved, request_rejected, client_updated, token_created, token_revoked, token_rotated
actor_admin_id text null references admin_users(id)
actor_developer_account_id text null references developer_accounts(id)
occurred_at timestamptz not null defaultNow
event_data jsonb not null default '{}'
```
Index: `(client_id, occurred_at)`.

Row-Types via `export type ApiAccessRequestRow = typeof apiAccessRequests.$inferSelect` etc. (Muster aus `developerAccounts`).

## Token-Handling

- Format `mc_live_<prefix>_<secret>`, Prefix + Secret via `crypto.randomBytes` (kryptografisch stark).
- Gespeichert wird ausschliesslich `sha256(token).hex` als `token_hash`; `token_prefix` bleibt im Klartext für Anzeige/Lookup.
- Klartext-Token nur in der Create-/Rotate-Response, nie geloggt, nie in `event_data`.
- Validierung (für spätere Enforcement-Phase, hier nur der Service-Helper): Prefix-Lookup → Hash-Vergleich → Status-Check.

## Backend-API

### Repository/Adapter (neues Domain-File, Muster `developer-repository.ts`/`postgres-developer.ts`)

- `apps/backend/src/db/api-access-repository.ts` — Interface `ApiAccessRepository` + DTOs (`ApiAccessRequest`, `ApiClient`, `ApiClientToken`, `ApiAccessAuditEvent`).
- `apps/backend/src/db/adapters/postgres-api-access.ts` — `*Row`-Interfaces + `rowToX`-Mapper + Funktionen `(pool: Pool, ...)`, ID-Erzeugung via `generateTrackId()`-Äquivalent (neue `generateId()`-Funktion oder Wiederverwendung von `nanoid()` direkt, am Execute-Time entscheiden).
- Delegation in `postgres.ts`: `class PostgresAdapter implements TrackRepository, AdminRepository, CcRepository, DeveloperRepository, ApiAccessRepository` + aliased Imports + One-Line-Delegation (Muster `postgres.ts:194-207` / `:956-1016`).
- Accessor `getApiAccessRepository()` in `db/index.ts` (Muster `:18-33`).

### Service

- `apps/backend/src/services/api-access-token.ts` — Token-Generierung (`mc_live_<prefix>_<secret>`), Hashing (SHA-256), Display-Formatierung (Prefix + „•••" für Listen), Audit-Event-Payload-Bau.

### Admin-Endpunkte (`ENDPOINTS.admin.developer.apiAccess.*`, neue Gruppe nach `admin.crawler`, `endpoints.ts:307-318`)

Guard: `adminRoutes`-Plugin (`server.ts:640-653`, `authenticateAdmin`) **plus** `getCaller`-Rollen-Check (`admin-users.ts:310-314`-Muster) auf `owner`/`admin`, Moderator → 403.

- `GET /api/admin/developer/api-access` — Übersicht (offene Anträge + aktive Clients).
- `GET /api/admin/developer/api-access/requests/:id`
- `POST /api/admin/developer/api-access/requests/:id/approve` — legt **immer eine neue** `api_clients`-Zeile an (verknüpft via `request_id`; ein Antrag beschreibt eine App, nie ein Merge in einen bestehenden Client), setzt `status=approved`.
- `POST /api/admin/developer/api-access/requests/:id/reject` — `review_note` Pflichtfeld.
- `GET /api/admin/developer/api-access/clients/:id`
- `PATCH /api/admin/developer/api-access/clients/:id` — Status, Rate-Limits.
- `POST /api/admin/developer/api-access/clients/:id/tokens` — Admin-seitige Token-Erstellung (Moderation/Support-Fall).
- `POST /api/admin/developer/api-access/tokens/:id/revoke`
- `POST /api/admin/developer/api-access/tokens/:id/rotate`

### Developer-Self-Service-Endpunkte (`ENDPOINTS.dev.apiAccess.*`, neue Gruppe neben `dev.auth`, `endpoints.ts:321-352`; NEU: erste `dev.*`-Gruppe mit Param-Pfaden → braucht `ROUTE_TEMPLATES`-Twins, bisher hat `dev` keine)

Guard: root-scope-Registrierung wie `devAuthRoutes` (`server.ts:583-588`), `authenticateDeveloper` als `preHandler` (setzt `request.developerAccountId`, `plugins/auth.ts:190-214`). Jede Route prüft zusätzlich Ownership (`client.developerAccountId === request.developerAccountId`, sonst 404 — kein 403, um keine Existenz fremder Clients zu verraten).

- `POST /api/dev/api-access/requests` — Antrag stellen (`appName`, `appDescription`, `estimatedRequestsPerDay`; `contactEmail` = `account.email`).
- `GET /api/dev/api-access/requests` — eigene Anträge.
- `GET /api/dev/api-access/clients` — eigene Clients inkl. Token-Liste (nie Hash/Klartext).
- `POST /api/dev/api-access/clients/:id/tokens` — eigenen Token erstellen (Self-Service).
- `POST /api/dev/api-access/tokens/:id/revoke` — eigenen Token widerrufen.
- `POST /api/dev/api-access/tokens/:id/rotate` — eigenen Token rotieren.

Dedizierter `new RateLimiter(20, 60_000)` (Muster `githubExchangeRateLimiter`, MC-065) auf die drei Token-mutierenden Dev-Routen, getrennt vom globalen `apiRateLimiter`.

## Dashboard-Admin-UI (D) — separater Folge-Plan

Sidebar „Developer" → „API Access", `/developer/api-access`, `PageLayout`/`DataTable`-Muster (MC-025-Vorgabe unverändert). Nicht Teil dieses Durchgangs.

## Developer-Portal-UI (E) — separater Folge-Plan

Aktiviert die bestehenden „Soon"-Nav-Items `api-access`/`api-keys` in `apps/developer/src/lib/dashboardTabs.ts`. Nicht Teil dieses Durchgangs.

## Privacy/Security

Unverändert aus MC-025: Keys nur gehasht, Klartext einmalig, kein Logging von Klartext-Tokens/-Hashes in `event_data`, Admin-Zugriffe auditiert (jetzt auch Developer-Self-Service-Aktionen, s. Entscheidung 6).

## Ausdrücklich ausserhalb dieses Durchgangs

- Public-API-Enforcement (`authenticatePublic` prüft `api_client_tokens` noch nicht) — MC-025 Phase 2.
- Rate-Limit-/Quota-Durchsetzung an der echten API-Grenze — MC-025 Phase 2.
- `api_usage_events` / Consumer-Analytics — MC-025 Phase 2.
- E-Mail-Benachrichtigung bei Genehmigung/Ablehnung — MC-025 nennt das explizit als separat zu bauen.
- `GET /api/v1/resolve`-Cutover-Entscheidung — MC-025 Phase 2.
- Beide UI-Hälften (D, E) — eigene Folge-Pläne, s. o.

## Verifizierte Fakten (2026-07-01, paralleler Pattern-Audit)

- **Migrationen:** höchste vorhandene `0047_lumpy_kulan_gath.sql`; nächste freie Nummer `0048`.
- **`postgres.ts`** (1509 Zeilen): `adminUsers` (`:824-839`, `text`-PK, kein `check`/`index`). `developerAccounts`/`developerIdentities`/`developerEmailTokens` (`:1425-1509`) — `text("id").primaryKey()`, `check(...)` (`:1441-1442`, `:1474-1475`), `index(...)` (`:1503`), `timestamp(col, {withTimezone:true})` (`:1430`). **Kein `uuid`-PK existiert irgendwo im Schema** — Begründung für Entscheidung 4.
- **Repository-Pattern:** `AdminRepository`-Interface `admin-repository.ts:306-829` (40+ Methoden, Track/Album/Artist/Content/Nav u. a.); `DeveloperRepository`-Interface `developer-repository.ts:102-237` — das näher am Zielmuster liegende, kleinere Vorbild für ein neues `ApiAccessRepository`.
- **Adapter-Komposition** `adapters/postgres.ts`: `class PostgresAdapter implements TrackRepository, AdminRepository, CcRepository, DeveloperRepository` (`:231`); aliased Imports aus `postgres-developer.ts` (`:194-207`), One-Line-Delegation (`:956-1016`).
- **Accessor** `db/index.ts:18-33`: `getAdminRepository()`/`getDeveloperRepository()` — `getApiAccessRepository()` folgt demselben Muster.
- **Endpoints** `packages/shared/src/endpoints.ts` (418 Zeilen): `admin`-Gruppe endet bei `:319` (letzte Untergruppe `crawler` `:307-318`); `dev`-Gruppe `:321-352` (`auth.*` inkl. `github.{start,exchange}`). `ROUTE_TEMPLATES` (`:361-418`) deckt bisher **keine** `dev.*`-Routen ab — die neuen `dev.apiAccess.*`-Param-Routen sind die ersten, die das brauchen.
- **Guards** `plugins/auth.ts`: `authenticateDeveloper` (`:190-214`, Cookie → JWT-Verify → `SessionKind.Developer`-Check → `findDeveloperAccountById` → `request.developerAccountId`); `authenticateAdmin` (`:150-164`, Bearer-JWT, `role==="admin"`). `getCaller`-Helper in `routes/admin-users.ts:310-314` (lädt frische DB-Rolle über `request.user.sub`, vertraut NICHT dem JWT-`role`-Claim) — Vorlage für den Owner/Admin-Check der neuen Admin-Routen.
- **Server-Registrierung** `server.ts`: `protectedRoutes` (`:631-638`, `authenticatePublic`), `adminRoutes` (`:640-653`, `authenticateAdmin`), `devAuthRoutes`/`devGitHubRoutes` (`:583-588`, root-scope, public, eigener Cookie-Guard je Route).
- **Rate-Limiting** `lib/infra/rate-limiter.ts:30-36`: `class RateLimiter(maxRequests, windowMs)`, `.check(key)` → `RateLimitCheck {limited, limit, remaining, retryAfterSeconds, windowSeconds}`; `sendRateLimitError` in `rate-limit-response.ts:7-16`.
- **ID-Erzeugung** `lib/short-id.ts:1-11`: `nanoid`-basiert (`generateTrackId()` = `nanoid(21)`, `generateShortId()` = `nanoid(5)`); kein `uuid`-Präzedenzfall im Repo.
- **Token-Format bereits live gezeigt:** `apps/developer/src/pages/index.astro:63`, `apps/developer/src/pages/docs/api.astro:113` — beide `X-API-Key: mc_live_…`.
- [x] Alle Referenzen gegen den aktuellen Code verifiziert (paralleler Explore-Agent-Audit, 2026-07-01), vor dem ersten Edit erneut zu prüfen.

## Offene Punkte / Risiken

- `generateId()`-Helper für die neuen Tabellen: entweder eine neue kleine `nanoid()`-Wrapper-Funktion oder direkte `nanoid()`-Aufrufe im Adapter — am Execute-Time nach bestehendem Muster in `postgres-developer.ts` entscheiden (dort wird ID-Erzeugung direkt im Adapter gemacht, nicht über `short-id.ts`).
- Admin-seitige Token-Erstellung (`clients/:id/tokens`) bleibt bestehen, obwohl Self-Service existiert — für Support-/Moderationsfälle, in denen ein Admin im Namen eines Entwicklers handeln muss. Kein Konflikt, beide Pfade schreiben denselben Audit-Trail mit unterschiedlichem `actor_*`-Feld.
