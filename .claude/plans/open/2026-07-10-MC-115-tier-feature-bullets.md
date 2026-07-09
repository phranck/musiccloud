# Tier-Feature-Bullets (Pricing-Cards): Implementierungsplan

Plan-Nr.: MC-115

## TLDR

Jede Pricing-Card soll eine pflegbare Liste von Feature-Bullets bekommen, je Bullet mit einem Text und einem Zustand "enthalten" (Haken) oder "nicht enthalten" (Kreuz). Diese Bullets sind unsere Daten (Source of Truth bei uns, nicht bei Creem), werden im Admin-Tier-Editor gepflegt und auf der Developer-Pricing-Seite gerendert. Betrifft drei Schichten: Backend-Datenmodell plus Migration, Admin-UI im Dashboard und die Pricing-Card im Developer-Portal. Inhalte sind frei vom User pflegbar; dieser Plan liefert die Struktur, nicht konkrete Feature-Texte.

---

> **Für agentische Worker:** Steps nutzen Checkbox-Syntax (`- [ ]`), beim Abarbeiten SOFORT abhaken. Alle neuen Texte em-dash-frei. TDD wo testbar (Repository/Validierung); UI wird vom User visuell geprueft.

**Goal:** Pro Tier eine geordnete Liste `{ label, included }[]` speichern, im Admin editieren und auf der Pricing-Card als Haken/Kreuz-Liste anzeigen. Alle Tiers inkl. Free; kein Creem noetig.

**Architecture:** Neue JSONB-Spalte `features` an der bestehenden `tiers`-Tabelle (Default `[]`). Das Repository (raw pg) traegt sie durch; die Admin-API (`admin-tiers.ts`, manuelle Validierung wie bei den anderen Feldern) nimmt sie an und validiert sie; die Public-Tiers-API gibt sie mit (die Creem-Preis-Anreicherung aus MC-114 bleibt unberuehrt, sie ersetzt nur Preise). Das Dashboard-Tier-Formular bekommt einen Bullet-Editor; die Pricing-Card rendert die Liste.

**Tech Stack:** Fastify plus raw pg (Backend), Drizzle-kit (Migration), Vitest, React (Dashboard), Astro (Developer-Portal).

---

## Verifizierte Fakten (2026-07-10)

- **Schema:** `tiers` in `apps/backend/src/db/schemas/postgres.ts:1857`. Letzte Migration `0070`, neue wird `0071`.
- **Domain-Typen:** `Tier`, `TierCreateData`, `TierUpdateData`, `TierRepository` in `apps/backend/src/db/tiers-repository.ts`. Konstanten dort (z.B. `DEFAULT_TIER_COLOR`).
- **Repository-Impl:** `apps/backend/src/db/adapters/postgres-tiers.ts` (`PostgresTierRepository`, raw `#pool.query`, `TierRow` snake_case zu `toTier` camelCase; `listTiers`, `createTier`, `updateTier`). `pg` parst `jsonb` automatisch zu JS (row.features ist bereits ein Array).
- **Admin-API:** `apps/backend/src/routes/admin-tiers.ts`. POST create + PATCH update, MANUELLE Validierung (kein zod). Vorhandene Konstanten: `MAX_TIER_DESCRIPTION_LENGTH`, `MAX_TIER_BUTTON_LABEL_LENGTH`, `MAX_TIER_DISABLE_REASON_LENGTH`, `HEX_COLOR_RE`, `isTierIconName`. Endpoints via `ENDPOINTS.admin.developer.tiers` / `.tierDetail(":id")`.
- **Public-API:** `apps/backend/src/routes/public-tiers.ts` gibt `enrichTiersWithCreemPrices(await repo.listTiers())` zurueck; `features` fliesst automatisch mit, da es Teil von `Tier` ist.
- **Admin-UI:** `apps/dashboard/src/features/developer/TierEditorPage.tsx` (Tier-Formular), API-Client `apps/dashboard/src/features/developer/api.ts`, Hooks `.../hooks/useDeveloperData.ts`. Dashboard nutzt Phosphor-Icons.
- **Pricing-Card:** `apps/developer/src/pages/pricing.astro`, `interface TierDto` bei `:21`, Card-Rendering `:160-228` (zeigt heute Icon, Name, Beschreibung, req/min, req/day, Attribution, Preis, CTA). Developer-Portal nutzt Iconsax via `lib/icons.tsx`.

**Verifikations-Checkliste:**
- [ ] Alle Refs vor Task-Start re-verifiziert (Migrationsnummer via `ls`, Schema-Zeile, Repository-Methoden, Admin-Validierungskonstanten, TierEditorPage-Feldmuster, pricing.astro TierDto).

## Gemeinsamer Typ

```ts
/** Ein Feature-Bullet auf der Pricing-Card: ein Label plus ob es im Tier enthalten ist. */
export interface TierFeature {
  label: string;
  included: boolean;
}
```
Grenzen (neue Konstanten in `tiers-repository.ts`): `MAX_TIER_FEATURES = 12`, `MAX_TIER_FEATURE_LABEL_LENGTH = 80`.

## Dateistruktur

- `apps/backend/src/db/tiers-repository.ts` (modify): `TierFeature` plus `features` an `Tier`/`TierCreateData`/`TierUpdateData`, Konstanten.
- `apps/backend/src/db/schemas/postgres.ts` (modify): `features` jsonb-Spalte an `tiers`.
- `apps/backend/src/db/migrations/postgres/0071_*.sql` plus Journal/Snapshot (via `db:generate`).
- `apps/backend/src/db/adapters/postgres-tiers.ts` (modify): `features` in `TierRow`/`toTier`/`createTier`/`updateTier`.
- `apps/backend/src/routes/admin-tiers.ts` (modify): `features`-Validierung.
- `apps/dashboard/src/features/developer/TierEditorPage.tsx` (modify): Bullet-Editor; ggf. `api.ts`/`useDeveloperData.ts` fuer den DTO.
- `apps/developer/src/pages/pricing.astro` (modify): `features` in `TierDto` plus Render-Block.

---

## Task 1: Datenmodell plus Migration 0071

**Files:** `tiers-repository.ts`, `postgres.ts`, generierte `0071_*.sql`

- [x] **Step 1:** `TierFeature` plus `MAX_TIER_FEATURES`/`MAX_TIER_FEATURE_LABEL_LENGTH` exportiert; `features: TierFeature[]` an `Tier`, `features?: TierFeature[]` an `TierCreateData`/`TierUpdateData`. TSDoc.
- [x] **Step 2:** `features: jsonb("features").notNull().default([])` an `tiers` (kein `$type`, weil das Repository raw pg nutzt; `jsonb` war bereits importiert).
- [x] **Step 3:** `pnpm db:generate` -> `0071_careless_mandarin.sql` (`ALTER TABLE "tiers" ADD COLUMN "features" jsonb DEFAULT '[]'::jsonb NOT NULL;`), non-interaktiv.
- [x] **Step 4:** `pnpm db:migrate` OK; `\d tiers` zeigt `features jsonb not null default '[]'::jsonb`; `db:generate`-Idempotenz: "No schema changes".
- [x] **Step 5: Commit:** zusammen mit Task 2 (gekoppelt, da `Tier.features` Pflichtfeld ist).

## Task 2: Repository-Durchreichung (`postgres-tiers.ts`)

**Files:** `postgres-tiers.ts`, Test `apps/backend/src/db/adapters/__tests__/postgres-tiers.integration.test.ts` (falls dort Muster; sonst Unit-Coverage ueber bestehende Tests)

- [x] **Step 1/2:** `TierRow.features`, `toTier` (`row.features ?? []`), `createTier` (Spalte plus `$16::jsonb` mit `JSON.stringify(data.features ?? [])`), `updateTier` (`features = $N::jsonb`-Branch). Import `TierFeature` ergaenzt. `pg` parst jsonb beim Lesen automatisch.
- [x] **Step 3:** Typecheck clean (4 Test-Fixtures um `features: []` ergaenzt, da `Tier.features` jetzt Pflicht ist), Backend-Tests gruen (1390). Read-Pfad live verifiziert: features per psql gesetzt, `/api/v1/tiers` liefert sie korrekt zurueck, Indie `[]`.
- [x] **Step 4: Commit:** zusammen mit Task 1.

## Task 3: Admin-API-Validierung (`admin-tiers.ts`)

**Files:** `admin-tiers.ts`, Test (falls Route-Tests existieren)

- [x] **Step 1:** `validateFeatures(features): string | null` (Array, <= `MAX_TIER_FEATURES`, jedes Element `{ label: nicht-leerer String <= `MAX_TIER_FEATURE_LABEL_LENGTH`, included: boolean }`); in POST und PATCH aufgerufen, 400 bei Fehler. TSDoc.
- [x] **Step 2:** Test in `admin-tiers.test.ts` ergaenzt (features durchgereicht -> 201; malformed -> 400), 19/19 gruen. Parametrisierter jsonb-Write-Mechanismus (`$1::jsonb` plus `JSON.stringify`) real gegen die DB verifiziert (round-trip als Array zurueck).
- [x] **Step 3: Commit:** `Feat: validate tier features on the admin API (MC-115)`.

## Task 4: Admin-Bullet-Editor (`TierEditorPage.tsx`)

**Files:** `TierEditorPage.tsx` (plus `api.ts`/`useDeveloperData.ts` falls der DTO das Feld braucht)

- [x] **Step 1:** `TierFeatureBulletsEditor` in `TierEditorPage.tsx`: geordnete Liste, je Zeile Haken/Kreuz-Toggle plus Label-Input plus Hoch/Runter plus Entfernen; "Feature hinzufuegen"-Button (disabled ab `MAX_FEATURES = 12`); Blank-Labels werden beim Speichern verworfen. `features` in `api.ts` (`TierFeatureBullet`, `TierResponse`, create/update-Body), `useDeveloperData.ts` und 8 i18n-Keys (DE/EN) ergaenzt. Phosphor-Icons, kein Inline-SVG. (Subagent, verifiziert.)
- [ ] **Step 2: Verify (User, visuell):** im Dashboard einen Tier editieren, Bullets anlegen/umsortieren/toggeln, speichern, neu laden -> persistiert. Gates gruen (Full-Doctor 0 issues, Dashboard-Typecheck clean, Biome clean, neuer Code em-dash-frei, Submit-Wiring geprueft); finale visuelle Abnahme durch User offen.
- [x] **Step 3: Commit:** `Feat: edit tier feature bullets in the admin (MC-115)`.

## Task 5: Pricing-Card-Rendering (`pricing.astro`)

**Files:** `pricing.astro`

- [x] **Step 1:** `features: { label: string; included: boolean }[]` an `interface TierDto`.
- [x] **Step 2:** Nach dem Attribution-Absatz eine `<ul>` gerendert: pro Feature `TickCircleIcon` (Haken, in Tier-Farbe via `style={{ color: tier.color }}`) bzw. `CloseCircleIcon` (Kreuz, `text-fg-subtle`) plus Label. Iconsax via `@/lib/icons`, kein Inline-SVG. Leere Liste -> kein Block. `developer check` clean (React-Icon-`style` als CSSProperties-Objekt, nicht String).
- [ ] **Step 3: Verify (User, visuell):** `http://localhost:3002/pricing` zeigt die Bullets pro Tier korrekt (Haken/Kreuz, Farbe). Render bereits belegt (HTTP 200, alle Labels im HTML); Demo-Bullets zum Anschauen in der DB gesetzt (Platzhalter, per Admin ersetzbar).
- [x] **Step 4: Commit:** `Feat: render tier feature bullets on the pricing cards (MC-115)`.

## Task 6: Gesamt-Gates

- [x] Backend-Typecheck plus `test:run` gruen (1391 passed); Dashboard-Typecheck (`typecheck`) clean; Developer-`check` 0 errors; Biome-Lint repo-weit clean (1005 Dateien); Full React Doctor 0 issues; neuer Code em-dash-frei; Clean-State-Migration inkl. `0071` fehlerfrei (72 Migrationen, features-Spalte da); `plans check` OK.

## Abgrenzung

- Keine Creem-Anbindung fuer die Bullets (bewusst unsere SoT).
- Kein Rich-Text/Markdown in Bullets (einfacher Text-Label).
- Keine Aenderung an den bestehenden Rate-Limit-/Attribution-Zeilen (die bleiben separat, auto-generiert).
- Keine Reorder-per-Drag-and-Drop noetig (Hoch/Runter reicht).

## Nachtrag (2026-07-10, nach visuellem User-Feedback)

Das urspruengliche `{ label, included }`-Modell (Haken/Kreuz) wurde nach dem ersten Anschauen vereinfacht: die Pricing-Card zaehlt nur noch auf, was ENTHALTEN ist. Konsequenz (User-Entscheidung "Umschalter entfernen"):

- **Modell auf `string[]` vereinfacht**: `features` ist jetzt eine geordnete Liste von Label-Strings, kein `included`-Feld mehr. Betrifft `Tier`/`TierCreateData`/`TierUpdateData`, `TierRow`/Adapter, Admin-Validierung (`validateFeatures` prueft nicht-leere Strings), Admin-Editor (Include/Exclude-Toggle entfernt, jede Zeile nur Label-Input, `featureIncludedLabel`-i18n raus) und die Card (rendert jeden String mit Haken in Tier-Farbe).
- **Kein Schema-Migration noetig**: die jsonb-Spalte bleibt; nur die App-Interpretation und die (leeren) Prod-Daten aendern sich. Lokale Demo-Daten wurden auf `string[]` zurueckgesetzt.
- **Card-Ausrichtung**: Beschreibung, Rate-Limits und Attribution sind linksbuendig; Bullet-Icon und Label vertikal zueinander zentriert. (Ersetzt die urspruengliche zentrierte Darstellung; die Abgrenzung "keine Aenderung an Rate-Limit-/Attribution-Zeilen" ist damit ueberholt.)
