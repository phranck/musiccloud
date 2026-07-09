# Creem-Fundament (Developer-Subscription): Implementierungsplan

Plan-Nr.: MC-110

## TLDR

Dieser Plan legt das Fundament dafür, dass das Developer-Portal später kostenpflichtige Abos verkaufen kann. Abgerechnet wird über Creem, einen EU-inkorporierten Zahlungsdienst (Estland), der rechtlich als Verkäufer auftritt (Merchant of Record) und damit Umsatzsteuer, Rechnungen und Rückerstattungen für uns übernimmt. Wir bauen hier nur die Grundlage, noch nicht den Kaufvorgang.

Der Anbieter hat sich von Polar zu Creem geändert, weil EU-Inkorporation eine harte Anforderung ist und Polar eine US-Firma ist. Creem ist EU-nativ (Estland) und übernimmt die EU-Steuer über das OSS-Verfahren. Der Polar-spezifische Code wurde bereits zurückgebaut; die vendor-neutralen Teile (die Idee der Subscription-Tabelle, der dbdump-Scrub) bleiben und werden auf Creem angepasst.

Was gebaut wird: eine validierte Creem-Konfiguration (API-Key, Test- oder Live-Umgebung, Webhook-Secret), ein Creem-SDK-Client, die auf Creem umbenannte Subscription-Tabelle, ein server-seitiger Zugriff auf den Creem-Produktkatalog (Preise plus die Tier-Zuordnung, die aus der Product-Metadata kommt), und ein einmaliges Anlegen unserer Tier-Produkte in Creem. Bei Creem gibt es keine Env-Produktliste mehr: die Zuordnung Tier zu Produkt lebt in der Product-Metadata bei Creem selbst, damit Creem die alleinige Wahrheit bleibt.

Ein wichtiger Unterschied zu Polar: Creems Checkout ist eine gehostete Weiterleitung (kein eingebettetes iframe). Der Kunde bezahlt auf Creems Seite und kommt zurück. Karten- und Bankdaten berühren unsere Server nie; die PCI-Verantwortung bleibt vollständig bei Creem. Der Checkout selbst kommt erst in Plan C, dieser Plan bereitet nur die Datenbasis vor.

Voraussetzung von deiner Seite: ein Creem-Konto mit einem Test-API-Key (`creem_test_...`) und einem Webhook-Secret, eingetragen in `apps/backend/.env.local`. Die alten `POLAR_*`-Variablen können raus.

---

> **Für agentische Worker:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (empfohlen) oder `superpowers:executing-plans`. Steps nutzen Checkbox-Syntax (`- [ ]`), beim Abarbeiten SOFORT im Dokument abhaken. Alle neuen Texte em-dash-frei.

**Goal:** Das Datenmodell- und Config-Fundament für Creem-Billing im Developer-Portal bauen (ohne Checkout, Webhook-Handler oder UI): Creem-Config plus Boot-Guard, Creem-SDK-Client, Umbau der `developer_subscriptions`-Tabelle auf Creem, server-seitiger Creem-Katalog-Fetch mit Tier-Zuordnung aus der Metadata, und das Anlegen der Tier-Produkte in Creem.

**Architecture:** Creem ist die Source of Truth. Die Tier-zu-Produkt-Zuordnung lebt in der Creem-Product-Metadata (`tierId`), nicht in einer Env-Variable, damit ein Prod-Dump keine falschen Produkt-IDs mitbringt und Creem die einzige Quelle bleibt. Bezahl-Preise liegen bei Creem (Katalog-Fetch, server-seitig gecacht). Die Tabelle `developer_subscriptions` trägt nur Creem-Billing-Details; der effektive Tier wird erst in Plan C aus Creem gespiegelt. Test- oder Live-Umgebung ergibt sich aus dem Key-Prefix (`creem_test_`), gespiegelt am bestehenden GitHub-OAuth-Env-Muster.

**Tech Stack:** Fastify plus Drizzle (Postgres) plus `creem` SDK (Backend), Vitest, drizzle-kit, Bash (`scripts/dbdump`).

**Referenz:** Creem-Doku `https://docs.creem.io` (getting-started, api-reference, webhooks, llms-full). Die frühere Polar-Spec ist überholt; die vendor-neutralen Design-Entscheidungen (Flow, Sicherheitsmodell, Free als MoR-Subscription) bleiben gültig.

---

## Verifizierte Fakten (2026-07-09, per Doku/SDK-Inspektion)

- **SDK:** `creem@^1.5.3` installiert (Polar-SDK entfernt, `cdca9655`). Exports u.a. `Creem`, `ServerTest`, `ServerProd`, `serverURLFromOptions`. Auth per Header `x-api-key`. Test-Base `https://test-api.creem.io/v1`, Live-Base `https://api.creem.io/v1`. Test vs Live ergibt sich aus dem Key-Prefix `creem_test_`.
- **Free-Tier:** Creem unterstützt Free-Produkte (0-Preis) und Free-Subscriptions per API ohne Checkout (`POST /v1/subscriptions`).
- **Products:** ein Produkt pro Intervall (month und year sind zwei Produkte). Billing-Perioden `every-month`, `every-three-months`, `every-six-months`, `every-year`. Metadata am Produkt (unsere `tierId` plus Limits/Flags).
- **Subscription-Status (Creem):** `active`, `trialing`, `paused`, `past_due`, `expired`, `canceled`, `scheduled_cancel`.
- **Entitlements:** webhook-getrieben (`checkout.completed`, `subscription.paid`, `subscription.active/canceled/expired`) plus abrufbar (`GET /v1/subscriptions/{id}`, `GET /v1/customers/{id}/subscriptions`). Webhook-Signatur per HMAC-SHA256 (timing-safe), Secret aus Env. Idempotenz per Upsert.
- **Verknüpfung:** Metadata (unsere Account-ID) plus `request_id` an der Checkout-/Subscription-Erstellung.
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
- `apps/backend/src/db/schemas/postgres.ts` (modify): `developerSubscriptions` auf Creem umbenennen (Spalten, Index, Status-Constraint).
- `apps/backend/src/db/migrations/postgres/0069_*.sql` plus Journal: via `db:generate`.
- `apps/backend/src/services/creem-client.ts` (neu): `getCreemClient()` (Singleton, Test/Live-Server aus der Config).
- `apps/backend/src/services/creem-catalog.ts` (neu): `getCreemCatalog()` (Produkte listen, Tier-Zuordnung aus Metadata ableiten, Preise, In-memory-Cache mit TTL).
- `scripts/creem-seed.mjs` (neu, gitignored lokaler Helper wie dbdump): legt die Tier-Produkte in Creem an (Metadata `tierId` plus Limits).

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

- [ ] **Step 1: Schema anpassen** an `developerSubscriptions`: `polarSubscriptionId` zu `creemSubscriptionId` (Spalte `creem_subscription_id`), `polarCustomerId` zu `creemCustomerId` (`creem_customer_id`), Index `uq_developer_subscriptions_polar_id` zu `uq_developer_subscriptions_creem_id`. Status-Check-Constraint auf Creems Werte: ``sql`${table.status} IN ('active', 'trialing', 'paused', 'past_due', 'expired', 'canceled', 'scheduled_cancel')` ``. Den TSDoc-Kommentar von Polar auf Creem umschreiben (keine Em-Dashes, kein Polar mehr). `interval` bleibt `month`/`year` (unsere normalisierte Form; Creems `every-month` wird in Plan C darauf gemappt).
- [ ] **Step 2: Migration generieren**: `pnpm db:generate`. Erwartet `0069_*.sql` mit Spalten-Rename plus Constraint-Wechsel. Generiertes SQL sichten: es soll nur `developer_subscriptions` betreffen. Falls drizzle-kit einen Rename als drop-and-add auflöst, ist das hier unkritisch (Tabelle ist leer), aber im SQL prüfen.
- [ ] **Step 3: Anwenden**: `pnpm db:migrate` gegen die lokale DB (Port 5433). Kein Fehler.
- [ ] **Step 4: Verify**: `psql "$LOCAL_DB_URL" -c "\d developer_subscriptions"` zeigt `creem_subscription_id`, `creem_customer_id`, den umbenannten Index und die neue Status-Constraint.
- [ ] **Step 5: Commit**: `Feat: retarget developer_subscriptions at Creem (MC-110)`.

## Task 5: Creem-SDK-Client (`creem-client.ts`)

**Files:** Create `apps/backend/src/services/creem-client.ts`, Test `apps/backend/src/services/creem-client.test.ts`

- [ ] **Step 1: Failing test**: `getCreemClient()` (mit gemocktem `getCreemConfig` auf `{ apiKey: "creem_test_x", mode: "test", webhookSecret: undefined }`) liefert eine Instanz und beim zweiten Aufruf dieselbe (Singleton). `creem` mit `vi.mock` stubben.
- [ ] **Step 2: Fails**: `pnpm --filter @musiccloud/backend test:run creem-client` FAIL.
- [ ] **Step 3a: SDK-Shape verifizieren**: den exakten Konstruktor gegen `creem@1.5.3` prüfen (Option `serverURL` vs `serverIdx`, wie der `x-api-key` gesetzt wird: Konstruktor-Security vs pro Call). Nichts erfinden.
- [ ] **Step 3: Implementieren.** Erwartete Form (an die verifizierte SDK-Signatur anpassen):
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
  const { mode } = getCreemConfig();
  instance = new Creem({ serverURL: mode === "test" ? ServerTest : ServerProd });
  return instance;
}
```
- [ ] **Step 4: Grün** PASS.
- [ ] **Step 5: Commit**: `Feat: add Creem SDK client factory (MC-110)`.

## Task 6: Creem-Katalog-Fetch mit Tier-Zuordnung aus Metadata

**Files:** Create `apps/backend/src/services/creem-catalog.ts`, Test `apps/backend/src/services/creem-catalog.test.ts`

Zweck: Bezahl-Preise und die Tier-Zuordnung sind bei Creem. Diese Funktion listet die Creem-Produkte, filtert die mit unserer `tierId`-Metadata und baut die Zuordnung `tierId -> { interval -> { productId, price, currency } }`, server-seitig, mit kurzem In-memory-Cache (TTL). Kein Env-Produkt-Mapping mehr.

- [ ] **Step 1: Failing test**: `getCreemCatalog()` mit gemocktem Client, dessen Produkt-Liste ein Produkt mit `metadata.tierId` plus `metadata.interval` und einem Preis liefert. Erwartung: Map `tierId -> { interval -> { productId, price, currency } }`; zweiter Aufruf innerhalb der TTL trifft den Client nicht (Cache-Hit); nach abgelaufener TTL erneuter Fetch. Produkte ohne unsere `tierId`-Metadata werden ignoriert.
- [ ] **Step 2: Fails**: `pnpm --filter @musiccloud/backend test:run creem-catalog` FAIL.
- [ ] **Step 3a: SDK-Shape verifizieren**: die reale List-Products-Methode und die Feldpfade (Produkt-ID, Preis, Währung, `metadata`) gegen `creem@1.5.3` prüfen.
- [ ] **Step 3: Implementieren.** Iteriert über die Produkt-Liste, filtert nach `metadata.tierId`, baut die Map, cached mit Modul-Timestamp plus `CATALOG_TTL_MS` (z.B. `5 * 60_000`). TSDoc: warum SoT bei Creem, warum Cache.
- [ ] **Step 4: Grün** PASS.
- [ ] **Step 5: Commit**: `Feat: fetch and cache the Creem product catalog (MC-110)`.

## Task 7: Tier-Produkte in Creem anlegen (`scripts/creem-seed.mjs`)

**Files:** Create `scripts/creem-seed.mjs` (gitignored lokaler Helper, wie `scripts/dbdump`)

Zweck: Die vier Tiers als Creem-Produkte anlegen, mit `tierId`, Preisen und Limits/Flags in der Metadata. Werte aus der Monetization-Spec (Demo frei; Club 9/90, Arena 29/290, Stadium 149/1490 Euro; je month und year; Demo nur ein Free-Produkt). Idempotent: vor dem Anlegen die vorhandenen Produkte listen und per `metadata.tierId` plus `interval` Duplikate überspringen.

- [ ] **Step 1: Creem-Produkt-Create-Payload verifizieren** gegen `docs.creem.io/api-reference` (Feldnamen für Name, Preis in Cent, Währung, `billing_period` `every-month`/`every-year`, Free-Preis, `metadata`). Nichts erfinden.
- [ ] **Step 2: Skript schreiben**: liest `CREEM_API_KEY` aus `apps/backend/.env.local`, Base aus dem Key-Prefix (`test-api.creem.io` vs `api.creem.io`), listet Produkte, legt fehlende an (Metadata: `tierId`, `tierName`, `interval`, `requestsPerMinute`, `requestsPerDay`, `commercialUse`, `attributionRequired`, `maxKeys`, `support`), gibt die angelegten Produkt-IDs plus die abgeleitete Zuordnung aus. `scripts/creem-seed.mjs` in `.gitignore` aufnehmen (analog `scripts/dbdump`).
- [ ] **Step 3: Ausführen** (mit gesetztem Test-Key): Produkte werden in der Creem-Test-Umgebung angelegt; `getCreemCatalog()` findet danach alle vier Tiers.
- [ ] **Step 4: Verify**: die Produkte erscheinen im Creem-Dashboard und im Katalog-Fetch mit korrekter `tierId`-Metadata.
- [ ] **Step 5: Commit**: kein Code-Commit nötig (Skript ist gitignored); nur die `.gitignore`-Zeile committen: `Chore: gitignore the local creem-seed helper (MC-110)`.

## Task 8: dbdump-Scrub

- [x] **Bereits umgesetzt**: `scripts/dbdump` leert `developer_subscriptions` nach dem Restore (table-existence-guarded). Vendor-neutral, keine Änderung nötig.

## Task 9: Gesamt-Gates

- [ ] **Step 1: Backend-Gates**: `pnpm --filter @musiccloud/backend test:run` grün; Backend-Typecheck grün.
- [ ] **Step 2: Lint**: Biome sauber auf allen berührten `.ts`; keine Em-Dashes.
- [ ] **Step 3: Clean-State-Migration**: aus sauberem Stand (`pnpm db:migrate`) laufen alle Migrationen inkl. `0069` ohne Fehler.
- [ ] **Step 4: Alle Refs verifiziert**; `plans check` grün.

---

## Self-Review (nach Fertigstellung auszufüllen)

- [ ] **Abdeckung**: Creem-Config plus Boot-Guard, Tabellen-Umbau, SDK-Client, Katalog-Fetch mit Metadata-Zuordnung, Produkt-Seed je einem Task zugeordnet.
- [ ] **Placeholder-Scan**: die bewussten Laufzeit-Verifikationen sind die SDK-Shape-Checks (Task 5 Step 3a, Task 6 Step 3a, Task 7 Step 1), dokumentiert, nicht erfunden.
- [ ] **Typ-Konsistenz**: `CreemConfig`, `getCreemConfig`, `getCreemClient`, `getCreemCatalog`, `developerSubscriptions`/`creemSubscriptionId` über alle Tasks identisch.

## Abgrenzung (bewusst NICHT in Plan B)

- Kein Checkout (gehosteter Creem-Redirect), kein Webhook-Handler, kein Schreiben von `account.tierId` oder `developer_subscriptions` (Plan C).
- Keine Subscription-Management-UI (Plan D).
- Kein Master-Schalter, keine Kaufbarkeits-Regel, keine Coming-soon-Darstellung (Plan E).
- Kein Usage-Metering (Creem-Credits) fuer Per-Request-Abrechnung (spätere Phase).
