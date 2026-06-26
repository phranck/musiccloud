# API-Key-Pflicht und Usage Analytics für die Public API

Plan-Nr.: MC-030

## Zusammengelegt

Dieser Plan wurde am 2026-06-25 mit MC-025 (Developer API Access Management) zu einem gemeinsamen Plan zusammengelegt und wird **nicht mehr eigenständig umgesetzt**. Sein vollständiger Inhalt — Key-Pflicht, Enforcement-Cutover, Usage Analytics und Applicant-UI — ist in MC-025 übernommen und dort als Phase 2 fortgeführt: `.codex/plans/open/2026-06-05-public-api-access-key-and-analytics-plan.md`. Deshalb liegt dieser Plan in `skipped/`. Der ursprüngliche Inhalt bleibt zur Historie unverändert darunter erhalten.

> Umsetzungsplan, Public API.

Die Public API wird kurzfristig auf zwingende API-Keys umgestellt. Usage Analytics werden von Anfang an key-basiert geplant, damit Consumer, Quotas, Resolves, Suchanfragen, Fehler und Request-Pfade sauber nachvollziehbar sind.

**Eckpfeiler:** API-Key required, Applicant-UI, Admin-Approval, key-basierte Analytics, keine Klartext-Keys.

## Executive Summary

### API-Key-Pflicht

Alle Public-API-Routen werden als geschützte Surface behandelt. Anonyme Requests werden nach dem Rollout abgelehnt und nur noch als rejected traffic gezählt.

### Applicant Flow

Antragsteller bekommen ein UI für Antrag, E-Mail-Verifikation, Status, Key-Anzeige, Rotation und Widerruf. Admins prüfen und genehmigen im Dashboard.

### Usage Analytics

Auswertung erfolgt pro API-Consumer, Key, Endpoint, Plattform, Status, Fehlerklasse, Cache-Status und Request-Pfad.

## IST-Zustand im Code

| Bereich | Primärquelle | Befund | Konsequenz für die Umsetzung |
|----|----|----|----|
| Route-Registrierung | `apps/backend/src/server.ts:381-419` | Die Public API ist gemischt: Share, Preview, Artist-Info, Random, Services, Nav, Content, GET Resolve und Telemetry sind root-scope ohne Public Auth. Nur POST Resolve und Link laufen im `authenticatePublic`-Block. | Vor der Key-Pflicht muss jede Public-Route klassifiziert werden: external public API, website-internal BFF, public SSR helper oder telemetry. |
| OpenAPI-Dokumentation | `apps/backend/src/server.ts:189-206`, `:231-249` | Die Doku beschreibt bereits Credentials für die meisten Endpoints, nennt aber mehrere read-only Endpoints bewusst anonym erreichbar und filtert interne Routen aus der Public Reference. | Die API-Key-Umstellung ist auch eine OpenAPI-/Docs-Änderung. Security Blocks, Text und Transform-Filter müssen mit dem neuen Scope synchron bleiben. |
| Auth-Plugin | `apps/backend/src/plugins/auth.ts:53-120` | `authenticatePublic` akzeptiert aktuell entweder `X-API-Key` gleich `INTERNAL_API_KEY` oder Bearer JWT. Es gibt keine Consumer-Tabelle, keine Scopes, keine Key-Hashes. | Neues API-Key-System darf `INTERNAL_API_KEY` nicht als externen Consumer-Key wiederverwenden. BFF-Key und externe API-Keys müssen getrennt bleiben. |
| Token Endpoint | `apps/backend/src/routes/auth.ts:1-30`, `:120-152` | OAuth Client Credentials ist als MVP vorhanden, aber nur mit einem Env-basierten `API_CLIENT_ID`/`API_CLIENT_SECRET`. | Der Applicant-/Consumer-Plan ersetzt die Env-Registry durch DB-Consumer, hashed secrets, Scopes, Quotas und Audit-Events. |
| Rate Limiting | `apps/backend/src/lib/infra/rate-limiter.ts:63-99`, `:110-127` | Aktuell 10 Requests pro Minute pro `request.ip`, mit BFF-Bypass für interne SSR-Requests per `INTERNAL_API_KEY`. | API-Key-Pflicht braucht key-basierte Limits. IP-/Network-Actor-HMAC bleibt Zusatzsignal für Abuse, nicht primäre Consumer-Identität. |
| POST Resolve | `apps/backend/src/routes/resolve.ts:104-190`, `:190-337` | POST `/api/v1/resolve` ist bereits authentifiziert, aber weiterhin IP-limitiert und speichert keine Usage Events. | Beste Startstelle für API Usage Middleware: Consumer-Kontext vor Handler, Usage Event nach Response, Resolve-Metadaten aus Handler-Kontext. |
| GET Resolve | `apps/backend/src/routes/resolve-public-get.ts:1-25`, `:59-216` | GET `/api/v1/resolve` ist explizit unauthentifiziert für Shortcuts, curl und Bookmarklets. Abuse-Schutz ist nur IP-Rate-Limit. | Das ist der größte Cutover-Punkt. Entweder API-Key-Pflicht auch für GET oder De-Promotion zu Legacy/disabled/rejected endpoint. |
| Share und Preview | `apps/backend/src/routes/share.ts:43-212`, `apps/backend/src/routes/share-preview.ts:23-101` | Beide Routen sind anonym erreichbar, aber umgehen IP-Limit für interne BFF-Requests. | Externe Public API und Website-SSR müssen getrennt werden, damit Browser-Sharepages weiterhin ohne externen API-Key funktionieren. |
| Artist Info | `apps/backend/src/routes/artist-info.ts:72-247` | Artist-Info ist anonym erreichbar, nutzt Cache-TTLs und wird von der Website clientseitig über Astro-Proxy geladen. | Für Public API keypflichtig machen, für Website über BFF weiterhin first-party halten. Usage Analytics müssen Provider-Fehler und Cache-Hits erfassen. |
| Frontend BFF | `apps/frontend/src/api/client.ts:35-53`, `:90-108`, `:177-184` | Astro-Proxies hängen `INTERNAL_API_KEY` und `X-Forwarded-For` an Backend-Calls. | Die eigene Website darf keinen externen API-Key bekommen. BFF-Key bleibt intern, externe API-Key-Pflicht gilt an der Public-API-Grenze. |
| DB-Schema | `apps/backend/src/db/schemas/postgres.ts:1-420`, `:857-878` | Keine Tabellen für API Consumer, API Keys, API-Key-Audit oder API Usage Events vorhanden. | Die API-Key-Infrastruktur ist ein neues Datenmodell, keine kleine Erweiterung der bestehenden Auth-Env-Variablen. |

## Grundsatzentscheidungen

**API-Key ist Pflicht**

Public API Analytics werden nicht auf anonyme IP-Cluster gebaut, sondern auf genehmigte API-Consumer.

**Key ist Consumer, nicht Person**

Ein API-Key identifiziert eine Integration, Organisation, App oder technische Nutzung. Er ist keine Personenidentität.

**Keine Keys im Klartext**

API-Keys werden nur einmalig angezeigt und danach nur gehasht gespeichert. Sichtbar bleiben Prefix, Key-ID, Status, Scope und Nutzungsdaten.

**Website nutzt keinen Public-Key im Browser**

Ein Browser-Key wäre kein Secret. Die eigene Website muss interne Backend-Pfade oder einen First-Party Proxy nutzen, nicht einen geheimen Public-API-Key im Client.

## Applicant- und Admin-Flows

Code-Abgleich 2026-06-05: Die Token- und Client-Verwaltung wird nicht in diesem Plan parallel aufgebaut. Sie ist das Fundament aus `2026-06-05-developer-api-access-management-plan.md` und verwendet `api_access_requests`, `api_clients`, `api_client_tokens` und `api_access_audit_events`. Dieser Plan setzt darauf auf und ergänzt Public Request Intake, Enforcement, tokenbewusste Rate Limits und `api_usage_events`.

### Applicant

- API Access Page öffnen.
- Name, E-Mail, Organisation, Website und Use Case angeben.
- Expected volume und Terms akzeptieren.
- E-Mail verifizieren.

### Admin

- Neue Anträge im Dashboard sehen.
- Use Case, Volumen und Domain prüfen.
- Scopes, Quotas und Rate Limits setzen.
- Approve, Reject oder Rückfrage.

### Key

- Key erzeugen und einmalig anzeigen.
- Key-Hash speichern, Klartext verwerfen.
- Prefix und letzte Nutzung anzeigen.
- Rotation und Revocation ermöglichen.

### Analytics

- Requests pro Consumer erfassen.
- Endpoint-Sequenzen berechnen.
- Quota, 429 und Fehlerquoten zeigen.
- Heavy Consumer markieren.

## Key- und Consumer-Datenmodell

Aktueller Zielstand nach Code-Abgleich: Externe Consumer heißen in der neueren Management-Planung `api_clients`, Secrets heißen `api_client_tokens`. Keine zusätzlichen Tabellen `api_consumers` oder `api_keys` anlegen, solange diese Namen nicht bewusst als Migration-ADR entschieden wurden.

```text
api_access_requests
  id uuid primary key
  contact_email text not null
  app_name text not null
  app_description text not null
  estimated_requests_per_day integer not null
  status text not null -- pending, approved, rejected, archived
  submitted_at timestamptz not null default now
  reviewed_at timestamptz null
  reviewed_by_admin_id text null
  review_note text null

api_clients
  id uuid primary key
  request_id uuid null references api_access_requests(id)
  app_name text not null
  contact_email text not null
  description text not null
  status text not null -- active, suspended, revoked
  requests_per_minute integer not null
  requests_per_day integer not null
  created_at timestamptz not null default now
  updated_at timestamptz not null default now
  created_by_admin_id text null

api_client_tokens
  id uuid primary key
  client_id uuid not null references api_clients(id)
  token_prefix text not null
  token_hash text not null
  status text not null -- active, revoked, rotated
  created_at timestamptz not null default now
  last_used_at timestamptz null
  revoked_at timestamptz null
  rotated_from_token_id uuid null

api_access_audit_events
  id uuid primary key
  client_id uuid null
  request_id uuid null
  token_id uuid null
  event_type text not null
  actor_admin_id text null
  occurred_at timestamptz not null default now
  event_data jsonb not null default '{}'
```

## API Usage Event-Modell

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

Wichtig: Persistiert wird `endpoint_template`, nicht die volle URL. Querystrings und Bodies werden nicht blind gespeichert.

## Pflichtfelder pro Request

| Feld | Quelle | Zweck |
|----|----|----|
| `api_client_id` | Validierter API-Key | Primäre Auswertungseinheit. |
| `api_client_token_id` | Key-Lookup über Prefix und Hash | Rotation, Abuse-Analyse und Key-spezifische Limits. |
| `endpoint_template` | Router-Kontext | Aggregierbare Endpoint-Metriken ohne sensitive Parameter. |
| `action_type` | Route-Mapping | Fachliche Analyse wie `resolve`, `share_lookup`, `artist_info`. |
| `api_network_actor_key` | HMAC aus Zeitraum und IP-Präfix | Zusatzsignal für Abuse, nicht primäre Identität. |
| `duration_ms`, `cache_status`, `status_code` | Response Lifecycle | Qualität, Performance und Fehlerraten. |

## Endpoint-Scope

| Endpoint | Action | Analytics-Fokus |
|----|----|----|
| `/api/v1/resolve` | `resolve` | Plattform, Media-Type, Trefferstatus, Fehlerklasse, Latenz, Cache-Hit. |
| `/api/v1/share/:shortId` | `share_lookup` | ShortId-Lookups, Consumer-Pfade nach Resolve, 404-Rate. |
| `/api/v1/share/:shortId/preview` | `preview_lookup` | Preview-Nutzung, Refresh-Erfolg, Anbieterfehler. |
| `/api/v1/artist-info` | `artist_info` | Popular Tracks, Similar Artists, Upcoming Events, Provider-Fehler. |
| `/api/v1/random-example` | `random_example` | Demo-/Dokumentationsnutzung und Consumer-Onboarding. |
| `/api/v1/content/:slug` | `content_lookup` | API-Dokumentation, Help-/Info-Zugriffe über API, 404-Rate. |

## Applicant UI

### Öffentliche API Access Page

- Name, Organisation und Kontakt-E-Mail.
- Website, Projektbeschreibung und geplanter Use Case.
- Erwartetes Volumen, geplante Endpoints und Terms-Akzeptanz.
- E-Mail-Verifikation vor Admin-Review.

### Status- und Key-Seite per Magic Link

- Antragsstatus sehen: pending, verified, approved, rejected.
- Nach Freigabe API-Key einmalig anzeigen.
- Usage-Summary, Quota, Limits und letzte Nutzung.
- Key rotieren oder widerrufen.

## Admin UI

### Access Requests

- Liste aller Anträge mit Status und Verifikationszustand.
- Detailseite mit Use Case, Volumen, Website und Notizen.
- Approve, Reject, Suspend, Reopen.
- Scope- und Quota-Auswahl vor Freigabe.

### Consumer Analytics

- Requests, Resolves, Fehlerquote und Latenz pro Consumer.
- Endpoint-Flow und Request-Timeline.
- Heavy Consumers, Rate-Limit-Hits und auffällige Fehlerpfade.
- Key-Rotation, Revocation und Audit-Log.

## Rate Limits, Quotas und Abuse

| Mechanismus | Basis | Dashboard-Anzeige |
|----|----|----|
| Per-minute Rate Limit | `api_client_token_id` | 429 pro API-Client und Endpoint. |
| Daily und Monthly Quota | `api_client_id` | Verbrauch, Prognose und Restbudget. |
| Network Actor Zusatzsignal | HMAC aus Zeitraum und IP-Präfix | Viele Keys aus gleichem Netz, auffällige Provider-Cluster. |
| Endpoint-spezifische Limits | Scope und Endpoint Template | Teure Resolves separat von billigen Share-Lookups begrenzen. |

## Privacy und Security Boundaries

- API-Keys nie im Klartext speichern, nie in Logs schreiben und nur einmalig anzeigen.
- Authorization-Header, Cookies, vollständige Querystrings und Request-Bodies nicht ungeprüft persistieren.
- Suchbegriffe bewusst behandeln: normalisierte Klartext-Speicherung nur nach Produktentscheidung, sonst Hash plus Metadaten.
- IP bleibt Zusatzsignal für Abuse: HMAC aus Zeitraum und IP-Präfix, keine Roh-IP.
- API Network Actor ist kein Haushalt. In der API-UI niemals `household` oder `user` verwenden.
- Admin-Zugriffe auf Keys, Anträge und Usage-Daten werden auditiert.

## Implementierungsphasen

1. **Doku und ADR** — API-Key-Pflicht, Key-Speicherung, Website-Abgrenzung und Analytics-Scope dokumentieren.
2. **Schema** — Developer-API-Access-Management-Tabellen nutzen und fehlende Public-Intake-/Usage-Event-Tabellen in Postgres anlegen.
3. **Applicant UI** — Antrag, E-Mail-Verifikation, Statusseite und Key-Anzeige bauen.
4. **Admin UI** — Review, Approval, Scopes, Quotas, Rotation und Revocation im Dashboard.
5. **Middleware** — API-Key-Validation zunächst optional loggend, dann required schalten.
6. **Analytics** — Usage Events, Rollups, API-Client-Timeline und Endpoint-Flows implementieren.
7. **Cutover** — Anonyme Public-API-Requests ablehnen und nur noch rejected traffic aggregieren.

## Implementation Checklist

Jeder Punkt ist als stabiler Zwischenstand geschnitten: Nach Abschluss bleiben relevante Typechecks, Tests oder Doku-Gates grün, bevor der nächste Scope beginnt.

- [ ] Abhängigkeit prüfen: Developer API Access Management muss zuerst die Tabellen `api_access_requests`, `api_clients`, `api_client_tokens` und `api_access_audit_events` liefern. Wenn sie fehlen, diesen Plan nicht mit eigenen Consumer-/Key-Tabellen starten.
- [ ] Public-API-Routen gegen den aktuellen Code klassifizieren und dokumentieren: external API, first-party BFF, SSR helper, telemetry. Keine Enforcement-Änderung in diesem Schritt.
- [ ] ADR/Doku für API-Key-Pflicht, Key-Hashing, Website-Abgrenzung, Privacy-Grenzen und Usage-Analytics-Felder ergänzen; danach Backend- und Docs-relevante Tests unverändert grün halten.
- [ ] Shared Contracts und Endpoint-Konstanten für Public Request Intake, Token-Enforcement-Kontext und Usage Analytics definieren; danach `pnpm --filter @musiccloud/shared typecheck` ausführen.
- [ ] Drizzle-Schema nur für fehlende Public-Intake-Ergänzungen und `api_usage_events` ergänzen; Management-Tabellen aus dem Developer-Plan wiederverwenden und Migration ausschließlich mit `pnpm db:generate` erzeugen.
- [ ] Backend nach Schema/Migration kompilierbar halten: `pnpm --filter @musiccloud/backend typecheck` ausführen und Schema-Exports/Adapter-Brüche beheben.
- [ ] Bestehenden Key-Service aus dem Developer-Plan für Public-API-Validation erweitern: Prefix/Hash-Lookup, Statusprüfung, Client-Kontext und `last_used_at`; Generierung, Rotation und Revocation nicht erneut implementieren.
- [ ] Applicant-Backend ohne Public-API-Enforcement bauen: Antrag, E-Mail-Verifikation, Statusabfrage und Weitergabe in `api_access_requests`; Key-Ausgabe bleibt beim Management-Service.
- [ ] Admin-Management nicht duplizieren: vorhandene Developer-API-Access-Endpunkte für Approve/Reject/Suspend/Reopen, Scopes, Quotas und Token-Audit wiederverwenden; danach Backend-Typecheck und Admin-Route-Tests ausführen.
- [ ] Applicant UI mit vorhandenen Public-/Dashboard-Patterns ergänzen: API Access Page, Magic-Link-Statusseite, Antragstatus und nach Freigabe Verweis auf einmalige Key-Anzeige aus dem Management-Flow; danach passende Frontend-/Dashboard-Typechecks ausführen.
- [ ] Admin Analytics UI als Ergänzung zur Developer-API-Access-Seite bauen: Usage-Summary, Endpoint-Flow, 429/Fehlerquoten und Heavy Consumers; Management-Tabellen und Token-Aktionen nicht neu implementieren.
- [ ] Public-API-Middleware im optional-loggenden Modus integrieren: Keys validieren, Consumer-Kontext setzen, bestehende anonyme Requests noch nicht blockieren; Website-BFF-Flows per Tests absichern.
- [ ] Usage-Event-Erfassung nach Response-Lifecycle implementieren: `endpoint_template`, `action_type`, Status, Dauer, Fehlerklasse, Cache-Status und pseudonymer Network Actor; danach Backend-Tests ausführen.
- [ ] Key-basierte Rate Limits und Daily/Monthly Quotas ergänzen, IP-/Network-Actor-Signal nur als Abuse-Zusatzsignal verwenden; danach Rate-Limit-Tests und Backend-Typecheck ausführen.
- [ ] OpenAPI/Public Docs synchronisieren: Security Blocks, Endpoint-Scope, Auth-Texte und interne Route-Filter aktualisieren; danach OpenAPI-Tests ausführen.
- [ ] Enforcement route-by-route anhand der Klassifizierung aktivieren, während first-party Website-/BFF-Pfade ohne Browser-Public-Key funktionieren; danach Backend-, Frontend- und OpenAPI-Regressionen prüfen.
- [ ] Cutover-Gates ausführen und dokumentieren: `pnpm --filter @musiccloud/shared typecheck`, `pnpm --filter @musiccloud/backend typecheck`, `pnpm --filter @musiccloud/backend test:run`, `pnpm --filter @musiccloud/dashboard typecheck`, `pnpm --filter @musiccloud/dashboard test:run`, bei Public-/Astro-Frontend-Änderungen `pnpm --filter @musiccloud/frontend build`, und `pnpm lint`.

## Code-Dokumentation

```ts
/**
 * Public API authentication boundary.
 *
 * API keys identify approved API consumers, not people. Plaintext keys are
 * accepted only at request time, matched against the stored hash, and must
 * never be persisted or logged. Browser clients must not embed secret API keys.
 */
async function authenticatePublicApiRequest(request) {
  // implementation follows the ADR
}

/**
 * API usage analytics boundary.
 *
 * Store endpoint templates and curated fields only. Do not persist raw
 * Authorization headers, raw cookies, full query strings or unchecked request
 * bodies. The optional network actor key is pseudonymous and used for abuse
 * analysis, not consumer identity.
 */
function recordApiUsageEvent(context) {
  // implementation follows the ADR
}
```

## Akzeptanzkriterien

- Alle als external public API klassifizierten Routen sind eindeutig markiert und durch API-Key-Middleware schützbar.
- API-Keys werden nur gehasht gespeichert und niemals in Logs ausgegeben.
- Applicant-Flow deckt Antrag, E-Mail-Verifikation, Status, Key-Anzeige, Rotation und Widerruf ab.
- Admin-Flow deckt Review, Approval, Scopes, Quotas, Suspend, Reject und Audit-Log ab.
- Usage Analytics sind pro API-Client, Client-Token, Endpoint, Action, Plattform, Status und Fehlerklasse filterbar.
- Request-Pfade pro API-Client sind als Timeline und Flow-Graph darstellbar.
- Die eigene Website enthält keinen geheimen Public-API-Key im Browser.

## Quellen und technische Konsequenzen

| Quelle | Konsequenz für musiccloud |
|----|----|
| [EDPB: Pseudonymisation vs anonymisation](https://www.edpb.europa.eu/sme-data-protection-guide/faq-frequently-asked-questions/answer/what-difference-between_en) | Consumer- und Network-Actor-Keys sind pseudonyme Identifier. Die Doku darf keine Anonymität behaupten. |
| [European Commission: Data protection explained](https://commission.europa.eu/law/law-topic/data-protection/data-protection-explained_en) | IP-Adressen und pseudonymisierte Daten können personenbezogen bleiben. Deshalb keine Roh-IP und keine vollständigen Header-Dumps speichern. |
| [CNIL: Cookies et autres traceurs](https://www.cnil.fr/fr/cookies-et-autres-traceurs/que-dit-la-loi) | Fingerprinting bleibt ausgeschlossen. API Analytics nutzen Consumer-Keys, nicht verdeckte Gerätefingerabdrücke. |
| [EDPB Guidelines 2/2023, Art. 5(3) ePrivacy Directive](https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-22023-technical-scope-art-53-eprivacy-directive_en) | Tracking-Techniken und Endgerätezugriff müssen bewusst abgegrenzt werden. Public API Analytics bleiben serverseitig und key-basiert. |
