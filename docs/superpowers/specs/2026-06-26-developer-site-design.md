# Developer-Site `developer.musiccloud.io` — Design-Spec

Status: Design abgenommen (2026-06-26)
Scope: Eigene Astro-App für Entwickler mit externem Account-System, API-Doku und Self-Service-Verwaltung von API-Zugriff/Keys. Verzahnt mit Plan MC-025 (interne API-Zugriffsverwaltung).
Verwandt: [MC-025](../../../.codex/plans/open/2026-06-05-public-api-access-key-and-analytics-plan.md)

## Überblick

musiccloud bekommt eine eigene Subdomain `developer.musiccloud.io` als Sammelpunkt für alles, was für Entwickler der Public API relevant ist: die API-Dokumentation und die Self-Service-Beantragung und -Verwaltung von API-Zugriffs-Keys. Entwickler legen dazu einen eigenen Account an (E-Mail/Passwort oder GitHub), stellen einen Zugriffsantrag, und verwalten nach manueller Freigabe ihre Keys selbst.

Diese Site ist die **externe, self-service Hälfte** der API-Zugriffsverwaltung. Die **interne Hälfte** — Anträge prüfen, Keys ausstellen, sperren — ist Plan MC-025 im Admin-Dashboard. Beide teilen sich dasselbe Datenmodell; dieser Plan und MC-025 sind ab jetzt verzahnt.

Vier Leitplanken: Die Developer-Accounts sind **strikt getrennt** von den internen Betreiber-Accounts (`adminUsers`). Die Architektur ist **billing-ready**, aber Billing wird nicht gebaut. E-Mail-Versand läuft über **SMTP2GO** (EU-Residency), nicht mehr über Brevo. Der Look greift die **Night-Mode-Ästhetik** der Hauptseite auf.

## Ist-Zustand (verifiziert 2026-06-26)

| Bereich | Befund | Quelle |
|----|----|----|
| Deployment | 3 Zerops-Services: `frontend` (Astro SSR, `musiccloud.io`), `dashboard` (React SPA via nginx, `dashboard.musiccloud.io`), `backend` (Fastify, `api.musiccloud.io`). | `zerops.yml` |
| Frontend-Stack | Astro 5.17.3, SSR via `@astrojs/node` (standalone), React-Islands, Tailwind 4, dunkles Theme. | `apps/frontend/astro.config.mjs` |
| Account-Modell | Nur `adminUsers` (interne Betreiber): `id` text, `username`, `passwordHash` (bcrypt 12), `email`, `role` (`owner`/`admin`/`moderator`), `inviteTokenHash`, `inviteExpiresAt`. Kein externes Account-System. | `apps/backend/src/db/schemas/postgres.ts` |
| Auth-Flow | Login `POST /api/admin/auth/login` → `app.jwt.sign` (24 h), Bearer-JWT, kein Refresh-Token (nur Re-Sign). Session per `localStorage` im Dashboard. | `apps/backend/src/routes/admin-auth.ts`, `apps/dashboard/src/features/auth/AuthContext.tsx` |
| Social-Login | Keiner. Nur Streaming-Service-OAuth (kkbox/tidal) für Metadaten — irrelevant. | grep verifiziert |
| E-Mail-Verifikation / Reset | Existiert nicht. | grep verifiziert |
| E-Mail-Versand | Brevo SMTP-API über `sendTemplatedEmail`, `BREVO_API_KEY`; nur für Invite-Mails genutzt. | `apps/backend/src/services/email-sender.ts` |
| Cookies/Sessions | Reines Bearer-JWT, kein `@fastify/cookie`/`@fastify/session`. | `package.json` |
| API-Doku | `@fastify/swagger` generiert OpenAPI dynamisch (`/docs/json`), Scalar-UI auf `/docs` (`api.musiccloud.io/docs`). | `apps/backend/src/server.ts`, `apps/backend/src/docs/scalar-reference.ts` |
| Night-Mode-Gradient | `skyTop: "#0b1318"` (Zenit), `skyBottom: "#10273b"` (Horizont); Shader `mix(skyBottom, skyTop, uv.y)`. | `apps/frontend/src/components/background/nightSky/settings.ts:162-163`, `scene.ts:217` |

## Getroffene Design-Entscheidungen

1. **Eigene Astro-App `apps/developer`** (SSR wie `apps/frontend`), 4. Zerops-Service auf `developer.musiccloud.io`. Nutzt `@musiccloud/shared` für Typen/Endpoints.
2. **Auth-Code im bestehenden Backend** (keine neue Service-Instanz). Neue Routen-Gruppe `/api/dev/*`. Die Astro-App ist nur Frontend und spricht das Backend über einen BFF-Proxy an (wie `apps/frontend`).
3. **Externes Account-System, getrennt von `adminUsers`:** neue Tabelle `developer_accounts`. Ein Developer kommt nie ins Admin-Dashboard; ein Admin verwaltet Anträge im Dashboard. Zwei Welten, ein Backend.
4. **Session per httpOnly-Secure-Cookie** (nicht `localStorage`) — die Site ist öffentlich, das schützt das Token vor XSS.
5. **Auth-Provider zum Start: E-Mail/Passwort + GitHub.** Google/Apple als spätere Erweiterung.
6. **1 Account = 1 Entwickler.** Kein Team-/Org-Modell (YAGNI). Ein Account hält mehrere Apps/Keys.
7. **API-Doku in Astro/MDX neu gebaut** (eigene Guides/Referenz/Code-Beispiele), nicht das Scalar-`/docs` eingebettet.
8. **Freigabe manuell** durch Owner/Admin im Dashboard (MC-025). Kein Auto-Approval zum Start.
9. **„Usage"-Tab als Platzhalter** zum Start („kommt bald"); echte Consumer-Analytics sind MC-025 Phase 2.
10. **E-Mail über SMTP2GO**, ersetzt Brevo komplett, hinter einer Provider-Abstraktion.
11. **Look:** dunkel, Night-Mode-Gradient als Hintergrund, glasige Surfaces, Brand-Blau `#28A8D8` + Gold `#D4A843`.
12. **Billing-ready, Billing nicht gebaut.**

## Architektur

```text
developer.musiccloud.io  (Astro SSR, apps/developer)  ──BFF-Proxy──▶  api.musiccloud.io  (Fastify, apps/backend)
        │                                                                     │
        │ httpOnly-Cookie-Session                                             │ neue Routen /api/dev/*
        │                                                                     │ developer_accounts + SMTP2GO-Versand
        └─ Astro/MDX-Doku, Auth-Seiten, Developer-Dashboard                   └─ teilt api_access_requests/clients/tokens mit MC-025
```

- **`apps/developer`** spiegelt das Setup von `apps/frontend`: Astro SSR (`@astrojs/node`), Tailwind 4, eigene Design-Token-Datei mit der Night-Mode-Ästhetik. React-Islands nur dort, wo Interaktivität nötig ist (Formulare, Dashboard).
- **BFF-Proxy:** Wie `apps/frontend` hängt die Astro-SSR-Schicht an Backend-Calls den `INTERNAL_API_KEY` und Forwarding-Header. Der geheime API-Key erscheint nie im Browser; das Developer-Session-Cookie wird durchgereicht.
- **Backend-Routen `/api/dev/*`** in einer neuen Routen-Gruppe (eigenes Routen-Modul, registriert in `apps/backend/src/server.ts`). Neuer Auth-Guard `authenticateDeveloper` (Session-Cookie → `developer_accounts`-Lookup), getrennt von `authenticateAdmin`/`authenticatePublic`.

## Datenmodell

Neue Drizzle-Tabellen in `apps/backend/src/db/schemas/postgres.ts` (Migration via `pnpm db:generate`, nächste Nummer `0047`):

### `developer_accounts`
- `id` uuid primary key
- `email` text not null unique (kanonische Identität, auch bei GitHub-Login)
- `email_verified_at` timestamptz null
- `password_hash` text null (null, wenn nur GitHub-Login)
- `display_name` text null
- `avatar_url` text null (explizit gesetzte Avatar-URL, z. B. GitHub-Profilbild beim OAuth-Login; späterer Upload ohne Schema-Änderung möglich)
- `plan` text not null default `free` (Billing-ready: tier-getriebene Limits; vorerst nur `free`)
- `status` text not null default `active` (`active`/`suspended`)
- `created_at`, `updated_at` timestamptz not null default now
- `last_login_at` timestamptz null

### `developer_identities` (verknüpfte Login-Methoden)
- `id` uuid primary key
- `account_id` uuid not null → `developer_accounts`
- `provider` text not null (`email`, `github`; später `google`, `apple`)
- `provider_user_id` text null (GitHub-User-ID; null bei `email`)
- unique (`provider`, `provider_user_id`)

Trennt Login-Methode von Account und macht späteres Account-Linking (mehrere Methoden an einem Account) möglich, ohne das Account-Schema zu ändern.

### `developer_email_tokens` (Verifikation + Passwort-Reset)
- `id` uuid primary key
- `account_id` uuid not null → `developer_accounts`
- `purpose` text not null (`verify`, `reset`)
- `token_hash` text not null (bcrypt; Klartext nur im Mail-Link)
- `expires_at` timestamptz not null
- `consumed_at` timestamptz null

### Verzahnung mit MC-025
MC-025s `api_access_requests` und `api_clients` bekommen je eine FK `developer_account_id` uuid → `developer_accounts`. MC-025s `contact_email` am Antrag bleibt als Anzeigewert, die Account-Verknüpfung ist die Wahrheit. Keys/Clients hängen am Account.

### Billing-ready
Das `plan`-Feld am Account ist der einzige strukturelle Vorgriff. Rate-Limits/Quotas werden aus dem Plan abgeleitet (Tier-Defaults), nicht hart pro Client gesetzt. Die Usage-Erfassung (MC-025 Phase 2, `api_usage_events`) ist die spätere Abrechnungsgrundlage. Plan-/Entitlement-Logik lebt in einer eigenen Schicht, sodass später ein Payment-Provider nur andockt.

### Avatare
Das `avatar_url`-Feld hält eine explizit gesetzte Bild-URL. Die Anzeige folgt einer Fallback-Kette zur Render-Zeit (kein zusätzliches DB-Feld nötig):

1. **`avatar_url`**, falls gesetzt — beim GitHub-Login übernehmen wir die GitHub-Profilbild-URL.
2. **Gravatar**, abgeleitet aus dem Hash der normalisierten E-Mail (`sha256(lowercase(trim(email)))` nach Gravatars aktueller Empfehlung; MD5 weiterhin unterstützt). URL `https://gravatar.com/avatar/<hash>?s=<größe>&d=<fallback>`. Mit `d=404` lässt sich prüfen, ob überhaupt ein Gravatar hinterlegt ist; sonst greift Schritt 3.
3. **Initialen-Fallback** aus `display_name` (wie im Admin-Dashboard, z. B. `JD` auf getöntem Grund).

Kein Avatar-Upload zum Start (YAGNI) — `avatar_url` macht einen späteren Upload (eigenes Object-Storage) ohne Schema-Änderung möglich. In den Account-Einstellungen kann der Nutzer `avatar_url` zurücksetzen, um wieder auf Gravatar/Initialen zu fallen. Die exakten Gravatar-API-Parameter (Hash-Funktion, `d=`-Werte, Größen) werden beim Plan-Schreiben final verifiziert.

## Auth-Flows

- **Signup (E-Mail):** E-Mail + Passwort → `developer_accounts` (unverifiziert) + `developer_identities(provider=email)` → Verifikations-Mail (Token in `developer_email_tokens`, `purpose=verify`). Login erst nach Verifikation.
- **Verify:** Link aus der Mail → Token prüfen/konsumieren → `email_verified_at` setzen.
- **Login (E-Mail):** timing-sicherer bcrypt-Vergleich (Pattern aus `admin-auth.ts`), nur bei verifizierter E-Mail → Session-Cookie.
- **Passwort-Reset:** „Forgot password" → Reset-Mail (`purpose=reset`) → neues Passwort setzen, Token konsumieren.
- **GitHub OAuth:** Authorization-Code-Flow. Bei erstem Login: Account über verifizierte GitHub-E-Mail anlegen/verknüpfen (`developer_identities(provider=github)`). GitHub-E-Mail gilt als verifiziert.
- **Session:** signiertes httpOnly-Secure-SameSite-Cookie (neu: `@fastify/cookie`); Inhalt ein kurzlebiges Token mit `account_id`. Logout löscht das Cookie.
- **Brute-Force-Schutz** am Login (eigener Rate-Limiter, nicht der shared `apiRateLimiter`).

## E-Mail (SMTP2GO)

Brevo wird vollständig ersetzt. Eine kleine Provider-Abstraktion (`EmailProvider`-Interface) löst `apps/backend/src/services/email-sender.ts` ab; SMTP2GO ist die Implementierung (EU-Endpoints `mail-eu.smtp2go.com` / `eu-api.smtp2go.com`). Alle Mails — Developer-Verifikation/Reset **und** die bestehenden Admin-Invite-Mails — laufen darüber. `BREVO_API_KEY` und Brevo-Code entfallen. Siehe Memory `email-smtp2go`.

## Informationsarchitektur

Öffentlich:
- **Landing** — Hero, Code-Teaser, Feature-Highlights (Resolve, Artist-Info, Creative Commons), CTAs.
- **Docs** (Astro/MDX) — Sidebar-Navigation, Endpoint-Referenz, Guides, Code-Beispiele (curl/JS/Python).
- **Auth-Seiten** — Sign-up, Log-in (GitHub zuerst, E-Mail darunter), E-Mail-Verifikation, Passwort-Reset.

Eingeloggt (Developer-Dashboard):
- **Overview** — Account-Status, aktive Keys, Quick-Start.
- **API access** — Antragsformular (App-Name, Beschreibung, geschätzte Requests/Tag, Plattform) → speist MC-025.
- **API keys** — eigene Keys (Prefix, Status, letzte Nutzung), Rotate/Revoke, einmalige Klartext-Anzeige nach Erstellung („show once").
- **Usage** — Platzhalter („kommt bald").
- **Account** — Profil, Login-Methoden (E-Mail/Passwort, GitHub), Passwort ändern, Account löschen (DSGVO).

## Design-Sprache

- **Hintergrund:** vertikaler Night-Mode-Gradient `linear-gradient(180deg, #0b1318, #10273b)` (Zenit → Horizont), ohne Sterne/Wolken.
- **Surfaces:** glasig (`rgba(255,255,255,.045)` mit Hairline-Border), wie das Glassmorphism der Hauptseite, aber ruhiger.
- **Akzent:** Brand-Blau `#28A8D8` für Aktionen/aktive Navigation/Links; Gold `#D4A843` sparsam. Grün für „verified/active", Rot für „revoke/danger".
- **Charakter:** technisch, doku-/code-fokussiert. Eigenes Gesicht, aber erkennbar dieselbe Marke wie `musiccloud.io`.

## Privacy / Security

- API-Keys nur gehasht speichern, Klartext genau einmal nach Create/Rotate (MC-025-Modell).
- Passwort- und Token-Hashes per bcrypt; Klartext-Tokens nie loggen.
- E-Mail-Versand EU-resident (SMTP2GO Amsterdam) — passt zum GDPR-Fokus.
- Terms/Privacy-Zustimmung beim Signup; Account-Löschung self-service.
- Developer-Session getrennt vom Admin-JWT; kein Pfad von Developer-Account zu Admin-Routen.

## Scope-Dekomposition (Sub-Projekte)

Jedes Stück bekommt eigenen Plan (über `writing-plans`):

1. **Site-Shell + Account-System** (zuerst) — `apps/developer`-Gerüst, Deploy, Design-System; `developer_accounts`/`developer_identities`/`developer_email_tokens`; SMTP2GO-Abstraktion (Brevo abgelöst); Backend-Auth-Routen + GitHub-OAuth + Cookie-Session; Frontend: Landing (minimal), Auth-Seiten, eingeloggte Dashboard-Shell mit Overview.
2. **API-Doku** (Astro/MDX) — Doku-Layout, Endpoint-Referenz, Guides, Code-Beispiele.
3. **Token-Self-Service + MC-025 Admin-Verwaltung** (verzahnt) — Antrag stellen, Status, eigene Keys verwalten; MC-025-Datenmodell um `developer_account_id` erweitert; Admin-Freigabe im Dashboard.
4. **Später** — Google/Apple-Login, Consumer-Usage-Analytics, Billing.

## Sub-Projekt 1 im Detail (zuerst zu bauen)

- **App-Gerüst:** `apps/developer` als Astro-SSR-App nach Vorbild `apps/frontend`; Tailwind-4-Setup, Design-Token-Datei mit Night-Mode-Ästhetik; `@musiccloud/shared` eingebunden; BaseLayout + Navigation.
- **Deploy:** 4. Service in `zerops.yml`; `developer.musiccloud.io` in `ALLOWED_ORIGINS`/`CORS_ORIGIN`; CI-Workflow um den neuen App-Change-Detect erweitern.
- **Datenmodell:** die drei `developer_*`-Tabellen + Migration `0047` (Drizzle).
- **E-Mail:** Provider-Abstraktion + SMTP2GO; Brevo-Entfernung inkl. Umstellung der Invite-Mails.
- **Backend-Auth:** Routen-Gruppe `/api/dev/auth/*` (signup, verify-email, login, request-reset, reset-password, logout, me) für E-Mail/Passwort; GitHub-OAuth-Flow; `authenticateDeveloper`-Guard; httpOnly-Cookie-Session (`@fastify/cookie`); Login-Rate-Limit.
- **Frontend:** Landing (statisch/minimal), Sign-up/Log-in/Verify/Reset-Seiten (React-Islands), eingeloggte Shell mit Overview; „API access"/„API keys"/„Usage" zunächst als leere/Platzhalter-Tabs (Funktion folgt in Sub-Projekt 3).
- **Tests + Gates:** Backend-Unit/Route-Tests (Signup/Verify/Login/Reset, Hash-only-Persistenz, Guard-Ablehnung), Shared-Typecheck, Frontend-Build, `pnpm lint`, React Doctor bei React-Änderungen.

Bewusst NICHT in Sub-Projekt 1: API-Doku-Inhalte (SP 2), Antrags-/Key-Funktion (SP 3), Google/Apple, Analytics, Billing.

## Offene Punkte / Risiken

- **GitHub-OAuth-App** muss angelegt werden (Client-ID/Secret als Env). Callback-URL `developer.musiccloud.io/...`.
- **SMTP2GO-Account + Domain-Verifikation** (`musiccloud.io`, deckt `developer.musiccloud.io` mit). API-Key als Env.
- **Cookie-Domain/SameSite** über Subdomains hinweg sauber konfigurieren (Backend `api.` setzt Cookie für `.musiccloud.io`?). Beim Plan klären.
- **MC-025-Schema-Erweiterung** (`developer_account_id`) erst in Sub-Projekt 3 nötig — Reihenfolge mit MC-025-Umsetzung abstimmen.

## Akzeptanzkriterien (Sub-Projekt 1)

- `apps/developer` baut, läuft lokal über den `./app`-Runner und deployt als 4. Zerops-Service auf `developer.musiccloud.io`.
- Ein Entwickler kann sich mit E-Mail/Passwort registrieren, erhält eine Verifikations-Mail (über SMTP2GO), verifiziert, loggt sich ein und wieder aus.
- GitHub-Login legt einen Account an bzw. verknüpft ihn.
- Passwort-Reset funktioniert per Mail.
- Session läuft über httpOnly-Cookie; kein Token im `localStorage`; kein geheimer API-Key im Browser.
- Developer-Accounts sind in einer eigenen Tabelle, ohne Zugriff auf Admin-Routen.
- Brevo ist vollständig entfernt; alle Mails (inkl. Admin-Invites) laufen über SMTP2GO.
- Look entspricht dem abgenommenen Mockup (Night-Mode-Gradient, glasige Surfaces, Brand-Blau/Gold).
- Alle Gates grün (Typecheck, Tests, `pnpm lint`, Frontend-Build, React Doctor).
