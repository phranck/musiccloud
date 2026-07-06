# Tier-Beschreibung — Editor & Preisseite

Plan-Nr.: MC-098

## Preface / Kontext

Ein Tier soll einen Beschreibungstext bekommen (User-Wunsch 2026-07-06). Geklärt:

- **Sichtbarkeit:** überall — Dashboard-Editor + öffentliche Pricing-Card + `GET /api/v1/tiers`. **Nicht** in der Dashboard-Tabelle (Prosa in einer DataTable-Spalte wird unschön).
- **Sprache:** EN-only, plain single-string (wie `price`). Kein DE/EN, keine Translations-Tabelle — das Developer-Portal (`apps/developer`) ist komplett Englisch. Nur das Feld-**Label** im zweisprachigen Dashboard bekommt DE/EN (wie `colColor`), der eingegebene Wert bleibt einsprachig.

Das ist ein direkter Klon des `color`-Features ([MC-096](2026-07-05-tier-color-backend.md) Backend + [MC-097](2026-07-05-tier-color-ui.md) UI), nur als Textarea statt Color-Picker und mit Längen- statt Format-Validierung.

## Ziel

Eine Spalte `description text NOT NULL DEFAULT ''` auf `tiers`, überall verfügbar:
1. Drizzle-Migration (NOT NULL + Default → Bestands-Tiers automatisch mit `''` gefüllt).
2. Backend-Typen + Adapter mappen `description`.
3. Admin-Route validiert am Write-Boundary die Max-Länge (500) → sonst 400.
4. Öffentliche API liefert `description` automatisch mit (kein Handler-Change).
5. Dashboard-Editor: Textarea. Preisseite: Absatz unter dem Tier-Namen (nur wenn non-empty).

## Design

### Backend / DB (ausschließlich Drizzle)

- `apps/backend/src/db/schemas/postgres.ts` (tiers-pgTable, nach `color` Z. 1793): `description: text("description").notNull().default("")`. Danach `pnpm db:generate` → nächste `00XX_*.sql`; der `migrate()`-Runner appliziert sie beim Boot (Heartbeat jede Minute). Kein hand-SQL.
- `apps/backend/src/db/tiers-repository.ts`: `Tier.description: string`; `TierCreateData.description?: string`; `TierUpdateData.description?: string`.
- `apps/backend/src/db/adapters/postgres-tiers.ts`: `TierRow.description`; `toTier` mappt `description: row.description`; INSERT bekommt Spalte `description` + Param (Wert `data.description ?? ""`); UPDATE `if (data.description !== undefined) …`.
- `apps/backend/src/routes/admin-tiers.ts`: Konstante `MAX_TIER_DESCRIPTION_LENGTH = 500`; in Create + Update: wenn `body.description != null && body.description.length > MAX` → 400. Kein Format-Check (freier Text). Öffentliche `public-tiers.ts`: **kein Change**.
- `apps/backend/src/routes/admin-tiers.test.ts`: `freeTier.description = ""`; ein Create-Test mit description → 201; ein Test description > 500 → 400.

### Dashboard (`apps/dashboard`)

- `features/developer/api.ts`: `TierResponse.description: string`; `description` in Create- und Update-Body-Picks.
- `features/developer/TierEditorPage.tsx`: `TierFormData.description`; `EMPTY_FORM.description = ""`; `toSubmitBody` gibt `description` mit; Reducer `OpenEdit` liest `action.tier.description`; im `TierFormDialog` ein `<textarea rows={3} maxLength={500}>` direkt nach dem Name-Feld; TSDoc des Dialogs um „description" ergänzen.
- `i18n/messages.ts`: `colDescription` (Interface + DE „Beschreibung" + EN „Description"), jeweils nach `colName`.

### Developer-Portal (`apps/developer`)

- `pages/pricing.astro`: `TierDto.description: string`; in der Tier-Card nach der Name/Preis-Zeile ein `{tier.description && <p class="text-body text-fg-muted">{tier.description}</p>}` (nur wenn non-empty; DB-Default `''` → nichts).

### Vorentscheidungen (Technik)

`NOT NULL DEFAULT ''` (kein null-Handling), Textarea ~3 Zeilen, Max-Länge 500 (Client `maxLength` + Server-Check), kein Trim/kein Format-Check, Anzeige conditional auf truthy.

## Verified facts (Plan-write-time, 2026-07-06, alle per Read)

- tiers-pgTable `schemas/postgres.ts:1784-1805`; `color` Z. 1793 (`text().notNull().default("#64748b")`), noch kein `description`.
- `Tier`/`TierCreateData`/`TierUpdateData` + `DEFAULT_TIER_COLOR`: `tiers-repository.ts:8-42`.
- Adapter `postgres-tiers.ts`: `TierRow` (12-23), `toTier` (25-38), INSERT 8 Params `$1-$8` (54-68), dyn. UPDATE (72-121). Raw `pool.query` — per User-Klärung ok zu erweitern.
- Admin-Route `admin-tiers.ts`: manuelle Validierung, `HEX_COLOR_RE` (13), Create (22-40) + Patch (42-58). Kein zod.
- `public-tiers.ts:9-14`: `return repo.listTiers()`, kein DTO-Mapping.
- Test `admin-tiers.test.ts`: `freeTier` (16-27, hat `color`), POST/PATCH/DELETE-Suites; gemockte Persistenz (keine echte DB).
- Dashboard `api.ts`: `TierResponse` (123-134), `createTier`/`updateTier`-Picks (140-157).
- `TierEditorPage.tsx`: `TierFormData` (28-36), `EMPTY_FORM` (38-46), `toSubmitBody` (48-58), Reducer `OpenEdit` (103-118), `TierFormDialog` (167-300, Name-Feld 187-199, color-Feld 255-268), TSDoc (148-166).
- `messages.ts`: developer-Interface `colColor:203`, DE `colColor:919`, EN `colColor:1635`; `colName` jeweils direkt davor (200/916/1632).
- `pricing.astro`: `TierDto` (17-26, hat `color`), Card-Markup (112-140), Name/Preis-Zeile (114-127), requests-Block (128-135). EN-only, SSR-fetch, Fallback bei Backend-unreachable.
- Migrations-Tooling: `db:generate` = `drizzle-kit generate --config=drizzle.config.postgres.ts`; Runner `run-migrations.ts` (`migrate()`); letzte Migration `0058_white_puff_adder.sql`.
- `plans next` = MC-098.

## Checklist

- [x] Alle Code-Referenzen vor Execute re-verifiziert (Pfade, Zeilen, Script-Namen)
- [x] Schema: `description`-Spalte in tiers-pgTable (`text().notNull().default("")`)
- [x] Migration `0059_melodic_hercules.sql` (`ADD COLUMN description text DEFAULT '' NOT NULL`), Backend-Restart appliziert + `/api/v1/tiers` liefert `description:""` verifiziert
- [x] `Tier`/`TierCreateData`/`TierUpdateData` um `description`
- [x] Adapter `postgres-tiers.ts`: `TierRow`/`toTier`/INSERT ($9)/UPDATE mappen `description`
- [x] Admin-Route validiert Max-Länge 500 (→ 400), Konstante `MAX_TIER_DESCRIPTION_LENGTH`
- [x] Tests: `admin-tiers.test.ts` (freeTier.description, valid → 201, >500 → 400) — Backend 1345 passed
- [x] Dashboard `api.ts`: `TierResponse.description` + Create/Update-Bodies
- [x] Dashboard `TierEditorPage`: FormData/EMPTY_FORM/toSubmitBody/Reducer + `<textarea>` + TSDoc; neue `formTextareaClass` in FormPrimitives (token-getrieben)
- [x] i18n-Key `colDescription` (Interface + DE „Beschreibung" + EN „Description")
- [x] Preisseite `pricing.astro`: `TierDto.description` + Absatz in der Card (conditional)
- [x] Gates grün: Typecheck (Backend/Dashboard/developer astro 0/0/0), `pnpm lint` (976), `doctor:diff` (0 Issues), Tests Backend 1345 / Frontend 313 / Dashboard 61/61
- [ ] Kleine logische Commits (auf User-Freigabe)
