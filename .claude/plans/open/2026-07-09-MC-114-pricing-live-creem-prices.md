# Pricing-Seite mit Live-Creem-Preisen: Implementierungsplan

Plan-Nr.: MC-114

## TLDR

Die Developer-Pricing-Seite zeigt heute die Preise aus unserer `tiers`-Tabelle. Dieser Plan reichert die bestehende `/api/v1/tiers`-Antwort server-seitig mit den Live-Preisen aus Creem an: wo ein Tier ein Creem-Produkt-Mapping hat, wird der angezeigte Preis durch Creems aktuellen Wert ersetzt. Alles andere (Name, Beschreibung, Farbe, Icon, Button-Label, Empfehlung) bleibt bei unserer Source of Truth, der `tiers`-Tabelle. Faellt Creem aus oder fehlt ein Mapping, bleibt der DB-Preis (sicherer Fallback). Damit kann man einen Preis in Creem aendern und ihn nach kurzer Zeit auf der Seite sehen.

---

**Goal:** Die Pricing-Seite zeigt die Preise live aus Creem (SoT nur fuer Preise), ohne die Seite selbst zu aendern und ohne die uebrigen Tier-Infos aus unserer DB anzutasten.

**Architecture:** Ein kleiner Backend-Helper reichert die `Tier[]`-Liste mit den Preisen aus `getCreemCatalog()` an (Cent zu Euro-String, Monat zu `price`, Jahr zu `priceYearly`). Der Public-Tiers-Endpoint ruft den Helper auf. Kein Frontend-Change: `pricing.astro` liest weiter `GET /api/v1/tiers`. Graceful degradation: wirft der Katalog-Fetch (Creem down, kein Key, Produkt geloescht), werden die DB-Preise unveraendert zurueckgegeben.

**Tech Stack:** Fastify plus Drizzle-Repository (Backend), Vitest.

---

## Verifizierte Fakten (2026-07-09)

- Public-Tiers-Route: `apps/backend/src/routes/public-tiers.ts`, `app.get(ENDPOINTS.v1.tiers, () => repo.listTiers())`. `ENDPOINTS.v1.tiers` aus `@musiccloud/shared`.
- `getCreemCatalog()` (`apps/backend/src/services/creem-catalog.ts`) liefert `Record<tierId, Record<interval, { productId, price (Cent, number), currency }>>`, TTL-Cache 5 min.
- `Tier` (`apps/backend/src/db/tiers-repository.ts`): `price`/`priceYearly` sind Euro als numerischer String oder `null`. Kein Currency-Feld (EUR implizit).
- `pricing.astro` (`apps/developer/src/pages/pricing.astro`) fetcht `GET /api/v1/tiers` server-seitig und rendert `price`/`priceYearly` direkt. Braucht keine Aenderung.
- Seed hat 6 Produkte angelegt (Club/Arena/Stadium je month/year); Free-Tier (Indie) hat kein Creem-Produkt, bleibt DB-Preis (hier `null` = frei).

## Dateistruktur

- `apps/backend/src/services/tier-pricing.ts` (neu): `enrichTiersWithCreemPrices(tiers)` plus `centsToEuroString(cents)`.
- `apps/backend/src/services/tier-pricing.test.ts` (neu): Unit-Test mit gemocktem `getCreemCatalog`.
- `apps/backend/src/routes/public-tiers.ts` (modify): Helper aufrufen.

## Task 1: Enrichment-Helper (`tier-pricing.ts`)

**Files:** Create `apps/backend/src/services/tier-pricing.ts`, Test `apps/backend/src/services/tier-pricing.test.ts`

- [x] **Step 1: Failing test** geschrieben (`tier-pricing.test.ts`): `centsToEuroString(900)="9"`, `(9000)="90"`, `(990)="9.90"`; `enrichTiersWithCreemPrices` ueberschreibt price/priceYearly aus dem Katalog, laesst andere Felder und Tiers ohne Eintrag unveraendert, und faellt bei Katalog-Fehler auf DB-Preise zurueck.
- [x] **Step 2: Fails**: `test:run tier-pricing` FAIL (Modul fehlt).
- [x] **Step 3: Implementiert** (`tier-pricing.ts`): `centsToEuroString` plus `enrichTiersWithCreemPrices` (try/catch-Fallback), detaillierter TSDoc.
- [x] **Step 4: Gruen** PASS (5/5).
- [x] **Step 5: Commit**: `Feat: enrich tier prices with the live Creem catalog (MC-114)`.

## Task 2: Route verdrahten (`public-tiers.ts`)

**Files:** Modify `apps/backend/src/routes/public-tiers.ts`

- [x] **Step 1**: `return enrichTiersWithCreemPrices(await repo.listTiers());`, Import aus `../services/tier-pricing.js`.
- [x] **Step 2: Verify lokal**: Backend neu gestartet, `GET /api/v1/tiers` liefert Club 7/70, Arena 28/280, Stadium 149/1490, Indie `null`. Live-Pfad bewiesen: DB-Preis temporaer auf 999 gesetzt, Endpoint lieferte trotzdem 7 (Creem-Override), danach DB zurueckgesetzt.
- [x] **Step 3: Commit**: im selben Commit wie Task 1.

## Task 3: Gates

- [x] Backend-Typecheck grün; `test:run tier-pricing` grün (5/5); Biome sauber (3 Dateien); keine Em-Dashes.

## Abgrenzung

- Kein Pull von Name/Beschreibung/Farbe aus Creem (die bleiben unsere SoT).
- Keine Checkout-/Kauf-Logik (Plan C).
- Kein Cache-Bust-Endpoint: eine Creem-Preisaenderung erscheint nach der 5-min-TTL oder einem Backend-Restart.
