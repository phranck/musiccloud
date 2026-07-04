# Developer-API-Monetarisierung: Tiers, Polar-Billing & Attribution — Design-Spec

Status: In Umsetzung — Phase 0 „Free-first" (Billing zurückgestellt)
Erstellt: 2026-07-04
Aktualisiert: 2026-07-04 — Free-first-Pivot: erst kostenloses Portal + Enforcement, Billing/Polar später

## Überblick

Das Developer-Portal (`developer.musiccloud.io`) zeigt heute bei jedem Account den Plan „free" — bislang ohne Wirkung, weil es weder Bezahl-Tiers noch eine Abrechnung gibt und die Public API noch nicht durchgesetzt wird. Diese Spec beschreibt das Monetarisierungs-Modell:

- ein **Free-Tier plus drei Bezahl-Tiers** (bewusst musik-thematische Namen),
- abgerechnet über **Polar** als **Merchant of Record** (Umsatzsteuer/VAT laufen durch, keine Eigen-Buchhaltung),
- backend-seitig durchgesetzt über die schon existierenden Pro-Client-Limits (`requestsPerMinute` / `requestsPerDay`),
- plus eine ehrliche **Attribution-Strategie** („Powered by musiccloud"), die nicht auf technische Garantie, sondern auf Vertrag + Anreiz setzt.

Dies ist das Design-/Entscheidungs-Dokument. Die Umsetzung wird nach der Plan-Size-Regel in mehrere eigenständige Pläne aufgeteilt (siehe „Umsetzung: Plan-Aufteilung"). Zwei Produkt-Entscheidungen sind noch offen (Tier-Namen, Attribution-Modell) — festgehalten unter „Offene Entscheidungen".

## Ist-Zustand: was existiert, was fehlt

**Vorhanden:**

- **Developer-Portal-Shell** (MC-066, live): Account-Overview + Sidebar mit den deaktivierten „Soon"-Tabs *API access* / *API keys* / *Usage*. Der `plan`-Wert am Account wird angezeigt (heute „free").
- **Backend-Fundament** (MC-077, live): Tabellen `api_access_requests` / `api_clients` / `api_client_tokens` / `api_access_audit_events`; `routes/dev-api-access.ts` (6 Self-Service-Endpunkte: Antrag stellen, eigene Clients/Tokens verwalten) + `routes/admin-api-access.ts` (9 Admin-Endpunkte). **Pro Client existieren bereits die Limit-Felder `requestsPerMinute` (Default 60) und `requestsPerDay` (Default 10.000)** — genau die Stellschrauben, an die dieses Tier-Modell andockt.

**Fehlt — die Voraussetzungen dieser Monetarisierung:**

- **Durchsetzung an der Public-API-Grenze:** `authenticatePublic` prüft die ausgestellten Tokens (`api_client_tokens`) noch nicht und zählt keine Requests. Ohne diese Schicht sind alle Tier-Limits nur Zahlen in der DB. Das ist der Kern von **MC-025 Phase 2** und noch nicht gebaut.
- **Developer-Portal-Self-Service-UI** (Abschnitt E des Self-Service-Designs, `2026-07-01-developer-api-access-self-service-design.md`): die Tabs *API access* + *API keys*, über die ein Developer selbst einen Zugang beantragt, Keys sieht/rotiert und seinen Plan sieht. Das **Backend dafür existiert** (MC-077 `dev-api-access.ts`), die **UI nicht** — und es gibt dafür bisher keinen geschriebenen Plan.
- **Billing:** keine Anbindung an einen Zahlungs-/Abrechnungsdienst.

## Entscheidung 2026-07-04: Free-first — erst das Produkt, dann Geld

Bewusste Reihenfolge-Entscheidung: **Zuerst wird die komplette Developer-Portal-Struktur samt API-Zugang, Token-Management und Rate-Limit-Handling kostenlos und funktionsfähig fertiggestellt.** Billing (Polar) und die Bezahl-Tiers werden **zurückgestellt** — das gesamte Tier-/Polar-/Attribution-Design weiter unten bleibt gültig, ist aber Zieldesign einer späteren Billing-Phase, nicht Teil der jetzigen Umsetzung.

**Warum in dieser Reihenfolge:**

- Enforcement, Portal-UI und Token-Management braucht die Bezahl-Version ohnehin 1:1 — kein Wegwerf-Aufwand, sondern das Fundament.
- Solange **niemand zahlt**, entsteht kein Einkommen und damit keine der steuer-/sozialrechtlichen Fragen, die eine Monetarisierung im aktuellen persönlichen Kontext des Betreibers aufwirft. Das Produkt reift in Ruhe.
- Ein kostenloses öffentliches API **braucht trotzdem harte Limits** (Missbrauchs- und Kostenschutz). Genau die baut Phase 0 — nur mit einem großzügigen Free-Tier statt gestaffelter Bezahl-Limits.

**Von Anfang an offen kommuniziert:** dass „kostenlos" nicht der dauerhafte Endzustand ist. Ausdrücklich mit dem Ziel, den Vorwurf **„Enshittification"** (etwas Gutes wird später verschlechtert oder verpaywallt) gar nicht erst entstehen zu lassen — abgesichert durch ein schriftliches Pricing-Commitment (siehe unten).

## Phase 0 — Was jetzt gebaut wird (kostenlos, durchgesetzt)

Genau ein Tier: **Free**. Kein Tier-Konstrukt, keine Preis-Logik, kein Polar. Die Limits sind die **bestehenden `api_clients`-Defaults** (`requestsPerMinute` 60, `requestsPerDay` 10.000), admin-editierbar pro Client — kein neuer Config-Layer nötig (YAGNI). Kommen später Bezahl-Tiers dazu, werden frühe Free-User auf ihren Limits **grandfathered** (siehe Commitment).

Zwei eigenständige Pläne:

1. **[MC-088] Public-API Token-Enforcement + Per-Client-Rate-Limiting** (Backend). Macht die ausgestellten `mc_live_`-Tokens erstmals wirksam: `authenticatePublic` validiert sie gegen `api_client_tokens` (SHA-256-Hash-Lookup), löst den `api_client` auf, hängt ihn an den Request, stempelt `lastUsedAt`, und setzt die Pro-Client-Limits (`requestsPerMinute`/`requestsPerDay`) über ein dynamisches Rate-Limit durch (`429` bei Cap). **Kein Schema-Change** (Tabellen + Unique-Index `uq_api_client_tokens_hash` existieren); nur zwei neue Repo-Methoden. Anonyme/BFF-Pfade bleiben unverändert (kein erzwungener Cutover in Phase 0).
2. **[MC-089] Developer-Portal Self-Service-UI + Pricing-Commitment** (Frontend `apps/developer`). Aktiviert die „Soon"-Tabs *API access* / *API keys* / *Usage* und baut die Ansichten gegen das **schon vorhandene** MC-077-Backend (`dev-api-access.ts`, via BFF-Proxy `pages/api/dev/[...path].ts`). Plus eine öffentliche **Pricing/Commitment-Seite**. Reines Frontend, kein Backend-Change.

**Reihenfolge-Empfehlung:** MC-088 zuerst (macht Tokens wirksam + befüllt `lastUsedAt`, das der Usage-Tab zeigt), dann MC-089. Harte Blockade besteht nicht — die Portal-UI kann Tokens auch anlegen/verwalten, bevor die Durchsetzung live ist.

## Pricing-Commitment (Anti-Enshittification)

**Kernprinzip: Nie wegnehmen, was gratis war.** Bezahl-Tiers kommen später *obendrauf* (mehr Volumen, kommerzielle Nutzung, SLA), nicht durch Zurückhalten von Basics. Abgesichert durch ein **schriftliches, datiertes Versprechen** im Portal statt vagem „vielleicht mal":

- **Der Free-Tier bleibt kostenlos.** Bezahl-Tiers *erweitern*, sie nehmen dem Free-Tier nichts weg.
- **Early-User werden grandfathered:** wer vor dem Pricing-Start dabei ist, behält sein Free-Kontingent.
- **Vorlauf, kein Rug-Pull:** feste Vorankündigung (≥ 30 Tage) vor jeder Änderung; bestehende Tokens laufen weiter.
- **Keine künstliche Verschlechterung** des Free-Erlebnisses, um zum Bezahlen zu drängen; kein Lock-in (DSGVO-Export existiert, Tokens jederzeit widerrufbar, Standard-HTTP-API).
- **Ehrliches Warum:** Betrieb kostet real etwas; Bezahl-Tiers sichern Nachhaltigkeit, keine Extraktion — ohne private Details des Betreibers.

**Portal-Text (Englisch, das Portal ist EN-only — MC-066):**

> **Pricing — honest and upfront**
> musiccloud's API is **free while we build it out**, and it won't stay free forever — running it has real costs, and paid tiers for high-volume and commercial use are planned. Our commitment:
> - **The free tier stays free.** Paid tiers will *add* capacity — they won't take away what you have today.
> - **Early users are grandfathered.** If you're here before pricing launches, your free allowance is locked in.
> - **Plenty of notice** (at least 30 days) before anything changes. No surprises, no rug-pulls.
> - **We won't degrade the free experience** to push you to pay.

Diese Seite gehört zu **MC-089** (öffentliche Route in `apps/developer`, verlinkt aus Dashboard + Footer/Landing). Der Vorlauf-Wert (30 Tage) ist Vorschlag.

---

# Billing-Phase (zurückgestellt) — Zieldesign

Alles ab hier ist das **Zieldesign der späteren Billing-Phase** und **nicht** Teil von Phase 0. Es bleibt als Entscheidungsgrundlage stehen, wird aber erst umgesetzt, wenn Monetarisierung tatsächlich ansteht.

## Entscheidung: Merchant of Record „Polar"

Abgerechnet wird über **Polar** ([polar.sh](https://polar.sh)) als **Merchant of Record (MoR)**. Begründung:

- **MoR nimmt die Steuer komplett ab.** Polar wird rechtlich der Verkäufer, berechnet + führt VAT/GST/Sales-Tax weltweit ab (EU-OSS, Irland, `EU372061545`), macht Rechnungen, Refunds und Chargebacks. Genau das war der Grund, **Mollie zu verwerfen** (Mollie ist nur PSP → VAT-Meldung bliebe bei uns). Für einen EU-Solo-Betreiber ist das die entscheidende Vereinfachung.
- **Dev-/API-Fit:** Polar ist entwicklerorientiert, mit nativem **usage-based billing** (relevant für den späteren *Usage*-Tab), **Entitlements** (Zugriff/Limits/Keys direkt an die Subscription koppeln), Open Source und Top-DX (hosted Checkout, Webhooks, SDK).
- **Gebühren-Realität, ehrlich:** Rein auf die Gebühr geschaut ist **Creem** (3,9 % + $0,40, freie SEPA-Auszahlung, EU-OSS Estland) durchgehend ~1,5 Prozentpunkte günstiger. Polar rechtfertigt den kleinen Aufpreis über den Nicht-Preis-Teil (usage-based, Entitlements, DX). Bleibt Kosten irgendwann das oberste Kriterium, ist Creem der dokumentierte Fallback.

**Zwei Caveats:** (1) Auf der Kundenrechnung steht **Polar** als Verkäufer, nicht musiccloud (MoR-typisch). (2) Polars Gebühren sind **USD-denominiert** (5 % + $0,50 etc.) — die €-Werte hier verschieben sich leicht mit dem Wechselkurs; zusätzlich fällt bei EU-Auszahlung ~0,25 % FX an.

## Tier-Modell

Free-Tier plus drei Bezahl-Tiers. Namen musik-thematisch (Venue-Reichweite als Skalen-Metapher); die konkrete Namens-Wahl ist noch offen (siehe unten). Limits sind 1:1 auf die vorhandenen Backend-Felder `requestsPerMinute` + `requestsPerDay` gemappt.

| | **Demo** (Free) | **Club** | **Arena** | **Stadium** |
|---|---|---|---|---|
| Preis | €0, keine Karte | €9/Mo · €90/Jahr | €29/Mo · €290/Jahr | €149/Mo · €1.490/Jahr |
| Rate (`requestsPerMinute`) | 30 | 60 | 200 | 600 |
| Tages-Cap (`requestsPerDay`) | **500** | 10.000 | 100.000 | 1.000.000 |
| Kommerzielle Nutzung | nein (Dev/Test/privat) | ja | ja | ja |
| „Powered by"-Attribution | Pflicht | Pflicht | — | — |
| Support | Community | E-Mail | Priorität | Priorität + SLA |
| Keys | 1 | 3 | 10 | unbegrenzt |

**Design-Philosophie:**

- **Der Free-Tier ist bewusst produktions-untauglich.** Der Trick liegt in der Kombination: **großzügige Rate (30/min)**, damit man flüssig entwickeln und testen kann, aber **winziger Tages-Cap (500/Tag)**, den kein Live-Service übersteht — ein Dutzend echte Nutzer sprengt 500 Requests/Tag sofort. Dazu **keine kommerzielle Nutzung** und **Attribution-Pflicht**. Damit taugt Demo zu „spielen, probieren, den eigenen Service entwickeln" — und zu nichts darüber hinaus. 500/Tag ≈ 10 Minuten Volllast bei 30/min; für aktives Bauen mit Test-Suiten knapp, aber ausreichend, und der Cap resettet täglich.
- **Der Sprung Demo → Club ist absichtlich groß** (20× Tagesvolumen): „ernst werden" = „bezahlen".
- **Attribution auch im Club** (erster Bezahl-Tier). Nebeneffekt: „kein ‚Powered by' mehr" wird zum konkreten Upgrade-Grund von **Club → Arena**, nicht nur mehr Volumen.
- **Die zwei mittleren Tiers bleiben Indie-tauglich** (€9 / €29), **Stadium** darf teuer sein.

## Preis- und Gebühren-Logik

Polars 2026-Tarife (Stand recherchiert 2026-07-04, USD):

| Polar-Tarif | Monatlich | pro Transaktion | günstiger als Starter ab (Umsatz/Mo) |
|---|---|---|---|
| Starter | frei | 5 % + $0,50 | — |
| Pro | $20 | 3,8 % + $0,40 | ~$1.379 (~€1.270) |
| Growth | $100 | 3,6 % + $0,35 | ~$5.634 (~€5.180) |
| Scale | $400 | 3,4 % + $0,30 | ~$19.048 (~€17.500) |

Zusatz (alle Tarife): Auslands-Karten **+1,5 %**, Chargeback **$15**, Auszahlung via Stripe **~$2/Mo + 0,25 % + $0,25**, EU-FX **0,25 %**.

**Der Fixbetrag ($0,50) zieht bei billigen Tiers.** Effektive Polar-Gebühr (Starter-Tarif) nach Tier-Preis:

| Tier-Preis | €9 | €19 | €29 | €49 | €149 |
|---|---|---|---|---|---|
| monatlich | ~10 % | ~7,4 % | ~6,6 % | ~5,9 % | ~5,3 % |
| **jährlich** | **~5,5 %** | **~5,2 %** | **~5,2 %** | **~5,1 %** | **~5,1 %** |

**Zwei Hebel, die das „untere Tiers zu teuer"-Problem lösen:**

1. **Jahresabrechnung aktiv bewerben** („2 Monate gratis"): eine Buchung/Jahr statt zwölf → der Fixbetrag fällt einmal an → **~5 % effektiv über alle Tiers**. Für Indie-Devs attraktiv, für uns billiger.
2. **Nicht unter ~€9/Monat** gehen — darunter frisst der Fixbetrag zweistellige Prozente.

**Polar-interner Tarif-Wechsel:** In der Frühphase ist **Starter** (keine Monatsgebühr) richtig; erst ab ~€1.270 verarbeitetem Umsatz/Monat lohnt **Pro**, ab ~€5.180 **Growth**. Das ist ein einmaliger Klick, kein Dauer-Management.

## Attribution-Strategie

**Grundsatz: Attribution ist keine technische Garantie, sondern Vertrag + Anreiz + reaktive Stichprobe.** So handhaben es Mapbox, Algolia und die Geo-/Wetter-APIs auch — niemand prüft proaktiv jede Kundenseite.

**Warum technische Durchsetzung bei uns besonders schwer ist:** Unsere Keys sind geheime, serverseitige Bearer-Tokens (`mc_live_…`). Ein sauber integrierter Kunde ruft die API vom Backend auf → wir sehen seine Frontend-Domain **nie** (kein `Origin`/`Referer`). Ein „Badge-Check-Crawler" liefe bei den meisten ins Leere.

**Was tatsächlich Hebel gibt:**

- **Terms of Service** als Basis: Nutzung von Demo/Club-Key = Zustimmung zur Attribution; Verstoß = Sperr-/Kündigungsrecht. Nicht proaktiv prüfen, sondern das Recht behalten, bei Fund zu sperren.
- **Der 500/Tag-Cap erledigt die Hauptarbeit:** Ein echter Live-Service ist auf Demo ohnehin unmöglich; wer skaliert, zahlt (Club).
- **Zahlende Club-Kunden sind greifbar:** Über Polar existiert Identität + Kontakt → reaktive Durchsetzung ist realistisch, ohne Massen-Scan.
- **Wo doch eine Domain sichtbar ist** (client-seitige Aufrufe → `Origin`/`Referer` an die `client_id` loggen): gezielte Stichprobenliste statt „alle prüfen".
- **Reibung minimieren:** ein fertiges, hübsches **„Powered by musiccloud"-Badge/Snippet** (Copy-paste-`<a>` bzw. Mini-Komponente) bereitstellen. Attribution scheitert meist an Reibung, nicht an bösem Willen.

**Empfehlung — Anreiz statt Polizei (Hybrid):** Attribution als ToS-Pflicht formulieren, aber zusätzlich **belohnen** (z. B. „Badge eingebaut + einmal verifiziert → doppeltes Demo-Kontingent" oder kleiner Club-Rabatt). Das ist durchsetzbar (nur wer den Bonus will, zeigt seine Seite freiwillig), reibungsärmer und bringt mehr echte Attribution. **Finale Wahl (Pflicht vs. Hybrid) siehe „Offene Entscheidungen".**

## Integrations-Architektur

Die Eigenleistung im Backend ist klein, weil der MoR Checkout + Steuer + Rechnung übernimmt und wir nur Webhooks konsumieren:

1. **Polar-Produkte** je Bezahl-Tier (Club / Arena / Stadium), jeweils mit Monats- **und** Jahres-Preis. **Demo** hat kein Polar-Produkt (self-serve Key, hart limitiert).
2. **„Upgrade"-Button im Portal** → **gehosteter Polar-Checkout** (Zahlung + VAT + Rechnung macht Polar).
3. **Webhook-Handler** im Backend: bei `subscription.created/updated/canceled` (o. ä.) → Tier auflösen → am Developer-Account bzw. dessen `api_client`(s) setzen:
   - `status`, **`requestsPerMinute` + `requestsPerDay`** (aus der Tier-Definition),
   - ein „kommerziell erlaubt"-Flag und ein „Attribution nötig"-Flag,
   - den `plan`-Wert am Account (Demo/Club/Arena/Stadium).
   Downgrade/Kündigung → zurück auf Demo-Limits.
4. **Customer-Portal** (Polar-hosted) für Kündigung/Zahlungsmittel — nichts selbst zu bauen.
5. **Durchsetzung** (MC-025 Phase 2): `authenticatePublic` prüft den Key gegen `api_client_tokens` (Hash-Vergleich), lädt die Client-Limits, zählt Requests (pro Minute + pro Tag) und lehnt über Cap mit `429` ab. **Erst diese Schicht macht die Tier-Limits real.**

Die **Tier-Definitionen** (Preis + Limits + Flags) leben als eine zentrale Konstante (Single Source of Truth), die sowohl der Webhook-Mapper als auch die Portal-Preistabelle konsumieren.

---

**(Ende Billing-Phase-Zieldesign — der Rest des Dokuments ist wieder übergreifend.)**

## Umsetzung: Plan-Aufteilung

Das Feature sitzt auf mehreren Schichten. Nach der Plan-Size-Regel getrennt in eigenständige Pläne (jeder mit eigener `Plan-Nr.` via `plans next`), in Abhängigkeitsreihenfolge — **die ersten beiden sind Phase 0 (jetzt), 3–4 sind zurückgestellt:**

1. **[MC-088] Public-API Token-Enforcement + Per-Client-Rate-Limiting** *(Phase 0, jetzt)* — Fundament, = MC-025 Phase 2 Kern: `authenticatePublic` validiert `api_client_tokens` (Hash-Lookup), löst den Client auf, stempelt `lastUsedAt`, setzt `requestsPerMinute`/`requestsPerDay` durch (`429` bei Cap). Free-first: bestehende Client-Defaults als Limits, **kein** erzwungener Anonymous-Cutover. **Ohne diesen Plan sind alle Limits nur DB-Zahlen.**
2. **[MC-089] Developer-Portal Self-Service-UI + Pricing-Commitment** *(Phase 0, jetzt)* — die Tabs *API access* (Antrag/Status) + *API keys* (Keys sehen/rotieren/widerrufen) + *Usage* (Limits + `lastUsedAt`), gegen das vorhandene MC-077-`dev-api-access.ts`-Backend; plus die öffentliche Pricing/Commitment-Seite. Kann teils parallel zu (1) entstehen.
3. **Polar-Billing-Integration** *(zurückgestellt)* — Tier-Konstante, Polar-Produkte, Checkout-Link im Portal, Webhook → `plan` + Limits + Flags, Customer-Portal-Link, „Powered by"-Badge-Snippet.
4. **Später: Usage-Analytics + Voll-Ausbau `Usage`-Tab** *(zurückgestellt, MC-025 Phase 2 Analytics)* — pseudonyme serverseitige Nutzungsstatistik (Consumer, Endpoint, Status, Latenz, Cache) statt nur Limits/`lastUsedAt`.

**Hinweis zu MC-025:** Der bestehende Codex-Plan MC-025 (`.codex/plans/open/2026-06-05-…`) stammt von **vor** der MC-077-Reconciliation; sein Phase-1-Backend ist durch MC-077 überholt. Eindeutig offen und einzigartig ist nur noch sein **Phase-2-Inhalt** (Enforcement + Analytics), der von Plan 1 und Plan 4 aufgegriffen wird. MC-025 sollte entsprechend refresht bzw. als „superseded" markiert werden, wenn Plan 1 steht.

## Offene Entscheidungen

**Alle folgenden Punkte betreffen die Billing-Phase; für Phase 0 (Free-first) sind sie nicht blockierend.**

- **Tier-Namen:** Venue-Ladder **Demo/Club/Arena/Stadium** (Empfehlung) vs. **Demo/Single/EP/Album** (indie-charmant) vs. **Demo/Gold/Platinum/Diamond** (Chart-Zertifizierung). Noch nicht final abgesegnet.
- **Attribution-Modell:** harte ToS-Pflicht vs. **Anreiz-Hybrid** (Empfehlung: Hybrid).
- **Exakte Tages-Caps:** gegen die reale Cache-Ökonomie tunen (ein Resolve-Call trifft mehrere Upstreams; je nach Cache-Hit-Rate ist 100k/Tag mal billig, mal teuer).
- **Exakte Preise:** €9 / €29 / €149 sind Vorschlag.
- **„Custom/Enterprise" über Stadium:** optional als „auf Anfrage" ergänzen (nicht als vierter Bezahl-Tier, um „drei" zu wahren).

## Verwandt

- Self-Service-Design (Abschnitte A–E): [`2026-07-01-developer-api-access-self-service-design.md`](2026-07-01-developer-api-access-self-service-design.md)
- Developer-Site-Design: [`2026-06-26-developer-site-design.md`](2026-06-26-developer-site-design.md)
- MC-077 (Backend-Fundament, done), MC-066 (Portal-Auth-UI, done), MC-025 (Codex, Enforcement + Analytics, offen).

## Verifizierte Fakten (2026-07-04)

- **Portal-Tabs „Soon"** + `plan`-Anzeige: MC-066 (`apps/developer`, done); die drei Tabs sind deaktivierte Platzhalter.
- **Backend-Fundament** MC-077 (done): `api_clients` trägt `requestsPerMinute` (Default 60) + `requestsPerDay` (Default 10.000); `dev-api-access.ts` (6 Endpunkte) + `admin-api-access.ts` (9 Endpunkte); `api_client_tokens` speichert nur Hashes.
- **Enforcement fehlt:** `authenticatePublic` prüft `api_client_tokens` noch nicht (MC-077-Abschlussvermerk, „nicht Teil dieses Durchgangs, MC-025 Phase 2").
- **Abschnitt E** (Developer-Portal-UI) ist im Self-Service-Design als „separater Folge-Plan" markiert; kein Implementierungsplan existiert.
- **Polar-Tarife** (Starter 5 %+$0,50; Pro $20/3,8 %+$0,40; Growth $100/3,6 %+$0,35; Scale $400/3,4 %+$0,30; +1,5 % Auslands-Karten; $15 Chargeback; Auszahlung ~$2/Mo + 0,25 %+$0,25; EU-FX 0,25 %; Crossover-Schwellen ~$1.379 / ~$5.634 / ~$19.048): recherchiert von [polar.sh/resources/pricing](https://polar.sh/resources/pricing), 2026-07-04.
- **Mollie = PSP (kein MoR)**, **Creem = MoR** ab 3,9 %+$0,40 mit EU-OSS + freier SEPA-Auszahlung: recherchiert 2026-07-04.

### Code-Referenzen für Phase 0 (MC-088/MC-089), verifiziert 2026-07-04

- **Enforcement-Injektionspunkt:** `authenticatePublic` — `apps/backend/src/plugins/auth.ts:122`. Akzeptiert heute nur `X-API-Key === INTERNAL_API_KEY` (BFF) oder `Authorization: Bearer <JWT>`; validiert **keine** `mc_live_`-Tokens. `request.developerAccount`-Augmentation als Muster ebd. `:56`.
- **Rate-Limit-Infra:** `RateLimiter`-Klasse (fixe `maxRequests` im Ctor) + `apiRateLimiter = new RateLimiter(10, 60_000)` + `isInternalRequest` — `apps/backend/src/lib/infra/rate-limiter.ts:30,139,164`. `sendRateLimitError(reply, check)` (Code `MC-API-0003`, `Retry-After` + `429`) — `rate-limit-response.ts:7`. Per-IP-Aufrufe in `resolve.ts:201`, `resolve-public-get.ts:135`, `link.ts:87`, `artist-info.ts:152`, `share.ts:104` u. a.
- **Token-Helper:** `hashApiToken(raw)` (SHA-256 hex) + Shape `mc_live_<prefix>_<secret>` — `apps/backend/src/services/api-access-token.ts:50`.
- **Schema steht (kein Migration-Bedarf):** `apiClients` (`requestsPerMinute` Default 60, `requestsPerDay` Default 10.000, `status`) — `apps/backend/src/db/schemas/postgres.ts:1686`; `apiClientTokens` (`tokenHash`, Unique-Index `uq_api_client_tokens_hash`, `status`, `lastUsedAt`) — ebd. `:1725,1742`.
- **Repo hat noch keinen Hash-Lookup:** `ApiAccessRepository` (`apps/backend/src/db/api-access-repository.ts:130`) braucht zwei neue Methoden (`findActiveApiClientByTokenHash`, `touchApiClientTokenLastUsed`). Präzedenz: `findActiveDeveloperEmailToken(tokenHash, purpose)` — `developer-repository.ts:245`, Impl `adapters/postgres.ts:1157`. **Nur ein Adapter** (`adapters/postgres-api-access.ts`), gewählt in `db/index.ts:37` — Methoden dort einmal implementieren.
- **Portal-Backend komplett** (MC-089 = reines Frontend): `dev-api-access.ts` registriert alle 6 Endpunkte; Konstanten `ENDPOINTS.dev.apiAccess.{requestsCreate,requestsList,clientsList}` + `ROUTE_TEMPLATES.dev.apiAccess.{clientCreateToken,tokenRevoke,tokenRotate}` — `packages/shared/src/endpoints.ts:430,528`. Token-Create/Rotate liefern `rawToken` einmalig.
- **Portal-Frontend-Anker:** Tabs `DASHBOARD_NAV` (ApiAccess/ApiKeys/Usage = `comingSoon`) — `apps/developer/src/lib/dashboardTabs.ts:52`. Dashboard-Seiten-Muster (`getDeveloperSession` → `/login`, `DashboardLayout active={...}`, Design-Tokens, Phosphor) — `pages/dashboard/index.astro`. BFF-Proxy `/api/dev/*` inkl. Cookie-Relay — `pages/api/dev/[...path].ts`. React-Island-Muster — `components/dashboard/DeleteAccountSection.tsx`.
