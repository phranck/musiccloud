# Polar-Fundament (Developer-Subscription): Implementierungsplan

Plan-Nr.: MC-110

## TLDR

Dieser Plan legt das Fundament dafür, dass das Developer-Portal später kostenpflichtige Abos verkaufen kann. Abgerechnet wird über Polar, einen Zahlungsdienst, der rechtlich selbst als Verkäufer auftritt (Merchant of Record) und damit Umsatzsteuer, Rechnungen und Rückerstattungen für uns übernimmt. Wir bauen hier bewusst nur die Grundlage, noch nicht den eigentlichen Kaufvorgang.

Fundament heißt konkret: die Datenstrukturen und die Konfiguration, auf denen alles Bezahlte aufsetzt. In diesem Plan gibt es noch keinen Checkout, keinen Zahlungs-Webhook und keine Bedienoberfläche. Diese Teile kommen in den Folgeplänen C, D und E. Plan B bleibt absichtlich klein und in sich abgeschlossen, damit jeder Baustein einzeln testbar ist.

Was gebaut wird: eine Zuordnung, welcher unserer Tarife zu welchem Polar-Produkt gehört. Diese Zuordnung lebt in der Umgebungs-Konfiguration und nicht in der Datenbank, damit ein Produktions-Datenbank-Abzug lokal keine falschen Produkt-IDs mitbringt. Dazu kommen eine neue Datenbank-Tabelle für die Abo-Details eines Kunden, eine konfigurierte Verbindung zu Polar, die zwischen einer Test-Umgebung (Sandbox) und der echten Produktion umschaltbar ist, eine Prüfung der Polar-Zugangsdaten beim Start (damit eine Fehlkonfiguration laut auffällt statt still zu brechen), ein zwischengespeicherter Abruf des Polar-Preiskatalogs (die Preise sind die alleinige Wahrheit bei Polar, nicht bei uns), und ein Sicherheits-Schritt im Datenbank-Abzug-Skript, der echte Abrechnungsdaten löscht, wenn Produktionsdaten lokal eingespielt werden.

Warum es so geschnitten ist: Es ist die Verrohrung, auf der später der ganze Bezahlvorgang sitzt. Das Design sorgt dafür, dass Billing später nur ein Konfigurations-Schalter ist und dass vor dem gewollten Start kein echter Zahlvorgang aus Versehen passieren kann. Die Preise bleiben die alleinige Wahrheit bei Polar; unsere Tier-Tabelle behält nur Name, Limits und Flags.

Voraussetzung von deiner Seite: Bevor dieser Plan sinnvoll getestet werden kann, brauchst du ein Polar-Sandbox-Konto und die dazugehörigen Zugangsdaten in der lokalen Umgebung. Ohne diese Sandbox lassen sich die Polar-nahen Schritte (SDK-Client und Katalog-Abruf) nicht real prüfen.

---

> **Für agentische Worker:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (empfohlen) oder `superpowers:executing-plans`, um diesen Plan Task für Task umzusetzen. Steps nutzen Checkbox-Syntax (`- [ ]`). Beim Abarbeiten SOFORT im Dokument abhaken (Plan ist die Referenz für den Stand, keine Batch-Nachträge). Alle neuen Texte em-dash-frei.

**Goal:** Das Datenmodell- und Config-Fundament für Polar-Billing im Developer-Portal bauen (ohne Checkout, Webhook oder UI): Env-Product-Mapping, `developer_subscriptions`-Tabelle, Polar-SDK-Client, `POLAR_*`-Config plus Boot-Guard, server-seitiger Polar-Katalog-Fetch, und ein `dbdump`-Scrub für echte Billing-Daten.

**Architecture:** Alles config- und datengetrieben, keine Code-Verzweigung zwischen Sandbox und Prod. Das Tier→Polar-Product-Mapping lebt in Env (`POLAR_PRODUCTS` als JSON), nicht in der DB. So bringt ein Prod-Dump keine falschen Product-IDs nach lokal. Bezahl-Preise sind SSOT bei Polar (Katalog-Fetch, server-seitig gecacht), nicht in `tiers`. Die neue Tabelle `developer_subscriptions` trägt nur Polar-Billing-Details; `account.tierId` bleibt der effektive Tier und wird erst in Plan C vom Webhook geschrieben. Der SDK-Client wird per `POLAR_SERVER` auf Sandbox oder Prod gestellt, gespiegelt am bestehenden GitHub-OAuth-Env-Muster.

**Tech Stack:** Fastify plus Drizzle (Postgres) plus `@polar-sh/sdk` (Backend), Vitest (Tests), drizzle-kit (Schema-Migration), Bash (`scripts/dbdump`).

**Referenz-Spec:** `docs/superpowers/specs/2026-07-08-signup-flow-polar-billing-design.md`, Sektion 3 (Polar-Mechanik/Datenmodell) plus Sektion 6 (Plan-Split, Plan B). Reconciliation: Diese (2026-07-08) Spec schlägt die ältere `2026-07-04-developer-api-monetization-design.md`. Preise sind SSOT bei Polar, nicht in `tiers` oder einer Code-Konstante; das Tier→Product-Mapping liegt in Env, nicht in der DB.

---

## Verifizierte Fakten (2026-07-08, per grep/Read)

- **Migrationen:** letzte ist `0067_backfill_accounts_tier_free.sql` (MC-109). Die neue Tabelle wird `0068` und via `pnpm db:generate` (`drizzle-kit generate --config=drizzle.config.postgres.ts`, root `package.json`) aus dem Schema-Diff erzeugt, also kein hand-geschriebenes SQL (das war nur Plan As reine Daten-Migration). Anwenden: `pnpm db:migrate` (= `node scripts/migrate.mjs`) oder Backend-Boot. drizzle-kit `^0.31.10`.
- **Schema-Datei:** `apps/backend/src/db/schemas/postgres.ts`. Stil (verifiziert an `developerAccounts` `:1558-1574`): `pgTable("name", { … }, (table) => [uniqueIndex(...), check(...)])`; Spalten `text("col")`, `timestamp("col", { withTimezone: true })`, FK `text("x_id").references(() => other.id, { onDelete: "…" })`, `.notNull()`, `.defaultNow()`, `.unique()`; Typ-Exports `typeof x.$inferSelect` und `$inferInsert`. `tiers` (`:1786`) und `developerAccounts` (`:1558`) mit `id: text("id").primaryKey()`.
- **Env:** `apps/backend/src/lib/env.ts` bietet `requireEnv(name)` (throws bei fehlend/leer) plus `requireEnvList(name)`. `apps/backend/src/lib/boot-env.ts` hat `REQUIRED_BOOT_ENV`-Array plus `assertRequiredBootEnv()` (loopt, `requireEnv` je Var). Config-Sammelstelle: `apps/backend/src/lib/config.ts`.
- **Env-Muster (Vorbild):** `GITHUB_OAUTH_CLIENT_ID`/`GITHUB_OAUTH_CLIENT_SECRET` via `requireEnv` in `apps/backend/src/services/developer-github.ts:79,100,101`. Secrets in `apps/backend/.env.local` (gitignored) vs Zerops-Prod.
- **`@polar-sh/sdk`:** NICHT installiert (grep über alle package.json). Muss als Backend-Dependency ergänzt werden. Den `pnpm add`-Befehl führt der User aus (Install-Regel); der Plan liefert nur den Befehl.
- **DB-Adapter:** ein Adapter `apps/backend/src/db/adapters/postgres.ts` (`PostgresAdapter`), gewählt in `apps/backend/src/db/index.ts:2`. Repos: `TrackRepository`, `AdminRepository`, `ApiAccessRepository`, `DeveloperRepository`, `CcRepository`, `TierRepository`. Neue Subscription-Schreib-Methoden gehören erst zu Plan C (Webhook); Plan B legt nur Tabelle plus Typen an.
- **`scripts/dbdump`** (Bash, ausführbar, ~250 Z.): Sektion „7. pg_restore" ab Z.209, Sektion „8. Verify + Cleanup" ab Z.241. Scrub-Insert-Punkt: nach erfolgreichem `pg_restore` (nach Z.238), vor Sektion 8.

**Verifikations-Checkliste:**
- [ ] Alle Code-Referenzen vor Task-Start re-verifiziert (Migrationsnummer via `ls` der postgres-migrations, `env.ts`/`boot-env.ts`/`config.ts`-Pfade, Schema-Stil, `dbdump`-Sektionsgrenzen, `@polar-sh/sdk`-Version).

## Manuelle Voraussetzung (Phase 0, User-Aufgabe, NICHT Plan-Code)

- Bei sandbox.polar.sh registrieren, Organisation anlegen, Organization Access Token erzeugen.
- Pro Bezahl-Tier zwei Sandbox-Products (monatlich und jährlich), Product-IDs kopieren.
- In `apps/backend/.env.local` setzen: `POLAR_SERVER=sandbox`, `POLAR_ACCESS_TOKEN=<sandbox-token>`, `POLAR_WEBHOOK_SECRET=<sandbox-signing-secret>` (Secret erst in Plan C zwingend, hier optional), `POLAR_PRODUCTS=<JSON, siehe Task 2>`.

## Dateistruktur

- `apps/backend/package.json`: `@polar-sh/sdk`-Dependency (User-Install).
- `apps/backend/src/lib/polar-config.ts` (neu): liest und validiert `POLAR_SERVER`, `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, `POLAR_PRODUCTS`; exportiert typisierte `PolarConfig` plus `getPolarConfig()` (throw bei Inkonsistenz).
- `apps/backend/src/lib/boot-env.ts` (modify): Polar-Konsistenz-Guard, nur wenn `POLAR_ACCESS_TOKEN` gesetzt ist.
- `apps/backend/src/db/schemas/postgres.ts` (modify): Tabelle `developerSubscriptions` plus Typ-Exports.
- `apps/backend/src/db/migrations/postgres/0068_*.sql` plus `meta/_journal.json`: generiert via `db:generate`.
- `apps/backend/src/services/polar-client.ts` (neu): `getPolarClient()` (Singleton `new Polar({ accessToken, server })`).
- `apps/backend/src/services/polar-catalog.ts` (neu): `getPolarCatalog()` (Produkt-Preise plus Währungen je gemapptem Product, in-memory-Cache mit TTL).
- `scripts/dbdump` (modify): Scrub-Schritt (`developer_subscriptions` leeren, `to_regclass`-guarded).

**Tests:**
- `apps/backend/src/lib/polar-config.test.ts` (neu).
- `apps/backend/src/services/polar-client.test.ts` (neu).
- `apps/backend/src/services/polar-catalog.test.ts` (neu).

---

## Task 1: `@polar-sh/sdk`-Dependency ergänzen (User-Install)

**Files:** Modify `apps/backend/package.json`

- [ ] **Step 1: Dependency hinzufügen (USER führt aus, Install-Regel).**

Befehl an den User weitergeben, nicht selbst ausführen:
```bash
pnpm --filter @musiccloud/backend add @polar-sh/sdk
```
- [ ] **Step 2: Verify**: `grep '@polar-sh/sdk' apps/backend/package.json` zeigt einen Eintrag; `pnpm --filter @musiccloud/backend exec node -e "require('@polar-sh/sdk')"` wirft nicht.
- [ ] **Step 3: Commit**: `Chore: add @polar-sh/sdk backend dependency (MC-110)`.

## Task 2: Polar-Config lesen plus validieren (`polar-config.ts`)

**Files:**
- Create: `apps/backend/src/lib/polar-config.ts`
- Test: `apps/backend/src/lib/polar-config.test.ts`

Zweck: Eine typisierte, an einer Stelle validierte Sicht auf die Polar-Env. `POLAR_PRODUCTS` ist ein JSON-String der Form `{ "<tierId>": { "month": "<polarProductId>", "year": "<polarProductId>" } }` (Free hat keinen Eintrag). Fehlerhaftes JSON oder falscher `POLAR_SERVER` führt zu throw (fail-fast), nie zu stillem Fallback.

- [x] **Step 1: Failing test**: `polar-config.test.ts`: `getPolarConfig()` mit gesetzten `POLAR_SERVER=sandbox`, `POLAR_ACCESS_TOKEN=tok`, `POLAR_PRODUCTS='{"tier_club":{"month":"prod_m","year":"prod_y"}}'` (via `vi.stubEnv`) liefert `{ server: "sandbox", accessToken: "tok", products: { tier_club: { month: "prod_m", year: "prod_y" } }, webhookSecret: undefined }`. Fehlerfälle: `POLAR_SERVER=foo` throwt; `POLAR_PRODUCTS='{invalid'` throwt; Product-Eintrag ohne `month` throwt.
- [x] **Step 2: Fails**: `pnpm --filter @musiccloud/backend test:run polar-config` FAIL (Modul fehlt).
- [x] **Step 3: Implementieren.**
```ts
import { requireEnv } from "./env.js";

/** Ein Tier→Polar-Product-Mapping-Eintrag: je ein Polar-Product pro Abrechnungsintervall. */
export interface PolarProductPair {
  month: string;
  year: string;
}

/** Validierte Polar-Laufzeit-Config, an einer Stelle gelesen (fail-fast bei Fehlkonfiguration). */
export interface PolarConfig {
  server: "sandbox" | "production";
  accessToken: string;
  webhookSecret: string | undefined;
  /** tierId auf { month, year } Polar-Product-IDs. Der Free-Tier hat keinen Eintrag. */
  products: Record<string, PolarProductPair>;
}

function parseProducts(raw: string): Record<string, PolarProductPair> {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    throw new Error("POLAR_PRODUCTS is not valid JSON.");
  }
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    throw new Error("POLAR_PRODUCTS must be a JSON object of tierId to { month, year }.");
  }
  const out: Record<string, PolarProductPair> = {};
  for (const [tierId, pair] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof pair !== "object" || pair === null) {
      throw new Error(`POLAR_PRODUCTS["${tierId}"] must be an object with month and year.`);
    }
    const { month, year } = pair as Record<string, unknown>;
    if (typeof month !== "string" || !month || typeof year !== "string" || !year) {
      throw new Error(`POLAR_PRODUCTS["${tierId}"] needs non-empty string "month" and "year".`);
    }
    out[tierId] = { month, year };
  }
  return out;
}

/**
 * Reads and validates the Polar runtime config from the environment. Throws on
 * any inconsistency (unknown server, malformed product map) so misconfiguration
 * fails fast instead of silently disabling billing at request time.
 */
export function getPolarConfig(): PolarConfig {
  const server = requireEnv("POLAR_SERVER");
  if (server !== "sandbox" && server !== "production") {
    throw new Error(`POLAR_SERVER must be "sandbox" or "production", got "${server}".`);
  }
  return {
    server,
    accessToken: requireEnv("POLAR_ACCESS_TOKEN"),
    webhookSecret: process.env.POLAR_WEBHOOK_SECRET || undefined,
    products: parseProducts(requireEnv("POLAR_PRODUCTS")),
  };
}
```
- [x] **Step 4: Grün**: `pnpm --filter @musiccloud/backend test:run polar-config` PASS.
- [x] **Step 5: Commit**: `Feat: read and validate Polar env config (MC-110)`.

## Task 3: Boot-Guard für Polar-Konsistenz (`boot-env.ts`)

**Files:** Modify `apps/backend/src/lib/boot-env.ts`

Zweck: Wenn `POLAR_ACCESS_TOKEN` gesetzt ist (dev und prod verdrahten Polar von Anfang an), muss die restliche Polar-Config konsistent sein, also beim Boot prüfen (fail-fast, loud restart loop). Ist `POLAR_ACCESS_TOKEN` nicht gesetzt (z.B. CI/Tests ohne Polar), bleibt der Guard inert.

- [ ] **Step 1: Implementieren.** In `assertRequiredBootEnv()` nach der bestehenden Schleife ergänzen:
```ts
import { getPolarConfig } from "./polar-config.js";
// … innerhalb assertRequiredBootEnv(), nach der REQUIRED_BOOT_ENV-Schleife:
if (process.env.POLAR_ACCESS_TOKEN) {
  // Wirft bei falschem POLAR_SERVER oder kaputtem POLAR_PRODUCTS.
  getPolarConfig();
}
```
TSDoc am Aufruf: warum nur bei gesetztem Token (Polar ist in der Foundation-Phase optional bootbar, aber wenn verdrahtet, dann konsistent).
- [ ] **Step 2: Manuell verifizieren**: Backend lokal mit gültiger Polar-Env bootet; mit `POLAR_SERVER=foo` bricht der Boot mit klarer Meldung ab (`./app restart` plus Log prüfen).
- [ ] **Step 3: Commit**: `Feat: boot-guard validates Polar config when wired (MC-110)`.

## Task 4: Tabelle `developer_subscriptions` plus Migration 0068

**Files:**
- Modify: `apps/backend/src/db/schemas/postgres.ts`
- Generated: `apps/backend/src/db/migrations/postgres/0068_*.sql` plus `meta/_journal.json`

- [ ] **Step 1: Schema ergänzen** (nach den developer-Tabellen, Stil wie `developerAccounts`):
```ts
/**
 * Polar billing detail per paid subscription. Kept separate from
 * developer_accounts (SRP): account.tierId stays the effective tier for
 * enforcement, this table only mirrors Polar's billing state. Free accounts
 * have no row here. Written by the Polar webhook (Plan C), read by the
 * subscription-management UI (Plan D). polarSubscriptionId is unique so the
 * idempotent webhook can upsert by it.
 */
export const developerSubscriptions = pgTable(
  "developer_subscriptions",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => developerAccounts.id, { onDelete: "cascade" }),
    tierId: text("tier_id")
      .notNull()
      .references(() => tiers.id, { onDelete: "restrict" }),
    polarSubscriptionId: text("polar_subscription_id").notNull().unique(),
    polarCustomerId: text("polar_customer_id").notNull(),
    status: text("status").notNull(),
    interval: text("interval").notNull(),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_developer_subscriptions_polar_id").on(table.polarSubscriptionId),
    check(
      "chk_developer_subscriptions_status",
      sql`${table.status} IN ('active', 'canceled', 'past_due', 'revoked', 'incomplete')`,
    ),
    check("chk_developer_subscriptions_interval", sql`${table.interval} IN ('month', 'year')`),
  ],
);

export type DeveloperSubscriptionRow = typeof developerSubscriptions.$inferSelect;
export type DeveloperSubscriptionInsert = typeof developerSubscriptions.$inferInsert;
```
Sicherstellen, dass `boolean` aus `drizzle-orm/pg-core` importiert ist; falls nicht, Import ergänzen.
- [ ] **Step 2: Migration generieren**: `pnpm db:generate`. Erwartet: neue `0068_*.sql` mit `CREATE TABLE "developer_subscriptions"` plus Journal-Eintrag idx 68. Generiertes SQL sichten (FKs, Unique-Index, Checks vorhanden).
- [ ] **Step 3: Anwenden**: `pnpm db:migrate` (lokaler Postgres, Port 5433). Kein Fehler.
- [ ] **Step 4: Verify**: `psql "$LOCAL_DB_URL" -c "\d developer_subscriptions"` zeigt die Tabelle plus Constraints; Migrations-Tail in `drizzle.__drizzle_migrations` enthält 0068.
- [ ] **Step 5: Commit**: `Feat: add developer_subscriptions table (Polar billing detail) (MC-110)`.

## Task 5: Polar-SDK-Client-Factory (`polar-client.ts`)

**Files:**
- Create: `apps/backend/src/services/polar-client.ts`
- Test: `apps/backend/src/services/polar-client.test.ts`

- [ ] **Step 1: Failing test**: `polar-client.test.ts`: `getPolarClient()` (mit gemockter `getPolarConfig` via `vi.mock("../lib/polar-config.js")` auf `{ server: "sandbox", accessToken: "tok", products: {}, webhookSecret: undefined }`) liefert eine Instanz, und ein zweiter Aufruf liefert dieselbe Instanz (Singleton). `@polar-sh/sdk` mit `vi.mock` stubben, sodass der `Polar`-Ctor mit `{ accessToken: "tok", server: "sandbox" }` aufgerufen wird.
- [ ] **Step 2: Fails**: `pnpm --filter @musiccloud/backend test:run polar-client` FAIL.
- [ ] **Step 3: Implementieren.**
```ts
import { Polar } from "@polar-sh/sdk";
import { getPolarConfig } from "../lib/polar-config.js";

let instance: Polar | null = null;

/**
 * Returns the singleton Polar SDK client, configured from the validated env
 * (getPolarConfig). server selects the sandbox vs production Polar backend;
 * the account token is env-specific, so there is one dev-Polar and one
 * prod-Polar, never a shared client.
 */
export function getPolarClient(): Polar {
  if (instance) return instance;
  const { accessToken, server } = getPolarConfig();
  instance = new Polar({ accessToken, server });
  return instance;
}
```
- [ ] **Step 4: Grün**: Test PASS.
- [ ] **Step 5: Commit**: `Feat: add Polar SDK client factory (MC-110)`.

## Task 6: Polar-Katalog-Fetch (Preise plus Währungen, gecacht)

**Files:**
- Create: `apps/backend/src/services/polar-catalog.ts`
- Test: `apps/backend/src/services/polar-catalog.test.ts`

Zweck: Bezahl-Preise sind SSOT bei Polar. Diese Funktion holt für jeden gemappten Product die Preise plus verfügbaren Währungen, server-seitig, mit kurzem In-Memory-Cache (TTL, damit die Pricing-Seite Polar nicht bei jedem Request trifft). Nur Fetch, Shape und Cache. Die geo-basierte Währungswahl ist Plan E.

- [ ] **Step 1: Failing test**: `polar-catalog.test.ts`: `getPolarCatalog()` mit gemocktem Client (`getPolarClient` via `vi.mock` auf ein Objekt mit `products.get`/`products.list`, das ein Product mit Preisen liefert) und gemocktem `getPolarConfig` (products-Map mit einem Tier). Erwartung: liefert eine Map `productId` auf `{ prices: [{ currency, amount }] }`; ein zweiter Aufruf innerhalb der TTL ruft den Client nicht erneut (Cache-Hit; Aufrufzähler prüfen); nach abgelaufener TTL (Zeit via `vi.useFakeTimers` oder injizierbarem `now`) erneuter Fetch.
- [ ] **Step 2: Fails**: `pnpm --filter @musiccloud/backend test:run polar-catalog` FAIL.
- [ ] **Step 3: Implementieren.** Funktion iteriert über `getPolarConfig().products`, ruft den Client je Product-ID, extrahiert `{ currency, amount }`-Paare, cached das Ergebnis mit einem Modul-Level-Timestamp plus `CATALOG_TTL_MS` (Konstante, z.B. `5 * 60_000`). Die exakte SDK-Methode und die Feldnamen (`products.get(id)` vs `products.list`, Preis-Feldpfad) beim Implementieren gegen die installierte `@polar-sh/sdk`-Version verifizieren (Step 3a). TSDoc: SSOT-Begründung plus warum Cache (Rate und Latenz der Pricing-Seite).
- [ ] **Step 3a: SDK-Shape verifizieren**: vor dem finalen Impl die reale Methoden- und Feldstruktur der installierten SDK prüfen (Typen in `node_modules/@polar-sh/sdk`), damit keine erfundenen Feldnamen im Code landen.
- [ ] **Step 4: Grün**: Test PASS.
- [ ] **Step 5: Commit**: `Feat: fetch and cache the Polar product catalog (MC-110)`.

## Task 7: `scripts/dbdump`, Scrub der Billing-Daten nach Restore

**Files:** Modify `scripts/dbdump` (nach `pg_restore`-Erfolg ~Z.238, vor Sektion 8 ab Z.241)

Zweck: Ein Prod-Dump enthält echte `developer_subscriptions` (Kunden- und Billing-Daten). Nach dem lokalen Restore werden diese Zeilen geleert, table-existence-guarded, damit ältere Dumps ohne die Tabelle nicht brechen.

- [ ] **Step 1: Implementieren.** Nach dem erfolgreichen `pg_restore`-Block einfügen:
```bash
# ─── 7b. Scrub: echte Billing-Daten aus dem Prod-Dump lokal leeren ──────────
log "Scrub: developer_subscriptions leeren (echte Kunden- und Billing-Daten)"
"$PSQL" "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -c \
  "DO \$\$ BEGIN IF to_regclass('public.developer_subscriptions') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE public.developer_subscriptions'; END IF; END \$\$;" \
  || die "Scrub von developer_subscriptions fehlgeschlagen."
```
`$PSQL` und `$LOCAL_DB_URL` sind die im Skript bereits definierten Variablen. Beim Umsetzen die exakten Namen gegen den Skript-Kopf prüfen; `PG_RESTORE` ist z.B. bei `:94` definiert, das analoge `PSQL` bzw. die Connection-Var übernehmen.
- [ ] **Step 2: Verify**: `./scripts/dbdump` lokal laufen lassen (VPN nötig); nach Abschluss `psql "$LOCAL_DB_URL" -c "SELECT count(*) FROM developer_subscriptions;"` ergibt 0. Mit einem alten Dump ohne die Tabelle bricht der Scrub nicht ab (Guard greift).
- [ ] **Step 3: Commit**: `Feat: scrub developer_subscriptions on local db restore (MC-110)`.

## Task 8: Gesamt-Gates

- [ ] **Step 1: Backend-Gates**: `pnpm --filter @musiccloud/backend test:run` grün; Backend-Typecheck grün.
- [ ] **Step 2: Lint**: Biome sauber auf allen berührten `.ts` (`pnpm doctor:diff` bzw. projektüblich); keine Em-Dashes in neuem Text oder Kommentaren.
- [ ] **Step 3: Clean-State-Migration**: aus sauberem Stand (`pnpm db:migrate`) läuft 0068 ohne Fehler; `developer_subscriptions` existiert.
- [ ] **Step 4: Alle Refs verifiziert**: Verifikations-Checkliste oben abhaken; `plans check` grün.

---

## Self-Review (nach Fertigstellung auszufüllen)

- [ ] **Spec-Abdeckung:** Sektion-6-Plan-B-Punkte (Env-Product-Map, `developer_subscriptions`, SDK-Client, `POLAR_*`-Config plus Boot-Guard, Katalog-Fetch, `dbdump`-Scrub) je einem Task zugeordnet?
- [ ] **Placeholder-Scan:** keine „TBD/TODO" ohne Inhalt; die einzige bewusste Laufzeit-Verifikation ist die SDK-Shape in Task 6 Step 3a (dokumentiert, nicht erfunden).
- [ ] **Typ-Konsistenz:** `PolarConfig`/`PolarProductPair`, `getPolarConfig`, `getPolarClient`, `getPolarCatalog`, `developerSubscriptions`/`DeveloperSubscriptionRow` über alle Tasks identisch benannt.

## Abgrenzung (bewusst NICHT in Plan B)

- Kein Checkout, kein Webhook-Handler, kein Schreiben von `account.tierId` oder `developer_subscriptions` (Plan C).
- Keine Subscription-Management-UI (Plan D).
- Kein Master-Schalter `billingActive`, keine `istKaufbar`-Regel, keine „Coming soon"-Darstellung, keine geo-basierte Währungswahl (Plan E).
- Keine Subscription-Repository-Schreibmethoden (kommen mit dem Webhook in Plan C); Plan B liefert nur Tabelle, Typen und den Katalog-Lesepfad.
