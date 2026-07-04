# Amazon Music Stufe 2: Web-API-Adapter (Suche + ISRC + Preview)

Plan-Nr.: MC-087

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Skip-Grund (2026-07-04)

Auf User-Entscheidung als **skipped** markiert. Blockiert durch die erforderliche Amazon-Freischaltung der Web API (Closed Beta, mehrstufiger Antrag mit unkontrollierbarer Freischaltungsdauer — siehe „## BLOCKIERT" + User-Tasks). Wird nicht verfolgt, solange die Freischaltung nicht vorliegt; Plan bleibt als Referenz + Antrags-Anleitung erhalten.

**Ziel:** Der `amazon-music`-Adapter aus [MC-086](2026-07-04-amazon-music-stufe-1-url-input.md) bekommt die offizielle Amazon Music Web API als Datenquelle: echte Katalog-Suche (Amazon-Chip auf fremden Share-Pages), ISRC-basiertes Matching (confidence 1.0) und Preview-URLs.

**Architektur:** Der Scrape-Pfad aus Stufe 1 bleibt als Fallback für URL-Input; sind die API-Credentials gesetzt, laufen `searchTrack`/`getTrack` über `https://api.music.amazon.dev` (LWA-Bearer-Token + `x-api-key` = Security-Profile-ID). Manifest deklariert die Env-Vars als `optionalEnv` (Plugin bleibt auch ohne Credentials verfügbar, nur ohne Suche).

**Tech Stack:** LWA OAuth 2.0, Amazon Music Web API v1 (`/v1/search/tracks`, `/tracks/{id}`), Vitest mit URL-Routing-Fetch-Mock.

## BLOCKIERT: Amazon-Freischaltung erforderlich

Die Web API ist **Closed Beta**. Ohne von Amazon freigeschaltetes Security Profile schlägt jede Authorization fehl. Erst die User-Tasks unten abschließen; Implementierung startet, sobald die Freischaltung + Credentials vorliegen.

## User-Tasks (Frank) — in dieser Reihenfolge

- [ ] **1. Amazon-Developer-Account** anlegen bzw. anmelden: <https://developer.amazon.com/> (oben rechts „Sign in" / „Create account"; normaler Amazon-Login funktioniert als Basis)
- [ ] **2. Security Profile erstellen** in der Login-with-Amazon-Console: <https://developer.amazon.com/loginwithamazon/console/site/lwa/overview.html> → „Create a New Security Profile" (Name z. B. „musiccloud", Datenschutz-URL: <https://musiccloud.io/privacy>). Die dabei erzeugte **Security Profile ID** wird später der `x-api-key`-Header; **Client ID + Client Secret** notieren (Reiter „Web Settings")
- [ ] **3. API-Zugang beantragen** über das Kontaktformular: <https://developer.amazon.com/support/contact-us> (Login nötig; leitet auf `…/support/cases/new`). Kategorie **„Music Developers"** und **„Business Opportunity"** wählen; Business-Case beschreiben: musiccloud ist ein nicht-kommerzieller Cross-Service-Musik-Link-Resolver (à la Songlink/Odesli), Use-Case = **Katalog-Metadaten + Deep-Links in Amazon Music** (kein Streaming, kein Playback, DRM nicht berührt); Security-Profile-ID aus Schritt 2 mit angeben
- [ ] **4. Auf Freischaltung warten** (Amazon aktiviert das Security Profile serverseitig; Rückfragen laufen über den Case aus Schritt 3). Referenz-Doku für den Prozess: [Program Overview](https://developer.amazon.com/docs/music/get_started_program-overview.html), [Program Requirements](https://developer.amazon.com/docs/music/requ_AM-Program-Requirements.html) (Review-/Zertifizierungspflicht vor Launch beachten!), Community-Beispiel: [Accessing the Amazon Music APIs](https://community.amazondeveloper.com/t/accessing-the-amazon-music-apis/2352)
- [ ] **5. Credentials übergeben:** Client ID, Client Secret, Security-Profile-ID → Zerops-Env des Backend-Service + lokal `apps/backend/.env.local` (Namen siehe Task 1; niemals committen — Repo ist public, gitleaks-Hook aktiv)

## Spec

1. Resolve eines Spotify/Deezer/…-Tracks zeigt einen Amazon-Music-Chip, wenn der Track im Amazon-Katalog ist; ISRC-Gleichheit ⇒ confidence 1.0.
2. `getTrack` für Amazon-URL-Input nutzt die API (ISRC, previewUrl, sauberes Artwork) statt Scrape, sobald Credentials gesetzt sind.
3. Preview-URLs aus der API fließen in die bestehende Preview-Logik (Deezer-Präferenz bleibt unangetastet).
4. 429-Antworten (TPS-Limit) führen zu sauberem Miss, nie zu Resolve-Blockade (10s-Adapter-Timeout des Resolvers bleibt die Obergrenze).

## Design-Notizen

- **Auth:** LWA-Token-Beschaffung kapseln (Modul `lwa-token.ts` im Plugin-Ordner) mit In-Memory-Cache + Promise-Coalescing analog Pandora-CSRF (`pandora/adapter.ts:85-117`). Header pro Call: `Authorization: Bearer <token>` + `x-api-key: <SecurityProfileId>` (Quelle: [Authentication-Doku](https://developer.amazon.com/docs/music/API_web_LWA.html)).
- **Suche:** `POST /v1/search/tracks` mit Keyword `"{artist} {title}"`; Kandidaten über `scoreSearchCandidate` (`_shared/confidence.ts`) scoren; Track-Objekte enthalten laut [Tracks-Doku](https://developer.amazon.com/docs/music/API_web_track.html) `isrc`, `duration`, `artists`, `album`, `previewUrl` → ISRC-Gleichheit gibt via `calculateConfidence` automatisch 1.0.
- **`findByIsrc`:** die API dokumentiert keinen direkten ISRC-Endpoint → `supportsIsrc` bleibt `false`; ISRC wirkt über den Such-Kandidaten-Vergleich (wie oben). Falls die finale API-Doku nach Freischaltung doch einen ISRC-Filter zeigt: umstellen und `supportsIsrc: true`.
- **Env-Namen:** `AMAZON_MUSIC_CLIENT_ID`, `AMAZON_MUSIC_CLIENT_SECRET`, `AMAZON_MUSIC_PROFILE_ID` als `optionalEnv` im Manifest (Stufe-1-Verhalten ohne Credentials bleibt).
- **Registry-Position:** mit aktiver API von Array-Ende in den vorderen Block hinter `spotify` (ISRC-fähige Quelle; Reihenfolge-Rationale im Registry-Kommentar ergänzen).

## Implementation

### Task 1: Env + Manifest + Verfügbarkeits-Umschaltung

- [ ] Manifest (`amazon-music/index.ts`): `optionalEnv: ["AMAZON_MUSIC_CLIENT_ID", "AMAZON_MUSIC_CLIENT_SECRET", "AMAZON_MUSIC_PROFILE_ID"]`, `docsUrl` auf die Web-API-Doku
- [ ] Adapter: interner `hasApiCredentials()`-Switch; `isAvailable()` bleibt `true` (keyless Grundmodus)

### Task 2: LWA-Token-Modul

- [ ] `amazon-music/lwa-token.ts`: Token-Fetch (client_credentials-Flow; exakter Scope/Grant nach Freischaltung aus der LWA-Doku des Cases verifizieren — Open Question 1), TTL-Cache, Coalescing, TSDoc; Tests mit gemocktem Token-Endpoint

### Task 3: API-getTrack + searchTrack

- [ ] `GET /tracks/{id}` mappen auf `NormalizedTrack` (isrc, durationMs, artists[], albumName, previewUrl, artworkUrl aus `images`)
- [ ] `POST /v1/search/tracks` → Kandidaten mappen, `scoreSearchCandidate`, Threshold `MATCH_MIN_CONFIDENCE`; 429/5xx → Debug-Log + Miss
- [ ] Scrape-Pfad bleibt Fallback, wenn `hasApiCredentials()` false oder API-Call scheitert
- [ ] Tests: URL-Routing-Mock für Token- + API-Endpoints; Fälle: ISRC-Match ⇒ 1.0, Cover-Kandidat unter Threshold, 429 ⇒ Miss, Credential-los ⇒ Stufe-1-Verhalten

### Task 4: Registry + Doku + Gates

- [ ] Registry-Umsortierung inkl. Kommentar-Update (`registry.ts:91-101`)
- [ ] `apps/backend/docs/adapters/amazon-music.md` um API-Modus erweitern; `GET /health`-relevante Aspekte prüfen (keine — API hat keinen Health-Hook)
- [ ] Gates: `pnpm --filter @musiccloud/backend typecheck` && `pnpm lint` && `pnpm doctor:diff` && `pnpm test:run`
- [ ] Prod-Verifikation nach Deploy: Resolve eines Spotify-Links zeigt Amazon-Chip; Zerops-Logs ohne 4xx-Spam vom Token-Endpoint

## Verified facts (2026-07-04)

| Referenz | Beleg |
| --- | --- |
| Closed-Beta-Status, Contact-Us-Antragsweg, LWA + `x-api-key`-Header | WebSearch/WebFetch: [Program Overview](https://developer.amazon.com/docs/music/get_started_program-overview.html), [Authentication](https://developer.amazon.com/docs/music/API_web_LWA.html), [Community-Thread](https://community.amazondeveloper.com/t/accessing-the-amazon-music-apis/2352) |
| Track-Objekt enthält `isrc`, `duration`, `artists`, `album`, `previewUrl`, `images`, `label`; Endpoints `GET /tracks/{id}`, `GET /tracks?ids=` | WebFetch [Tracks-Doku](https://developer.amazon.com/docs/music/API_web_track.html) |
| Search-Endpoints `/v1/search/tracks|albums|artists`, TPS-Limits mit 429 | WebSearch [Search-Doku](https://developer.amazon.com/docs/music/API_web_search.html) |
| Kontaktformular existiert, Login-pflichtig (`/support/cases/new`) | WebFetch-Redirect-Check 2026-07-04 |
| `scoreSearchCandidate`, `MATCH_MIN_CONFIDENCE`, `calculateConfidence`-ISRC-Kurzschluss | Read `_shared/confidence.ts`, `services/constants.ts`, `lib/resolve/normalize.ts:104-136` |
| Promise-Coalescing-Muster für Token-Cache | Read `plugins/pandora/adapter.ts:80-117` |
| Registry-Order-Kommentar | Read `plugins/registry.ts:91-124` |
| Gate-Scripts | grep `package.json` (root), `apps/backend/package.json` |

## Open questions

1. **LWA-Grant-Typ/Scope für Katalog-Calls** (client_credentials vs. Authorization-Code, Scope-Name): erst nach Freischaltung aus der dann zugänglichen Vollversion der Doku/dem Amazon-Case verifizierbar. Bis dahin kein Code für Task 2 schreiben.
2. **ISRC-Filter in der Such-API:** nicht dokumentiert; nach Freischaltung prüfen.
3. **TPS-Limit-Höhe:** wird von Amazon pro Partner festgelegt; nach Freischaltung erfragen (Community nennt 429 + Backoff als Standard).
4. **Zertifizierungsumfang** nach Program Requirements für einen Metadata-only-Consumer: klärt sich im Antrags-Case.

## Checklist

- [ ] All code references verified (functions, scripts, paths, env vars, package-manager commands)
- [ ] User-Tasks 1-5 erledigt (Amazon-Freischaltung liegt vor)
- [ ] Task 1 Env + Manifest abgeschlossen
- [ ] Task 2 LWA-Token abgeschlossen
- [ ] Task 3 API-getTrack + searchTrack abgeschlossen
- [ ] Task 4 Registry + Doku + Gates abgeschlossen
- [ ] User-OK zur Abnahme (Plan erst danach nach `done/`)
