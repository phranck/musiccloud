# Creem-Fundament (Developer-Subscription): Implementierungsplan

Plan-Nr.: MC-110

## TLDR

Dieser Plan legt das Fundament dafür, dass das Developer-Portal später kostenpflichtige Abos verkaufen kann. Abgerechnet wird über Creem, einen EU-inkorporierten Zahlungsdienst (Estland), der rechtlich als Verkäufer auftritt (Merchant of Record) und damit Umsatzsteuer, Rechnungen und Rückerstattungen für uns übernimmt. Wir bauen hier nur die Grundlage, noch nicht den Kaufvorgang.

Der Anbieter hat sich von Polar zu Creem geändert, weil EU-Inkorporation eine harte Anforderung ist und Polar eine US-Firma ist. Creem ist EU-nativ (Estland) und übernimmt die EU-Steuer über das OSS-Verfahren. Der Polar-spezifische Code wurde bereits zurückgebaut; die vendor-neutralen Teile (die Idee der Subscription-Tabelle, der dbdump-Scrub) bleiben und werden auf Creem angepasst.

Was gebaut wird: eine validierte Creem-Konfiguration (API-Key, Test- oder Live-Umgebung, Webhook-Secret), ein Creem-SDK-Client, die auf Creem umbenannte Subscription-Tabelle, eine eigene Mapping-Tabelle Tier zu Creem-Produkt, ein server-seitiger Zugriff auf den Creem-Produktkatalog (Live-Preise), und ein einmaliges Anlegen unserer Tier-Produkte in Creem. Wichtige Korrektur gegenueber dem urspruenglichen Entwurf: Creem-Produkte tragen kein Metadata-Feld (verifiziert gegen SDK und Live-Doku, 2026-07-09), anders als Polar oder Paddle. Die Zuordnung Tier zu Produkt kann also nicht bei Creem liegen. Sie lebt daher in einer eigenen Tabelle bei uns. Creem bleibt SoT nur fuer die Preise; die Tier-zu-Produkt-Zuordnung ist bei uns. Das ist vendor-portabel und war ohnehin bei jedem geprueften EU-inkorporierten MoR noetig.

Ein wichtiger Unterschied zu Polar: Creems Checkout ist eine gehostete Weiterleitung (kein eingebettetes iframe). Der Kunde bezahlt auf Creems Seite und kommt zurück. Karten- und Bankdaten berühren unsere Server nie; die PCI-Verantwortung bleibt vollständig bei Creem. Der Checkout selbst kommt erst in Plan C, dieser Plan bereitet nur die Datenbasis vor.

Voraussetzung von deiner Seite: ein Creem-Konto mit einem Test-API-Key (`creem_test_...`) und einem Webhook-Secret, eingetragen in `apps/backend/.env.local`. Die alten `POLAR_*`-Variablen können raus.

---

> **Für agentische Worker:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (empfohlen) oder `superpowers:executing-plans`. Steps nutzen Checkbox-Syntax (`- [ ]`), beim Abarbeiten SOFORT im Dokument abhaken. Alle neuen Texte em-dash-frei.

**Goal:** Das Datenmodell- und Config-Fundament für Creem-Billing im Developer-Portal bauen (ohne Checkout, Webhook-Handler oder UI): Creem-Config plus Boot-Guard, Creem-SDK-Client, Umbau der `developer_subscriptions`-Tabelle auf Creem, eigene Mapping-Tabelle `tier_creem_products`, server-seitiger Creem-Katalog-Fetch (Live-Preise) mit Tier-zu-Produkt-Zuordnung aus dieser Tabelle, und das Anlegen der Tier-Produkte in Creem.

**Architecture:** Creem ist Source of Truth fuer die Preise (Katalog-Fetch, server-seitig gecacht). Die Tier-zu-Produkt-Zuordnung liegt bei uns in der Tabelle `tier_creem_products` (`tierId`, `interval`, `creemProductId`), weil Creem-Produkte kein Metadata-Feld tragen. Die Tabelle wird vom Seed befuellt und vom dbdump-Scrub geleert, damit ein Prod-Dump keine falschen (umgebungsspezifischen) Produkt-IDs in die lokale Test-Umgebung bringt. Die Tabelle `developer_subscriptions` traegt nur Creem-Billing-Details; der effektive Tier wird erst in Plan C aus Creem gespiegelt (dort dient die Subscription-Metadata dem Account-Linking, die existiert bei Creem). Test- oder Live-Umgebung ergibt sich aus dem Key-Prefix (`creem_test_`), gespiegelt am bestehenden GitHub-OAuth-Env-Muster.

**Tech Stack:** Fastify plus Drizzle (Postgres) plus `creem` SDK (Backend), Vitest, drizzle-kit, Bash (`scripts/dbdump`).

**Referenz:** Creem-Doku `https://docs.creem.io` (getting-started, api-reference, webhooks, llms-full). Die frühere Polar-Spec ist überholt; die vendor-neutralen Design-Entscheidungen (Flow, Sicherheitsmodell, Free als MoR-Subscription) bleiben gültig.

---

## Verifizierte Fakten (2026-07-09, per Doku/SDK-Inspektion)

- **SDK:** `creem@^1.5.3` installiert (Polar-SDK entfernt, `cdca9655`). Exports u.a. `Creem`, `ServerTest`, `ServerProd`, `serverURLFromOptions`. Auth per Header `x-api-key`. Test-Base `https://test-api.creem.io/v1`, Live-Base `https://api.creem.io/v1`. Test vs Live ergibt sich aus dem Key-Prefix `creem_test_`.
- **Free-Tier:** Creem unterstützt Free-Produkte (0-Preis) und Free-Subscriptions per API ohne Checkout (`POST /v1/subscriptions`).
- **Products:** ein Produkt pro Intervall (month und year sind zwei Produkte). Billing-Perioden `every-month`, `every-three-months`, `every-six-months`, `every-year`. **KEIN Metadata-Feld am Produkt** (verifiziert 2026-07-09 gegen `creem@1.5.3` dist-Typen UND `docs.creem.io/api-reference/endpoint/create-product`: weder `ProductEntity` noch `CreateProductRequestEntity` haben `metadata`; nur `features` (kundensichtbar) und `custom_fields` (Kunden-Input). Daher lebt die Tier-zu-Produkt-Zuordnung bei uns, siehe `tier_creem_products`.)
- **SDK-Methoden (creem@1.5.3):** `client.products.get(productId) -> ProductEntity`, `client.products.create(CreateProductRequestEntity) -> ProductEntity`, `client.products.search(pageNumber?, pageSize?) -> PageIterator` (paginierte Liste, heisst `search`, nicht `list`). `client.subscriptions.get/search/cancel/update/upgrade/pause/resume`. `ProductEntity`-Felder u.a.: `id`, `name`, `description`, `price` (Cent, number), `currency` (ISO-String), `billingType`, `billingPeriod`, `status`. Konstruktor `new Creem({ server: ServerTest|ServerProd, apiKey })` (`ServerTest="test"`, `ServerProd="prod"`; `apiKey` ist die x-api-key-Security).
- **Subscription-Status (Creem):** `active`, `trialing`, `paused`, `past_due`, `expired`, `canceled`, `scheduled_cancel`.
- **Entitlements:** webhook-getrieben (`checkout.completed`, `subscription.paid`, `subscription.active/canceled/expired`) plus abrufbar (`GET /v1/subscriptions/{id}`, `GET /v1/customers/{id}/subscriptions`). Webhook-Signatur per HMAC-SHA256 (timing-safe), Secret aus Env. Idempotenz per Upsert.
- **Verknüpfung:** Subscription- und Checkout-Objekte tragen sehr wohl Metadata (anders als Produkte). Unsere Account-ID plus `request_id` gehen an der Checkout-/Subscription-Erstellung mit; das Account-Linking (Plan C) laeuft ueber diese Subscription-/Checkout-Metadata, nicht ueber Produkt-Metadata.
- **Schema:** `apps/backend/src/db/schemas/postgres.ts`. `developerSubscriptions` existiert bereits (Migration `0068`), trägt aber noch Polar-Spalten (`polarSubscriptionId` `:1659`, `polarCustomerId` `:1660`, Index `uq_developer_subscriptions_polar_id` `:1669`) und Polar-Status. Muss auf Creem umbenannt und die Status-Constraint auf Creems Werte gesetzt werden. Letzte Migration `0068`, neue wird `0069`.
- **Env:** `apps/backend/src/lib/env.ts` (`requireEnv`), `boot-env.ts` (`assertRequiredBootEnv`, wieder Polar-frei), `config.ts`. Muster `GITHUB_OAUTH_*` via `requireEnv` in `services/developer-github.ts`.
- **dbdump-Scrub:** bereits umgesetzt (vendor-neutral, leert `developer_subscriptions`), `scripts/dbdump` ist ein gitignored lokaler Helper.

**Verifikations-Checkliste:**
- [ ] Alle Code-Referenzen vor Task-Start re-verifiziert (Migrationsnummer via `ls`, Schema-Zeilen, Creem-SDK-Konstruktor und Methodennamen gegen `creem@1.5.3`, Creem-Produkt- und Subscription-Endpunkte gegen die aktuelle Doku).

## Manuelle Voraussetzung (Phase 0, deine Aufgabe)

- Bei Creem registrieren (EU/Estland), einen **Test-API-Key** (`creem_test_...`) und ein **Webhook-Secret** erzeugen.
- In `apps/backend/.env.local`: `CREEM_API_KEY=creem_test_...` und `CREEM_WEBHOOK_SECRET=...` setzen. Die alten `POLAR_*`-Zeilen entfernen.
- Die Tier-Produkte legt Task 7 per Skript an (kein manuelles Klicken nötig).

## Dateistruktur

- `apps/backend/src/lib/creem-config.ts` (neu): liest/validiert `CREEM_API_KEY` (leitet Test/Live aus dem Prefix ab) und `CREEM_WEBHOOK_SECRET`; exportiert `CreemConfig` plus `getCreemConfig()`.
- `apps/backend/src/lib/boot-env.ts` (modify): Creem-Konsistenz-Guard, nur wenn `CREEM_API_KEY` gesetzt.
- `apps/backend/src/db/schemas/postgres.ts` (modify): `developerSubscriptions` auf Creem umbenennen (Spalten, Index, Status-Constraint) plus neue Tabelle `tierCreemProducts` (Tier-zu-Creem-Produkt-Mapping).
- `apps/backend/src/db/migrations/postgres/0069_creem_retarget.sql` (hand-geschrieben, Rename) plus `0070_*.sql` (neue Mapping-Tabelle, via `db:generate`), jeweils mit Journal/Snapshot.
- `apps/backend/src/services/creem-client.ts` (neu): `getCreemClient()` (Singleton, Test/Live-Server aus der Config).
- `apps/backend/src/services/creem-catalog.ts` (neu): `getCreemCatalog()` (liest die `tier_creem_products`-Zuordnung, holt Live-Preise pro Produkt von Creem, baut die Map, In-memory-Cache mit TTL).
- `scripts/creem-seed.mjs` (neu, gitignored lokaler Helper wie dbdump): legt die Tier-Produkte in Creem an (ohne Metadata, das kann Creem nicht) und schreibt die zurueckgegebenen Produkt-IDs in `tier_creem_products`.

**Tests:** `creem-config.test.ts`, `creem-client.test.ts`, `creem-catalog.test.ts`.

---

## Task 1: `creem` SDK-Dependency

- [x] **Step 1: Dependency-Swap** durchgeführt: `@polar-sh/sdk` entfernt, `creem@^1.5.3` hinzugefügt (`cdca9655`), lädt sauber.

## Task 2: Creem-Config lesen plus validieren (`creem-config.ts`)

**Files:** Create `apps/backend/src/lib/creem-config.ts`, Test `apps/backend/src/lib/creem-config.test.ts`

Zweck: Eine typisierte, an einer Stelle validierte Sicht auf die Creem-Env. Test vs Live folgt aus dem Key-Prefix `creem_test_`.

- [x] **Step 1: Failing test**: `getCreemConfig()` mit `CREEM_API_KEY=creem_test_abc` liefert `{ apiKey: "creem_test_abc", mode: "test", webhookSecret: undefined }`; mit einem Key ohne `creem_test_`-Prefix `mode: "live"`; mit gesetztem `CREEM_WEBHOOK_SECRET` wird es zurückgegeben; fehlender `CREEM_API_KEY` wirft. `vi.stubEnv` plus `vi.unstubAllEnvs()`, Muster aus einem bestehenden `apps/backend/src/**/*.test.ts`.
- [x] **Step 2: Fails**: `pnpm --filter @musiccloud/backend test:run creem-config` FAIL.
- [x] **Step 3: Implementieren.**
```ts
import { requireEnv } from "./env.js";

/** Validierte Creem-Laufzeit-Config, an einer Stelle gelesen (fail-fast). */
export interface CreemConfig {
  apiKey: string;
  mode: "test" | "live";
  webhookSecret: string | undefined;
}

/**
 * Reads and validates the Creem runtime config from the environment. The mode
 * (test vs live) is derived from the API key prefix, so a test key can never
 * accidentally hit live and vice versa.
 */
export function getCreemConfig(): CreemConfig {
  const apiKey = requireEnv("CREEM_API_KEY");
  return {
    apiKey,
    mode: apiKey.startsWith("creem_test_") ? "test" : "live",
    webhookSecret: process.env.CREEM_WEBHOOK_SECRET || undefined,
  };
}
```
- [x] **Step 4: Grün** PASS.
- [x] **Step 5: Commit**: `Feat: read and validate Creem env config (MC-110)`.

## Task 3: Boot-Guard für Creem-Config (`boot-env.ts`)

**Files:** Modify `apps/backend/src/lib/boot-env.ts`, Test `apps/backend/src/lib/boot-env.test.ts`

- [x] **Step 1: Failing test**: Guard mit `vi.mock("./creem-config.js")`. Bei gesetztem `CREEM_API_KEY` wird `getCreemConfig` aufgerufen und wirft weiter; bei fehlendem Key nicht.
- [x] **Step 2: Fails**: `pnpm --filter @musiccloud/backend test:run boot-env` FAIL.
- [x] **Step 3: Implementieren.** In `assertRequiredBootEnv()` nach der Schleife:
```ts
import { getCreemConfig } from "./creem-config.js";
// nach der REQUIRED_BOOT_ENV-Schleife:
if (process.env.CREEM_API_KEY) {
  getCreemConfig();
}
```
Kommentar: warum nur bei gesetztem Key (Creem in der Foundation-Phase optional bootbar, aber wenn verdrahtet, dann konsistent).
- [x] **Step 4: Grün** PASS.
- [x] **Step 5: Commit**: `Feat: boot-guard validates Creem config when wired (MC-110)`.

## Task 4: `developer_subscriptions` auf Creem umbauen (Migration 0069)

**Files:** Modify `apps/backend/src/db/schemas/postgres.ts`, Generated `0069_*.sql` plus Journal

- [x] **Step 1: Schema anpassen** an `developerSubscriptions`: `polarSubscriptionId` zu `creemSubscriptionId` (Spalte `creem_subscription_id`), `polarCustomerId` zu `creemCustomerId` (`creem_customer_id`), Index `uq_developer_subscriptions_polar_id` zu `uq_developer_subscriptions_creem_id`. Status-Check-Constraint auf Creems Werte: ``sql`${table.status} IN ('active', 'trialing', 'paused', 'past_due', 'expired', 'canceled', 'scheduled_cancel')` ``. Den TSDoc-Kommentar von Polar auf Creem umschreiben (keine Em-Dashes, kein Polar mehr). `interval` bleibt `month`/`year` (unsere normalisierte Form; Creems `every-month` wird in Plan C darauf gemappt).
- [x] **Step 2: Migration** `0069_creem_retarget.sql` von Hand geschrieben, weil `pnpm db:generate` fuer den Spalten-Rename ein TTY braucht (non-interaktiv nicht moeglich). Reines `ALTER ... RENAME` (Tabelle leer, kein Datenverlust), plus Drop/Add der Status-Constraint. Snapshot `0069_snapshot.json` deterministisch aus `0068_snapshot.json` abgeleitet (nur `developer_subscriptions` geaendert) und per `db:generate`-Idempotenz-Check verifiziert: meldet danach "No schema changes", kein Diff, kein `0070`.
- [x] **Step 3: Anwenden**: `pnpm db:migrate` gegen die lokale DB (Port 5433). "Drizzle migrations applied.", kein Fehler.
- [x] **Step 4: Verify**: `\d developer_subscriptions` zeigt `creem_subscription_id`, `creem_customer_id`, Index `uq_developer_subscriptions_creem_id`, Unique `developer_subscriptions_creem_subscription_id_unique` und die neue Status-Constraint (7 Creem-Werte); FKs intakt.
- [x] **Step 5: Commit**: `Feat: retarget developer_subscriptions at Creem (MC-110)`.

## Task 5: Creem-SDK-Client (`creem-client.ts`)

**Files:** Create `apps/backend/src/services/creem-client.ts`, Test `apps/backend/src/services/creem-client.test.ts`

- [x] **Step 1: Failing test**: `getCreemClient()` (mit gemocktem `getCreemConfig` auf `{ apiKey: "creem_test_x", mode: "test", webhookSecret: undefined }`) liefert eine Instanz und beim zweiten Aufruf dieselbe (Singleton). `creem` mit `vi.mock` stubben.
- [x] **Step 2: Fails**: `pnpm --filter @musiccloud/backend test:run creem-client` FAIL.
- [x] **Step 3a: SDK-Shape verifizieren**: den exakten Konstruktor gegen `creem@1.5.3` prüfen (Option `serverURL` vs `serverIdx`, wie der `x-api-key` gesetzt wird: Konstruktor-Security vs pro Call). Nichts erfinden. Ergebnis: Option heisst `server` (nicht `serverURL`), `apiKey` ist Pflicht-Parameter fuer `x-api-key`; Plan-Snippet war falsch (korrigiert).
- [x] **Step 3: Implementieren.** Erwartete Form (an die verifizierte SDK-Signatur anpassen):
```ts
import { Creem, ServerTest, ServerProd } from "creem";
import { getCreemConfig } from "../lib/creem-config.js";

let instance: Creem | null = null;

/**
 * Returns the singleton Creem SDK client. The server (test vs live) follows the
 * config mode, which is derived from the API key prefix. The api key is the
 * x-api-key security option (verify the exact wiring against creem@1.5.3).
 */
export function getCreemClient(): Creem {
  if (instance) return instance;
  const { apiKey, mode } = getCreemConfig();
  instance = new Creem({ server: mode === "test" ? ServerTest : ServerProd, apiKey });
  return instance;
}
```
- [x] **Step 4: Grün** PASS (4/4 tests).
- [x] **Step 5: Commit**: `Feat: add Creem SDK client factory (MC-110)`.

## Task 6: `tier_creem_products` Mapping-Tabelle plus Migration 0070

**Files:** Modify `apps/backend/src/db/schemas/postgres.ts`, Generated `0070_*.sql` plus Journal

Zweck: Creem-Produkte tragen kein Metadata-Feld (verifiziert, siehe Verifizierte Fakten). Die Zuordnung `tierId -> { interval -> creemProductId }` lebt daher bei uns, in einer eigenen Tabelle. Creem bleibt SoT nur fuer Preise/Waehrung (Live-Fetch in Task 7). Die Tabelle wird vom Seed (Task 8) befuellt und vom dbdump-Scrub geleert, weil sie umgebungsspezifische Test- vs Prod-Produkt-IDs haelt.

- [x] **Step 1: Schema** `tierCreemProducts` in `postgres.ts`: `id` text PK, `tierId` text FK->tiers ON DELETE cascade, `interval` text, `creemProductId` text unique, `createdAt`/`updatedAt` timestamptz default now. Unique-Constraint auf (`tierId`, `interval`). Check `interval IN ('month', 'year')`. Detaillierter TSDoc (warum das Mapping bei uns liegt, nicht bei Creem). Keine Em-Dashes.
- [x] **Step 2: Migration generieren**: `pnpm db:generate` lief non-interaktiv durch (additive CREATE TABLE, kein Rename-Prompt), erzeugte `0070_worried_justin_hammer.sql` plus Journal/Snapshot. SQL geprueft: nur die neue Tabelle (CREATE TABLE, unique creem_product_id, check interval, FK->tiers cascade, unique index (tier_id, interval)).
- [x] **Step 3: Anwenden**: `pnpm db:migrate` -> "Drizzle migrations applied.", kein Fehler. Danach `db:generate`-Idempotenz-Check: "No schema changes".
- [x] **Step 4: Verify**: `\d tier_creem_products` zeigt alle Spalten, Unique auf (tier_id, interval), creem_product_id-Unique, interval-Check und FK auf tiers (cascade).
- [x] **Step 5: Commit**: `Feat: add tier_creem_products mapping table (MC-110)`.

## Task 7: Creem-Katalog-Fetch (`creem-catalog.ts`)

**Files:** Create `apps/backend/src/services/creem-catalog.ts`, Test `apps/backend/src/services/creem-catalog.test.ts`

Zweck: Preise/Waehrung liegen bei Creem, die Tier-Zuordnung bei uns. Diese Funktion liest die `tier_creem_products`-Zuordnung, holt pro Produkt den Live-Preis von Creem und baut `tierId -> { interval -> { productId, price, currency } }`, server-seitig mit kurzem In-memory-Cache (TTL). Kein Product-Metadata, kein Env-Mapping.

- [x] **Step 1: Failing test**: `getCreemCatalog()` mit (a) gemockter Mapping-Query (liefert eine Zeile tierId/interval/creemProductId) und (b) gemocktem Creem-Client, dessen `products.get(id)` Preis (Cent) plus Waehrung liefert. Erwartung: Map `tierId -> { interval -> { productId, price, currency } }`; zweiter Aufruf innerhalb der TTL trifft weder DB noch Client (Cache-Hit); nach TTL erneuter Fetch.
- [x] **Step 2: Fails**: `pnpm --filter @musiccloud/backend test:run creem-catalog` FAIL.
- [x] **Step 3: Implementieren.** Liest die Mapping-Tabelle (Drizzle), ruft pro `creemProductId` `client.products.get(productId)` auf (verifiziert: `ProductEntity.price` in Cent (number), `.currency` ISO-String), baut die Map, cached mit Modul-Timestamp plus `CATALOG_TTL_MS` (z.B. `5 * 60_000`). TSDoc: warum Preis-SoT bei Creem, warum Mapping bei uns, warum Cache.
- [x] **Step 4: Grün** PASS.
- [x] **Step 5: Commit**: `Feat: fetch and cache the Creem product catalog (MC-110)`.

## Task 8: Tier-Produkte in Creem anlegen plus Mapping befuellen (`scripts/creem-seed.mjs`)

**Files:** Create `scripts/creem-seed.mjs` (gitignored lokaler Helper, wie `scripts/dbdump`)

**Voraussetzung:** Phase 0 erledigt (`CREEM_API_KEY` in `apps/backend/.env.local`). Ohne Key nicht ausfuehrbar (blockiert).

Zweck: Die vier Tiers als Creem-Produkte anlegen (je month und year; Demo als ein Free-Produkt) und die von Creem zurueckgegebene `creemProductId` pro (tierId, interval) in `tier_creem_products` schreiben. KEINE Metadata am Produkt (Creem unterstuetzt das nicht). Idempotent: existiert die Mapping-Zeile schon, ueberspringen.

- [ ] **Step 1: Creem-Produkt-Create-Payload verifizieren** gegen `docs.creem.io/api-reference` und `CreateProductRequestEntity`: `name`, `description`, `price` (Cent, 0 oder >=100), `currency`, `billingType` ('recurring'|'onetime'), `billingPeriod` ('every-month'|'every-year'). Es gibt KEIN `metadata`-Feld.
- [ ] **Step 2: Skript schreiben**: liest `CREEM_API_KEY` aus `apps/backend/.env.local`, Base aus dem Key-Prefix (`test-api.creem.io` vs `api.creem.io`), liest die vorhandenen `tier_creem_products`-Zeilen, legt fehlende Produkte via `client.products.create(...)` an und schreibt (tierId, interval, creemProductId) in `tier_creem_products`. Preise aus der Monetization-Spec (Demo frei; Club 9/90, Arena 29/290, Stadium 149/1490 Euro). `scripts/creem-seed.mjs` in `.gitignore` aufnehmen (analog `scripts/dbdump`).
- [ ] **Step 3: Ausfuehren** (mit gesetztem Test-Key): Produkte in der Creem-Test-Umgebung angelegt, Mapping befuellt; `getCreemCatalog()` findet danach alle vier Tiers.
- [ ] **Step 4: Verify**: Produkte im Creem-Dashboard; `tier_creem_products` befuellt (Demo 1 plus Club/Arena/Stadium je 2); Katalog-Fetch liefert Preise.
- [ ] **Step 5: Commit**: kein Code-Commit noetig (Skript ist gitignored); nur die `.gitignore`-Zeile committen: `Chore: gitignore the local creem-seed helper (MC-110)`.

## Task 9: dbdump-Scrub

- [x] **developer_subscriptions**: bereits gescrubbt (`scripts/dbdump` leert es nach dem Restore, table-existence-guarded, vendor-neutral).
- [ ] **Step 1: `tier_creem_products` in den Scrub aufnehmen**: nach dem Restore auch `tier_creem_products` leeren (to_regclass-guarded TRUNCATE), damit Prod-Produkt-IDs nicht in die lokale Test-Umgebung gelangen. `scripts/dbdump` ist gitignored, kein Code-Commit.

## Task 10: Gesamt-Gates

- [ ] **Step 1: Backend-Gates**: `pnpm --filter @musiccloud/backend test:run` grün; Backend-Typecheck grün.
- [ ] **Step 2: Lint**: Biome sauber auf allen berührten `.ts`; keine Em-Dashes.
- [ ] **Step 3: Clean-State-Migration**: aus sauberem Stand (`pnpm db:migrate`) laufen alle Migrationen inkl. `0069` und `0070` ohne Fehler.
- [ ] **Step 4: Alle Refs verifiziert**; `plans check` grün.

---

## Self-Review (nach Fertigstellung auszufüllen)

- [ ] **Abdeckung**: Creem-Config plus Boot-Guard, `developer_subscriptions`-Umbau, SDK-Client, `tier_creem_products`-Mapping-Tabelle, Katalog-Fetch (Mapping plus Live-Preise), Produkt-Seed je einem Task zugeordnet.
- [ ] **Placeholder-Scan**: die bewussten Laufzeit-Verifikationen sind die SDK-Shape-Checks (Task 5 Step 3a: Konstruktor; Task 8 Step 1: create-product-Payload), dokumentiert, nicht erfunden.
- [ ] **Typ-Konsistenz**: `CreemConfig`, `getCreemConfig`, `getCreemClient`, `getCreemCatalog`, `developerSubscriptions`/`creemSubscriptionId`, `tierCreemProducts`/`creemProductId` über alle Tasks identisch.

## Abgrenzung (bewusst NICHT in Plan B)

- Kein Checkout (gehosteter Creem-Redirect), kein Webhook-Handler, kein Schreiben von `account.tierId` oder `developer_subscriptions` (Plan C).
- Keine Subscription-Management-UI (Plan D).
- Kein Master-Schalter, keine Kaufbarkeits-Regel, keine Coming-soon-Darstellung (Plan E).
- Kein Usage-Metering (Creem-Credits) fuer Per-Request-Abrechnung (spätere Phase).
