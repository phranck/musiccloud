# Public API: Zugriffsverwaltung, Key-Pflicht und Usage Analytics

Plan-Nr.: MC-025

Status: offen
Erstellt: 2026-06-05 · Zusammengelegt am 2026-06-25 (vereint die früheren Pläne MC-025 und MC-030)
Scope: Dashboard-Verwaltungsseite, Admin-API, Token-/Client-Datenmodell, verpflichtende API-Keys an der Public-API-Grenze und key-basierte Usage Analytics.

## Überblick

musiccloud soll seine Public API nur noch für genehmigte Anwendungen zugänglich machen, die zuvor einen Zugriffs-Token von uns erhalten haben. Dieser Plan beschreibt den vollständigen Bogen von der Antragstellung über die Genehmigung und Token-Ausgabe bis zur tatsächlichen Durchsetzung der Key-Pflicht an der API-Grenze und der nachvollziehbaren Auswertung der Nutzung.

Der Plan vereint zwei eng verzahnte Bausteine, die ursprünglich getrennt geplant waren. Der erste Baustein ist die **Zugriffsverwaltung**: ein Datenmodell für Anträge, Clients, Tokens und Audit-Events, die zugehörige Admin-API sowie eine Verwaltungsseite im Dashboard, über die genehmigt, gesperrt, rotiert und widerrufen wird. Der zweite Baustein ist die **Durchsetzung und Auswertung**: an der Public-API-Grenze wird der API-Key verpflichtend geprüft, anonyme Requests werden nach dem Cutover abgelehnt, und jede genehmigte Nutzung fließt pseudonym in eine Usage-Statistik (Consumer, Endpoint, Status, Fehlerklasse, Latenz, Cache-Status). Baustein zwei setzt zwingend auf den Tabellen und der Token-Mechanik aus Baustein eins auf, deshalb gehören beide in einen Plan.

Vier Leitplanken durchziehen den gesamten Plan: Ein API-Key identifiziert eine **Integration, App oder Organisation, niemals eine Person**. Keys werden **nur gehasht** gespeichert und Klartext genau einmal nach Erstellung oder Rotation angezeigt. Die **eigene Website nutzt keinen geheimen Public-API-Key im Browser**, sondern weiterhin den internen First-Party-Pfad (BFF). Und Usage Analytics bleiben **serverseitig und pseudonym** — keine Roh-IPs, kein Fingerprinting.

## Hintergrund: Zusammenlegung

Dieser Plan ersetzt die frühere Aufteilung in „Developer API Access Management" (MC-025) und „API-Key-Pflicht und Usage Analytics" (MC-030). MC-030 liegt jetzt in `.codex/plans/skipped/` mit einem entsprechenden Vermerk; sein Inhalt ist hier vollständig übernommen. MC-025 bleibt die Leitnummer, weil die Zugriffsverwaltung das Fundament ist, auf dem Durchsetzung und Analytics aufbauen. Die Umsetzung erfolgt zweiphasig: erst die Verwaltung (Phase 1), dann Enforcement und Analytics (Phase 2).

## Ziel

Antragsteller liefern beim Antrag:

- Kontakt-E-Mail-Adresse
- App-Name
- App-Beschreibung
- geschätzte Requests pro Tag

Die öffentliche Info-Seite, die öffentliche Antrags-Route und die Benachrichtigungs-E-Mail-Vorlage werden separat im Dashboard erstellt. Dieser Plan deckt die Verwaltungsseite, das Backend-Fundament zum Ausstellen, Widerrufen, Rotieren und Rate-Limiten von Zugriffs-Tokens sowie die anschließende Durchsetzung an der Public-API-Grenze und die Usage Analytics ab.

## Grundsatzentscheidungen

- Eigener Dashboard-Sidebar-Bereich `Developer` mit einem ersten Eintrag `API Access`; Route `/developer/api-access`.
- Zugriffs-Tokens sind App-/Client-Credentials, keine Personen-Identitäten.
- In der Datenbank werden ausschließlich Token-Hashes gespeichert; Klartext-Tokens werden nur einmalig nach Erstellung oder Rotation angezeigt.
- Die First-Party-Website/BFF-Grenze bleibt strikt von externen Public-API-Tokens getrennt; geheime Public-API-Tokens erscheinen nie im Browser-Code.
- `INTERNAL_API_KEY` darf nicht als externer Consumer-Key wiederverwendet werden — BFF-Key und externe API-Keys bleiben getrennt.
- Anträge und aktive Clients werden in der ersten Iteration auf derselben Seite verwaltet.
- Der Verwaltungszugriff wird serverseitig auf Admin-Rollen beschränkt, die Tokens ausstellen dürfen. Bevorzugt `owner | admin`, optional auf `owner` verengbar, falls die Produktrichtlinie es verlangt.
- Backend-Auth-Detail: `authenticateAdmin` prüft aktuell nur den JWT-Claim `role: "admin"`. Die echten Dashboard-Rollen sind DB-Rollen (`owner`, `admin`, `moderator`), exponiert als `dbRole`/User-Payload. Die serverseitige Verwaltungs-Autorisierung muss den Aufrufer per `request.user.sub` über das Admin-Repository laden und die frische DB-Rolle prüfen — analog zu `apps/backend/src/routes/admin-users.ts`. `owner` darf nicht gegen den JWT-`role`-Claim geprüft werden.
- Die Public-API-Routen werden vor der Durchsetzung vollständig klassifiziert: external public API, First-Party-BFF, public SSR-Helper, Telemetry. Anonyme Public-API-Requests werden nach dem Rollout abgelehnt und nur noch als rejected traffic gezählt.

## Ist-Zustand im Code

Abgleich vom 2026-06-05. Diese Tabelle beschreibt den aktuellen Code, nicht das Zielbild.

| Bereich | Primärquelle | Befund | Konsequenz |
|----|----|----|----|
| Route-Registrierung | `apps/backend/src/server.ts:415-484` | Public API ist gemischt: Share, Preview, Artist-Info, Random, Services, Nav, Content, GET Resolve und Telemetry sind root-scope ohne Public Auth (`:416-460`). Nur POST Resolve, CC-Resolve und Link laufen im `protectedRoutes`-Block mit `authenticatePublic` (`:463-469`); Admin-Routen im `adminRoutes`-Block mit `authenticateAdmin` (`:472-484`). | Vor der Key-Pflicht jede Public-Route klassifizieren: external API, First-Party-BFF, SSR-Helper, Telemetry. |
| Auth-Plugin | `apps/backend/src/plugins/auth.ts:53-120` | `authenticatePublic` akzeptiert entweder `X-API-Key` gleich `INTERNAL_API_KEY` oder Bearer JWT. Keine Consumer-Tabelle, keine Scopes, keine Key-Hashes. | Neues Key-System darf `INTERNAL_API_KEY` nicht als externen Consumer-Key wiederverwenden. |
| Admin-Auth | `apps/backend/src/routes/admin-users.ts` | `authenticateAdmin` prüft nur JWT `role: "admin"`; echte Rollen sind DB-Rollen. | Verwaltungs-Autorisierung über Caller-Lookup (`request.user.sub`) + frische DB-Rolle. |
| Token-Endpoint | `apps/backend/src/routes/auth.ts:1-30`, `:120-152` | OAuth Client Credentials als MVP, nur mit Env-basiertem `API_CLIENT_ID`/`API_CLIENT_SECRET`. | DB-Consumer mit gehashten Secrets, Scopes, Quotas und Audit-Events ersetzen die Env-Registry. |
| Rate Limiting | `apps/backend/src/lib/infra/rate-limiter.ts:63-99`, `:110-127` | 10 Requests/Minute pro `request.ip`, mit BFF-Bypass für interne SSR-Requests per `INTERNAL_API_KEY`. | Key-basierte Limits nötig; IP-/Network-Actor-HMAC bleibt Abuse-Zusatzsignal, nicht primäre Identität. |
| POST Resolve | `apps/backend/src/routes/resolve.ts:104-190`, `:190-337` | Durch `authenticatePublic` geschützt, aber ohne attribuierbare Per-Client-Identität (bloßer `jwtVerify()` ohne Client-Claim ODER `X-API-Key`-BFF); IP-limitiert (`:199-204`), keine Usage Events. | Beste Startstelle für Usage-Middleware: Client-Identität muss der neue Opaque-Token-Service liefern; Usage Event nach Response. |
| GET Resolve | `apps/backend/src/routes/resolve-public-get.ts:1-25`, `:59-216` | Explizit unauthentifiziert für Shortcuts, curl, Bookmarklets; Abuse-Schutz nur IP-Limit. | Größter Cutover-Punkt: Key-Pflicht auch für GET oder De-Promotion zu Legacy/disabled. |
| Share und Preview | `apps/backend/src/routes/share.ts:43-212`, `apps/backend/src/routes/share-preview.ts:23-101` | Anonym erreichbar, umgehen IP-Limit für interne BFF-Requests. | External API und Website-SSR trennen, damit Browser-Sharepages ohne externen Key funktionieren. |
| Artist Info | `apps/backend/src/routes/artist-info.ts:72-247` | Anonym erreichbar, Cache-TTLs, von der Website clientseitig über Astro-Proxy geladen. | Für Public API keypflichtig; für Website über BFF First-Party halten. |
| Frontend-BFF | `apps/frontend/src/api/client.ts:35-53`, `:90-108`, `:177-184` | Astro-Proxies hängen `INTERNAL_API_KEY` und `X-Forwarded-For` an Backend-Calls. | Eigene Website bekommt keinen externen Key; BFF-Key bleibt intern. |
| OpenAPI-Doku | `apps/backend/src/server.ts:189-206`, `:231-249` | Beschreibt Credentials für die meisten Endpoints, nennt aber mehrere read-only Endpoints bewusst anonym und filtert interne Routen aus der Public Reference. | Key-Umstellung ist auch eine OpenAPI-/Docs-Änderung (Security-Blocks, Texte, Transform-Filter). |
| DB-Schema | `apps/backend/src/db/schemas/postgres.ts:1-420`, `:857-878` | Keine Tabellen für API-Anträge, Clients, Tokens, Token-Audit oder Usage Events. | Die API-Key-Infrastruktur ist ein neues Datenmodell, keine kleine Env-Erweiterung. |
| Dashboard-Gerüst | `apps/dashboard/src/routes.tsx`, `apps/dashboard/src/components/layout/Sidebar.tsx` | Routen zentral registriert; Sidebar-Bereiche via `DashboardSection`; Seiten nutzen `PageLayout`, `PageHeader`, `PageBody`, `DataTable`, `DashboardActionButton`. | Verwaltungsseite folgt diesen bestehenden Mustern. |
| Migrationen | `apps/backend/src/db/schemas/postgres.ts` + Drizzle-Workflow | Drizzle ist das konfigurierte Migrationstool. | Migrationen ausschließlich über den Drizzle-Workflow erzeugen/anwenden, nie manuell editieren. |

## Datenmodell

Drizzle-Schema-Einträge in `apps/backend/src/db/schemas/postgres.ts` ergänzen.

Schema-Ausrichtung am Bestand:

- API-Access-Entity-IDs dürfen Drizzle-UUIDs via `uuid("id").defaultRandom().primaryKey()` nutzen.
- Admin-/User-Referenzen bleiben `text` und referenzieren `admin_users.id`, weil die aktuellen Admin-User-IDs text-/nanoid-basiert sind.
- Status-Felder und positive numerische Limits werden sowohl in der Route-Validierung als auch in Drizzle-`check(...)`-Constraints erzwungen.
- FK-`onDelete`-Verhalten für Antrag-, Client-, Token- und Audit-Referenzen vor der Migration bewusst festlegen.

### `api_access_requests`

- `id` uuid primary key
- `contact_email` text not null
- `app_name` text not null
- `app_description` text not null
- `estimated_requests_per_day` integer not null
- `status` text not null, einer von `pending`, `approved`, `rejected`, `archived`
- `submitted_at` timestamptz not null default now
- `reviewed_at` timestamptz null
- `reviewed_by_admin_id` text null, referenziert Admin-User-ID wo möglich
- `review_note` text null

Indizes: Status plus Eingangsdatum; Kontakt-E-Mail.

### `api_clients`

- `id` uuid primary key
- `request_id` uuid null, referenziert `api_access_requests`
- `app_name` text not null
- `contact_email` text not null
- `description` text not null
- `status` text not null, einer von `active`, `suspended`, `revoked`
- `requests_per_minute` integer not null
- `requests_per_day` integer not null
- `created_at` timestamptz not null default now
- `updated_at` timestamptz not null default now
- `created_by_admin_id` text null

Indizes: Status; Kontakt-E-Mail; App-Name.

### `api_client_tokens`

- `id` uuid primary key
- `client_id` uuid not null, referenziert `api_clients`
- `token_prefix` text not null
- `token_hash` text not null
- `status` text not null, einer von `active`, `revoked`, `rotated`
- `created_at` timestamptz not null default now
- `last_used_at` timestamptz null
- `revoked_at` timestamptz null
- `rotated_from_token_id` uuid null

Indizes: unique Token-Prefix; unique Token-Hash; Client-ID plus Status.

### `api_access_audit_events`

- `id` uuid primary key
- `client_id` uuid null
- `request_id` uuid null
- `token_id` uuid null
- `event_type` text not null, z. B. `request_submitted`, `request_approved`, `request_rejected`, `client_updated`, `token_created`, `token_revoked`, `token_rotated`
- `actor_admin_id` text null
- `occurred_at` timestamptz not null default now
- `event_data` jsonb not null default `{}`

### `api_usage_events`

Persistiert wird `endpoint_template`, nicht die volle URL. Querystrings und Bodies werden nicht blind gespeichert.

```text
api_usage_events
  id uuid primary key
  occurred_at timestamptz not null
  request_id text not null
  api_client_id uuid not null
  api_client_token_id uuid not null
  api_network_actor_key text null
  method text not null
  endpoint_template text not null
  action_type text not null
  platform text null
  status_code integer not null
  error_class text null
  duration_ms integer not null
  cache_status text null
  rate_limit_state text null
  response_size_bucket text null
  user_agent_family text null
  origin_domain text null
  referrer_domain text null
  event_data jsonb not null default '{}'
```

## Token-Handling

Token-Format:

```text
mc_live_<prefix>_<secret>
```

Regeln:

- Prefix und Secret mit kryptografisch starker Zufälligkeit erzeugen (`crypto.randomBytes`).
- Nur einen Hash des vollständigen Tokens speichern (SHA-256 oder HMAC-SHA-256, als Hex-Text).
- `token_prefix` zur Identifikation sichtbar halten.
- Klartext nur in der API-Antwort unmittelbar nach Erstellung/Rotation zeigen.
- Klartext-Tokens nicht loggen und nicht in Audit-Event-JSON aufnehmen.
- Vor der Implementierung festlegen, wie dieses direkte Opaque-Token-Modell mit dem bestehenden `/api/auth/token`-Flow interagiert (der aktuell Env-basierte Client-Credentials gegen kurzlebige JWTs tauscht): Entweder werden DB-Tokens das akzeptierte Public-Bearer-Credential, oder sie ersetzen/speisen den Client-Credentials-Endpoint — nicht beide Semantiken implizit umsetzen.

## Applicant- und Admin-Flows

Die Token- und Client-Verwaltung ist das Fundament (Phase 1) und nutzt `api_access_requests`, `api_clients`, `api_client_tokens` und `api_access_audit_events`. Phase 2 ergänzt Public Request Intake, Enforcement, tokenbewusste Rate Limits und `api_usage_events`.

### Applicant

- API-Access-Seite öffnen.
- Name, E-Mail, Organisation, Website und Use Case angeben.
- Erwartetes Volumen und Terms akzeptieren.
- E-Mail verifizieren.

### Admin

- Neue Anträge im Dashboard sehen.
- Use Case, Volumen und Domain prüfen.
- Scopes, Quotas und Rate Limits setzen.
- Genehmigen, ablehnen oder rückfragen.

### Key

- Key erzeugen und einmalig anzeigen.
- Key-Hash speichern, Klartext verwerfen.
- Prefix und letzte Nutzung anzeigen.
- Rotation und Widerruf ermöglichen.

### Analytics

- Requests pro Consumer erfassen.
- Endpoint-Sequenzen berechnen.
- Quota, 429 und Fehlerquoten zeigen.
- Heavy Consumer markieren.

## Backend-API

### Admin-Endpunkte (Verwaltung)

Shared-Endpoint-Konstanten in `packages/shared/src/endpoints.ts` ergänzen (`ENDPOINTS.admin.developer.apiAccess.*` plus passende `ROUTE_TEMPLATES.admin.developer.apiAccess.*` für jede `:id`-Route).

- `GET /api/admin/developer/api-access`
- `GET /api/admin/developer/api-access/requests/:id`
- `POST /api/admin/developer/api-access/requests/:id/approve`
- `POST /api/admin/developer/api-access/requests/:id/reject`
- `GET /api/admin/developer/api-access/clients/:id`
- `PATCH /api/admin/developer/api-access/clients/:id`
- `POST /api/admin/developer/api-access/clients/:id/tokens`
- `POST /api/admin/developer/api-access/tokens/:id/revoke`
- `POST /api/admin/developer/api-access/tokens/:id/rotate`

Backend-Route-Modul `apps/backend/src/routes/admin-api-access.ts` anlegen und in der admin-geschützten Route-Gruppe in `apps/backend/src/server.ts` registrieren.

Repository/Service:

- API-Access-DTOs in `apps/backend/src/db/admin-repository.ts` (oder dediziertem Repository-Typ).
- Postgres-Adapter `apps/backend/src/db/adapters/postgres-api-access.ts`, eingebunden über `apps/backend/src/db/adapters/postgres.ts`.
- Service-Helfer für Token-Generierung, -Hashing und Display-Formatierung.

Validierung: syntaktisch valide E-Mail; gebundene Strings für App-Name/Beschreibung; positive Ganzzahl für Requests/Tag; positive Rate-Limits; unbekannte Status ablehnen; nie Token-Hashes zurückgeben; Status- und Positiv-Ganzzahl-Validierung zusätzlich als DB-`check(...)`-Constraints.

### Public-API-Enforcement

Aufbauend auf dem Token-Service aus Phase 1:

- Externe Token-Validierungs-Middleware: Prefix/Hash-Lookup, Statusprüfung, Client-Kontext setzen, `last_used_at` aktualisieren.
- Token-/Client-Kontext an den Request anhängen, sodass Handler und Usage-Erfassung ihn lesen können.
- First-Party-BFF-Bypass (`isInternalRequest`/`INTERNAL_API_KEY`) erhalten; globale `@fastify/rate-limit`-Grenze von tokenbewussten externen Limits getrennt halten.
- Middleware zunächst im optional-loggenden Modus integrieren (Keys validieren, Kontext setzen, anonyme Requests noch nicht blockieren), dann route-by-route auf required schalten.
- Entscheiden, ob der unauthentifizierte `GET /api/v1/resolve` deaktiviert, deprecated oder hinter Key-Auth verschoben wird.

## Dashboard-UI

### Verwaltung (Developer / API Access)

Feature-Verzeichnis `apps/dashboard/src/features/developer/` mit `ApiAccessPage.tsx`, `apiAccessApi.ts`, `hooks/useApiAccess.ts` (optional Component-Split für Tabellen und Token-Dialoge).

- Sidebar: `sectionDeveloper`/`apiAccess`-Labels in `apps/dashboard/src/i18n/messages.ts`; `SidebarDeveloperSection` in `apps/dashboard/src/components/layout/Sidebar.tsx`; passendes Phosphor-Icon (`CodeIcon`, `KeyIcon` oder `BracketsCurlyIcon`); nur für Admin-Rollen sichtbar, nicht für Moderatoren.
- Route: Lazy-Import in `apps/dashboard/src/routes.tsx`; `/developer/api-access` unter `RequireNonModerator` (oder `RequireOwner` bei Owner-only-Policy).
- Layout: bestehende `PageLayout`, `PageHeader`, `PageBody`, `DataTable` und Dialog-Komponenten nutzen.
- Sektionen: offene Anträge; genehmigte/abgelehnte Antragshistorie; aktive Clients; gesperrte/widerrufene Clients.
- Client-Detail-Controls: App-Name, Kontakt-E-Mail, Beschreibung, Status, Requests/Minute, Requests/Tag, Token-Liste (Prefix, Status, Erstell-/letztes-Nutzungsdatum), Aktionen (Token erstellen/rotieren/widerrufen, Client sperren/reaktivieren).

### Consumer Analytics

Ergänzend zur Verwaltungsseite (Phase 2):

- Requests, Resolves, Fehlerquote und Latenz pro Consumer.
- Endpoint-Flow und Request-Timeline.
- Heavy Consumers, Rate-Limit-Hits und auffällige Fehlerpfade.
- Key-Rotation, Widerruf und Audit-Log.

## Usage Analytics

Pflichtfelder pro Request:

| Feld | Quelle | Zweck |
|----|----|----|
| `api_client_id` | Validierter API-Key | Primäre Auswertungseinheit. |
| `api_client_token_id` | Key-Lookup über Prefix und Hash | Rotation, Abuse-Analyse, key-spezifische Limits. |
| `endpoint_template` | Router-Kontext | Aggregierbare Endpoint-Metriken ohne sensitive Parameter. |
| `action_type` | Route-Mapping | Fachliche Analyse wie `resolve`, `share_lookup`, `artist_info`. |
| `api_network_actor_key` | HMAC aus Zeitraum und IP-Präfix | Abuse-Zusatzsignal, nicht primäre Identität. |
| `duration_ms`, `cache_status`, `status_code` | Response-Lifecycle | Qualität, Performance, Fehlerraten. |

Endpoint-Scope:

| Endpoint | Action | Analytics-Fokus |
|----|----|----|
| `/api/v1/resolve` | `resolve` | Plattform, Media-Type, Trefferstatus, Fehlerklasse, Latenz, Cache-Hit. |
| `/api/v1/share/:shortId` | `share_lookup` | ShortId-Lookups, Consumer-Pfade nach Resolve, 404-Rate. |
| `/api/v1/share/:shortId/preview` | `preview_lookup` | Preview-Nutzung, Refresh-Erfolg, Anbieterfehler. |
| `/api/v1/artist-info` | `artist_info` | Popular Tracks, Similar Artists, Upcoming Events, Provider-Fehler. |
| `/api/v1/random-example` | `random_example` | Demo-/Dokumentationsnutzung, Consumer-Onboarding. |
| `/api/v1/content/:slug` | `content_lookup` | API-Dokumentation, Help-/Info-Zugriffe über API, 404-Rate. |

Usage-Events werden nach dem Response-Lifecycle erfasst (`endpoint_template`, `action_type`, Status, Dauer, Fehlerklasse, Cache-Status, pseudonymer Network Actor). Rollups, API-Client-Timeline und Endpoint-Flows bilden die Auswertungsbasis.

## Rate Limits, Quotas und Abuse

| Mechanismus | Basis | Dashboard-Anzeige |
|----|----|----|
| Per-minute Rate Limit | `api_client_token_id` | 429 pro API-Client und Endpoint. |
| Daily/Monthly Quota | `api_client_id` | Verbrauch, Prognose, Restbudget. |
| Network-Actor-Zusatzsignal | HMAC aus Zeitraum und IP-Präfix | Viele Keys aus gleichem Netz, auffällige Provider-Cluster. |
| Endpoint-spezifische Limits | Scope und Endpoint-Template | Teure Resolves separat von billigen Share-Lookups begrenzen. |

## Privacy und Security

- API-Keys nie im Klartext speichern, nie in Logs schreiben, nur einmalig anzeigen.
- Authorization-Header, Cookies, vollständige Querystrings und Request-Bodies nicht ungeprüft persistieren.
- Suchbegriffe bewusst behandeln: normalisierte Klartext-Speicherung nur nach Produktentscheidung, sonst Hash plus Metadaten.
- IP bleibt Abuse-Zusatzsignal: HMAC aus Zeitraum und IP-Präfix, keine Roh-IP.
- API Network Actor ist kein Haushalt — in der API-UI nie `household` oder `user` verwenden.
- Admin-Zugriffe auf Keys, Anträge und Usage-Daten werden auditiert.

## Implementierungsphasen

**Phase 1 — Zugriffsverwaltung (Fundament)**

1. Datenmodell (`api_access_requests`, `api_clients`, `api_client_tokens`, `api_access_audit_events`) per Drizzle.
2. Token-Service (Generierung, Hashing, Display).
3. Admin-API für Verwaltung.
4. Dashboard-Verwaltungsseite (Developer / API Access).

**Phase 2 — Public-API-Enforcement und Usage Analytics**

5. `api_usage_events`-Tabelle per Drizzle.
6. Public-API-Token-Middleware (erst loggend, dann required).
7. Usage-Event-Erfassung nach Response-Lifecycle.
8. Key-basierte Rate Limits und Quotas.
9. Applicant-Intake + Consumer-Analytics-UI.
10. OpenAPI-/Docs-Sync und Route-by-Route-Cutover.

## Checkliste

### Phase 1 — Zugriffsverwaltung (Fundament)

- [ ] Verwaltungs-Berechtigungspolicy festlegen und dokumentieren (`owner` only vs. `owner | admin`); serverseitige Checks via Caller-Lookup aus `request.user.sub`, nicht via JWT-`role`.
- [ ] Backend-DTO-/Request-/Response-Contracts für Anträge, Clients, Tokens, Audit-Events und einmalige Klartext-Token-Antworten definieren.
- [ ] Entscheiden, ob DB-ausgestellte Opaque-Tokens direkt von der Public-API-Auth akzeptiert werden oder den bestehenden `/api/auth/token`-JWT-Client-Credentials-Flow ersetzen/speisen.
- [ ] Token-Hashing-Strategie, Prefix-Länge, Token-Format und No-Plaintext-Logging/Audit-Regeln vor der Implementierung festlegen.
- [ ] Drizzle-Schema für `api_access_requests`, `api_clients`, `api_client_tokens`, `api_access_audit_events` inkl. Status-Checks, Positiv-Ganzzahl-Checks, FK-Constraints und bewusstem `onDelete`-Verhalten ergänzen.
- [ ] Migration ausschließlich mit dem konfigurierten Drizzle-Workflow erzeugen; bei Prompts, Schema-Drift oder Snapshot-Konflikten stoppen und berichten.
- [ ] Backend-Typecheck nach Schema-/Migrationsgenerierung ausführen.
- [ ] Shared-Endpoint-Konstanten und Route-Template-Helfer in `packages/shared/src/endpoints.ts` ergänzen (`ENDPOINTS.admin.developer.apiAccess.*` + passende `ROUTE_TEMPLATES.*` für jede `:id`-Route); danach Shared-Typecheck.
- [ ] API-Access-Typen und -Methoden in `apps/backend/src/db/admin-repository.ts` ergänzen, ohne Routen zu verdrahten.
- [ ] SQL-Implementierung in `apps/backend/src/db/adapters/postgres-api-access.ts`, dann mit Aliassen über `apps/backend/src/db/adapters/postgres.ts` delegieren.
- [ ] Backend-Service-Helfer für Token-Generierung, Hashing, Response-Shaping und Audit-Event-Erstellung.
- [ ] Backend-Unit-Tests: Token-Generierung, Hash-only-Persistenz, einmalige Klartext-Antwort, Response-Redaction; danach Backend-Typecheck und Tests.
- [ ] Admin-Route-Modul mit Validierung, Caller-DB-Rollen-Check, Moderator-Ablehnung und ohne Token-Hash-Exposition; in der admin-geschützten Route-Gruppe registrieren.
- [ ] Backend-Route-Tests: Permission-Ablehnung, Validierungsfehler, Antrag-Genehmigung, Client-Update, Token-Create/Revoke/Rotate; danach Backend-Typecheck und Tests.
- [ ] Dashboard-API-Client-Funktionen und Query-/Mutation-Hooks für die finalen Admin-Endpunkt-Contracts; danach Dashboard-Typecheck.
- [ ] Developer-Sidebar-Labels und admin-only Developer-/API-Access-Navigation; `/developer/api-access`-Route gemäß gewählter Policy registrieren; Sidebar-Sichtbarkeit (`isAdmin` bzw. `role === "owner"`) angleichen.
- [ ] API-Access-Seite mit `PageLayout`, `PageHeader`, `PageBody`, `DataTable`, bestehenden Buttons und Dialog-Patterns; States für Loading/Empty/Populated/Error/Mutation-in-Progress.
- [ ] Dashboard-Controls für Antrag genehmigen/ablehnen, Client-Status/Rate-Limits ändern, Token erstellen/rotieren/widerrufen; einmalige Klartext-Tokens nur im Create/Rotate-Erfolgsflow zeigen, nie in Listen-State cachen.
- [ ] Dashboard-Tests: Seiten-States, Permission-Sichtbarkeit (wo abgedeckt), Approval-Validierung, einmalige Token-Anzeige, Revoke/Rotate-Query-Invalidierung, Client-Status-Updates; danach Dashboard-Typecheck und Tests.
- [ ] React Doctor Full-Repo, falls React-/Dashboard-Komponenten wesentlich geändert wurden.
- [ ] Falls automatischer Applicant-Intake über den Form Builder läuft: zuerst die fehlende Backend-Route/Storage-Pipeline verifizieren/implementieren, sonst dedizierte API-Access-Antrags-Endpoints anlegen, statt `/admin/forms` end-to-end anzunehmen.

### Phase 2 — Public-API-Enforcement und Usage Analytics

- [ ] Public-API-Routen gegen den aktuellen Code klassifizieren und dokumentieren (external API, First-Party-BFF, SSR-Helper, Telemetry); keine Enforcement-Änderung in diesem Schritt.
- [ ] ADR/Doku für Key-Pflicht, Key-Hashing, Website-Abgrenzung, Privacy-Grenzen und Usage-Analytics-Felder ergänzen.
- [ ] Shared Contracts und Endpoint-Konstanten für Public Request Intake, Token-Enforcement-Kontext und Usage Analytics definieren; danach Shared-Typecheck.
- [ ] Drizzle-Schema für `api_usage_events` (und fehlende Public-Intake-Ergänzungen) per `pnpm db:generate`; danach Backend-Typecheck und Schema-/Adapter-Brüche beheben.
- [ ] Public-API-Validierung des bestehenden Token-Service nutzen (Prefix/Hash-Lookup, Statusprüfung, Client-Kontext, `last_used_at`); Generierung/Rotation/Widerruf nicht erneut implementieren.
- [ ] Applicant-Backend ohne Enforcement bauen: Antrag, E-Mail-Verifikation, Statusabfrage, Weitergabe in `api_access_requests`; Key-Ausgabe bleibt beim Management-Service.
- [ ] Applicant-UI mit bestehenden Public-/Dashboard-Patterns: API-Access-Seite, Magic-Link-Statusseite, Antragstatus, nach Freigabe Verweis auf einmalige Key-Anzeige; danach passende Typechecks.
- [ ] Admin-Analytics-UI als Ergänzung zur API-Access-Seite: Usage-Summary, Endpoint-Flow, 429/Fehlerquoten, Heavy Consumers.
- [ ] Public-API-Middleware im optional-loggenden Modus integrieren: Keys validieren, Consumer-Kontext setzen, anonyme Requests noch nicht blockieren; Website-BFF-Flows per Tests absichern.
- [ ] Usage-Event-Erfassung nach Response-Lifecycle: `endpoint_template`, `action_type`, Status, Dauer, Fehlerklasse, Cache-Status, pseudonymer Network Actor; danach Backend-Tests.
- [ ] Key-basierte Rate Limits und Daily/Monthly Quotas; IP-/Network-Actor-Signal nur als Abuse-Zusatzsignal; danach Rate-Limit-Tests und Backend-Typecheck.
- [ ] OpenAPI/Public Docs synchronisieren: Security-Blocks, Endpoint-Scope, Auth-Texte, interne Route-Filter; danach OpenAPI-Tests.
- [ ] Enforcement route-by-route gemäß Klassifizierung aktivieren, während First-Party-Website-/BFF-Pfade ohne Browser-Key funktionieren; danach Backend-, Frontend- und OpenAPI-Regressionen.
- [ ] Entscheiden und umsetzen, ob der unauthentifizierte `GET /api/v1/resolve` deaktiviert, deprecated oder hinter Key-Auth verschoben wird.
- [ ] Cutover-Gates ausführen und dokumentieren (siehe „Tests und Gates").

## Tests und Gates

Backend-Tests: Token-Erstellung gibt Klartext einmalig und speichert nur Hash; Token-Liste gibt nie Hash/Klartext; widerrufene Tokens sind nach Enforcement unbrauchbar; Rate-Limit-Werte validieren positive Ganzzahlen; Nicht-Admin/Moderator wird abgelehnt; Antrag-Genehmigung erstellt/verknüpft einen Client.

Dashboard-Tests: Seite rendert Loading/Empty/Populated; Approval-Dialog validiert Rate-Limit-Eingaben; Token-Create-Dialog zeigt einmaligen Token; Revoke/Rotate invalidieren Query-State.

Gates:

- `pnpm --filter @musiccloud/shared typecheck`
- `pnpm --filter @musiccloud/shared test:run` (bei Endpoint-/Contract-/DTO-Änderungen)
- `pnpm --filter @musiccloud/backend typecheck`
- `pnpm --filter @musiccloud/backend test:run`
- `pnpm --filter @musiccloud/dashboard typecheck`
- `pnpm --filter @musiccloud/dashboard test:run`
- bei Public-/Astro-Frontend-Änderungen: `pnpm --filter @musiccloud/frontend build`
- `pnpm lint`

React Doctor nach materiellen React-/Dashboard-Änderungen.

## Akzeptanzkriterien

- Alle als external public API klassifizierten Routen sind eindeutig markiert und durch Key-Middleware schützbar.
- API-Keys werden nur gehasht gespeichert und nie in Logs ausgegeben; Klartext erscheint genau einmal nach Create/Rotate.
- Applicant-Flow deckt Antrag, E-Mail-Verifikation, Status, Key-Anzeige, Rotation und Widerruf ab.
- Admin-Flow deckt Review, Approval, Scopes, Quotas, Suspend, Reject und Audit-Log ab.
- Usage Analytics sind pro API-Client, Client-Token, Endpoint, Action, Plattform, Status und Fehlerklasse filterbar; Request-Pfade pro Client als Timeline und Flow-Graph darstellbar.
- Die eigene Website enthält keinen geheimen Public-API-Key im Browser.
- Alle Schemaänderungen laufen über Drizzle-Migrationen, inkl. lokaler Testmigration gegen einen Dump.

## Risiken und offene Entscheidungen

- Der aktuelle Form Builder hat Frontend-Hooks für `/admin/forms`, aber Backend-Form-Routen waren in der inspizierten Route-Liste nicht sichtbar. Falls der Antrags-Flow daran hängt, die Submission-Pipeline vor automatischer Verdrahtung verifizieren.
- Der aktuelle Public-Auth-Flow stellt kurzlebige JWTs aus Env-`API_CLIENT_ID`/`API_CLIENT_SECRET` aus. Entscheiden, ob dieser Endpoint als Kompatibilitätsschicht bleibt oder durch direkte Opaque-Bearer-Tokens ersetzt wird.
- Bestehende unauthentifizierte Public-Routen tragen First-Party-SSR/Website-Verhalten. Nicht blind alle `/api/v1/*`-Routen in eine Auth-Gruppe ziehen, ohne First-Party-Verhalten zu erhalten.
- Verwaltungs-Berechtigung braucht eine Produktentscheidung: `owner` only oder `owner | admin`.
- `GET /api/v1/resolve` ist der größte Cutover-Punkt (Shortcuts/curl/Bookmarklets). Deaktivieren, deprecaten oder hinter Key-Auth verschieben — bewusst entscheiden.

## Quellen und rechtliche Konsequenzen

| Quelle | Konsequenz für musiccloud |
|----|----|
| [EDPB: Pseudonymisation vs anonymisation](https://www.edpb.europa.eu/sme-data-protection-guide/faq-frequently-asked-questions/answer/what-difference-between_en) | Consumer- und Network-Actor-Keys sind pseudonyme Identifier. Die Doku darf keine Anonymität behaupten. |
| [European Commission: Data protection explained](https://commission.europa.eu/law/law-topic/data-protection/data-protection-explained_en) | IP-Adressen und pseudonymisierte Daten können personenbezogen bleiben. Keine Roh-IP, keine vollständigen Header-Dumps speichern. |
| [CNIL: Cookies et autres traceurs](https://www.cnil.fr/fr/cookies-et-autres-traceurs/que-dit-la-loi) | Fingerprinting bleibt ausgeschlossen. API Analytics nutzen Consumer-Keys, nicht verdeckte Gerätefingerabdrücke. |
| [EDPB Guidelines 2/2023, Art. 5(3) ePrivacy Directive](https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-22023-technical-scope-art-53-eprivacy-directive_en) | Tracking-Techniken und Endgerätezugriff müssen bewusst abgegrenzt werden. Public API Analytics bleiben serverseitig und key-basiert. |

## Verifizierte Fakten (Re-Check 2026-06-26)

Vor Implementierungsstart wurden alle Ist-Zustand-Refs gegen den aktuellen Code re-verifiziert (paralleler Drift-Audit über alle 13 Bereiche). Ergebnis: Feature ist vollständig ungebaut (greenfield), Plan im Kern akkurat. Verifizierte Referenzen und Korrekturen:

- **Greenfield bestätigt:** Keine der geplanten Tabellen (`api_access_requests`, `api_clients`, `api_client_tokens`, `api_access_audit_events`, `api_usage_events`), kein `routes/admin-api-access.ts`, kein `db/adapters/postgres-api-access.ts`, kein `ENDPOINTS.admin.developer`, kein `features/developer/` existiert. Höchste Migration: `0046_cleanup_release_dates.sql`; nächste freie Nummer `0047`. Migrations-Tracker ausschließlich `drizzle.__drizzle_migrations`; Migration via `pnpm db:generate`, kein manuelles psql.
- **Route-Registrierung:** Block bei `apps/backend/src/server.ts:415-484` (Public-Root `:416-460`; `protectedRoutes`-Plugin mit `authenticatePublic` `:463-469`; `adminRoutes`-Plugin mit `authenticateAdmin` `:472-484`). Neue Admin-Route via `await adminApp.register(adminApiAccessRoutes)` im `adminRoutes`-Block; Einzel-Route-Files re-adden den Guard NICHT.
- **Auth-Guards** (`apps/backend/src/plugins/auth.ts`): drei `app.decorate`-Guards — `authenticateInternal` (`:72`), `authenticatePublic` (`:101-120`, `X-API-Key === INTERNAL_API_KEY` ODER bloßer `jwtVerify()` ohne Per-Client-Subject), `authenticateAdmin` (`:138-152`, Bearer-JWT `role:"admin"`, befüllt `request.user`). Fine-grained Authz via `getCaller(request)` (`admin-users.ts:310-315`): `request.user.sub` → `getAdminRepository().findAdminById(sub)` → frische DB-Rolle prüfen, JWT-`role`-Claim NICHT vertrauen. DB-Rollen: `owner`/`admin`/`moderator`. `apps/backend/src/middleware/` ist leer — Enforcement in-handler.
- **POST Resolve:** durch `authenticatePublic` geschützt, aber OHNE attribuierbare Per-Client-Identität; IP-limitiert (`resolve.ts:199-204`), keine Usage-Events. Die Usage-Middleware muss die Client-Identität selbst über den neuen Opaque-Token-Service einführen.
- **Adapter-Composition** (`apps/backend/src/db/adapters/postgres.ts:211`): `class PostgresAdapter implements TrackRepository, AdminRepository, CcRepository`, single `private pool`. Jede Methode delegiert one-line an aliased-importierte Standalone-Funktionen aus `postgres-<domain>.ts`. Neuer Sub-Adapter `db/adapters/postgres-api-access.ts` (Funktionen mit erstem Arg `pool: Pool`); Interface-Signaturen + DTOs in `db/admin-repository.ts` (Interface bei `:306`). Helpers aus `postgres-shared.ts` (`dateToMs`/`msToDate`, `safeParseJson`, Transaction-Pattern). Vorlage: `postgres-admin-users.ts` (`*Row`-Interface + `rowToX`-Mapper). Id-Gen via `generateTrackId()` aus `lib/short-id.js`.
- **DB-Schema** (`apps/backend/src/db/schemas/postgres.ts`): `export const x = pgTable("snake_name", {...})`; Timestamps `timestamp(col, { withTimezone: true }).notNull().defaultNow()`; Row-Types `export type XRow = typeof x.$inferSelect`. Token-Hash-Präzedenz: Invite-Flow (`adminUsers.inviteTokenHash` `:834`, bcrypt-Hash-at-rest, Raw-Token einmalig in Create-Response `admin-users.ts:142-145`). Der `app.jwt.sign`-Pfad wird bewusst NICHT für Opaque-Tokens wiederverwendet.
- **Endpoints** (`packages/shared/src/endpoints.ts`): `admin`-Gruppe endet bei `crawler` (`:307-318`). Neue `developer`/`apiAccess`-Gruppe danach; static = String-Literal, param = Arrow-Funktion, Colon-Twin unter `ROUTE_TEMPLATES.admin` (`:346-384`) mit matchendem Param-Namen. Jeder Entry mit TSDoc + HTTP-Verb. Import `import { ENDPOINTS } from "@musiccloud/shared"`.
- **Dashboard-Guards:** `RequireOwner` (owner-only, prüft `!user?.isOwner`) und `RequireNonModerator` (admin+owner, prüft `user?.role === "moderator"`) existieren in `features/auth/` — kein neuer Guard nötig. `AdminUser` hat `role: AdminRole` + separates `isOwner: boolean`; kein `isAdmin`-Feld am Objekt (Sidebar leitet lokal via `ROLE_RANK[role] >= ROLE_RANK.admin` ab, `Sidebar.tsx:47,615`). Page-Primitives: `PageLayout`/`PageBody`/`PageHeader`/`DataTable`/`type ColumnDef` aus `@/components/ui`; `DashboardActionButton`/`DashboardActionId`/`DashboardButton`/`DashboardInput` aus `@musiccloud/dashboard-ui`. Vorlage-Import: `ArtistsPage.tsx:1-29`. Routing via `createRoutesFromElements` + `lazyFallback` in `routes.tsx`.
- **i18n:** `DashboardMessages` ist STRICT interface (`apps/dashboard/src/i18n/messages.ts`) — neue Keys (`sectionDeveloper`, `apiAccess`) müssen in Interface + DE + EN, sonst tsc-Fail.
- **Rate-Limiting:** shared `apiRateLimiter` (10/60s, dokumentierte Cross-User-429-Historie) NICHT überladen; für Per-Client-Quota separaten `new RateLimiter(max, windowMs)` instanziieren (`rate-limiter.ts`).
