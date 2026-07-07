# Tier-Farbe — Backend & DB

Plan-Nr.: MC-096

## Preface / Kontext

Tiers sollen eine Farbe bekommen, die im Dashboard-Editor (Color-Picker) gesetzt und sowohl im Dashboard als auch auf der Developer-Portal-Preisseite angezeigt wird (User-Wunsch 2026-07-05). Entscheidungen: freie Hex-Farbe, optional mit Default, Default `#64748b`.

Dieser Plan (MC-096) liefert die Datenschicht: DB-Spalte + Migration, Backend-Typ/Adapter/Route-Validierung, öffentliche API. Die UI (Dashboard-Picker + Tabellen-Swatch, Preisseiten-Akzent) liegt in [MC-097](2026-07-05-tier-color-ui.md).

## Ziel

Eine validierte `color`-Spalte (`#RRGGBB`) auf Tiers, überall verfügbar:
1. Drizzle-Migration für die neue Spalte (NOT NULL + Default → Bestands-Tiers automatisch gefüllt).
2. Backend-Typen + Adapter mappen `color`.
3. Admin-Route validiert `color` am Write-Boundary (strenges Hex, ungültig → 400) → gespeicherter Wert ist garantiert safe (Inline-CSS auf öffentlicher Seite unbedenklich).
4. Öffentliche API liefert `color` automatisch mit (kein Handler-Change).

## Design

### DB / Migration (ausschließlich Drizzle)

`apps/backend/src/db/schemas/postgres.ts`, tiers-pgTable (Zeile 1784-1801): Spalte ergänzen:

```ts
color: text("color").notNull().default("#64748b"),
```

NOT NULL + Default → das generierte `ADD COLUMN ... DEFAULT` backfillt alle Bestands-Tiers. Danach `pnpm db:generate` (root: `drizzle-kit generate --config=drizzle.config.postgres.ts`) → nächste `00XX_*.sql` unter `apps/backend/src/db/migrations/postgres/`. Der `migrate()`-Runner (`run-migrations.ts`) wendet sie beim Backend-Boot an. **Kein hand-SQL, kein psql.**

Default `#64748b` (neutrales Slate).

### Backend-Typen + Adapter

- `apps/backend/src/db/tiers-repository.ts`: `Tier.color: string`; `TierCreateData.color?: string`; `TierUpdateData.color?: string`.
- `apps/backend/src/db/adapters/postgres-tiers.ts` (raw SQL, per User-Klärung ok zu erweitern):
  - `TierRow`-Interface: `color: string`.
  - `toTier`: `color: row.color`.
  - `createTier`-INSERT: Spalte `color` + `$8`-Param, Wert `data.color ?? "#64748b"`.
  - `updateTier`: `if (data.color !== undefined) { fields.push("color = $..."); values.push(data.color); }`.

### Admin-Route-Validierung

`apps/backend/src/routes/admin-tiers.ts` (manuelle Validierung, kein zod): in Create und Update, wenn `body.color` gesetzt, gegen `/^#[0-9a-fA-F]{6}$/` prüfen; ungültig → `400`. Konstante `DEFAULT_TIER_COLOR = "#64748b"` als Create-Default (bzw. DB-Default greifen lassen).

### Öffentliche API

`apps/backend/src/routes/public-tiers.ts` gibt `repo.listTiers()` direkt zurück → `color` fließt automatisch mit. **Kein Change.**

### Tests

`apps/backend/src/routes/admin-tiers.test.ts`: `freeTier` um `color` erweitern; ein Test für Create mit Farbe + ein Test für ungültige Farbe (→ 400).

## Verified facts (Plan-write-time, 2026-07-05)

- tiers-pgTable: `apps/backend/src/db/schemas/postgres.ts:1784-1801`, Spalten id/name/requests_per_minute/requests_per_day/attribution_required/price/sort_order/created_at/updated_at; `TierRow`/`TierInsert` inferred (1803-1804). Noch kein `color`. (Read)
- `Tier`/`TierCreateData`/`TierUpdateData`: `apps/backend/src/db/tiers-repository.ts:7-34`. (grep)
- Adapter `postgres-tiers.ts`: raw `pool.query`, `TierRow` snake_case, `toTier`-Mapping, INSERT mit 7 Params ($1-$7), dynamisches UPDATE. (Read, vollständig)
- Admin-Route `admin-tiers.ts`: manuelle Validierung (name/requestsPerMinute/requestsPerDay required, `> 0`-Checks), kein zod. (grep)
- `public-tiers.ts`: `return repo.listTiers()` — kein DTO-Mapping. (Read)
- Migrations-Tooling: root-Script `db:generate` = `drizzle-kit generate --config=drizzle.config.postgres.ts`; Runner `run-migrations.ts` (`drizzle(pool)` + `migrate()`); letzte Migration `0058_tiers.sql`. (grep/Read)
- Query-Stil raw-SQL im Adapter zu erweitern ist per User-Klärung 2026-07-05 zulässig; Blocker ist nur, dass die Schema-Änderung eine Drizzle-Migration ist. (Memory `feedback_drizzle_always`)

## Umsetzung — Migrations-Re-Baseline (wichtiger Nebenbefund)

Beim `db:generate` kam ein pre-existing Bug aus MC-092 ans Licht: `0058_tiers.sql` war **hand-angelegt und nie im Drizzle-Journal registriert** (`meta/_journal.json` endete bei `0057`). Der Runner (`run-migrations.ts` → Drizzles `migrate()`) wendet nur journalisierte Migrationen an → die tiers-Tabelle wurde **nie erstellt** (lokal + prod bestätigt: `relation "tiers" does not exist`, prod spiegelt local). Das Tier-Feature lief nur gegen gemockte Tests.

Fix (nach User-Freigabe, sicher da keine Umgebung die Tabelle hat): `0058_tiers.sql` gelöscht, per `pnpm db:generate` durch die journalisierte `0058_white_puff_adder.sql` ersetzt (`CREATE TABLE tiers` inkl. `color` + Snapshot + Journal-Eintrag), den Seed (`INSERT 'Free'`) mit `--> statement-breakpoint` angehängt (Muster wie `0054_seed_developer_email_templates`; `color` greift per Default). Backend-Restart → `/api/v1/tiers` liefert 200 mit Free-Tier inkl. `color`. Damit ist der „tiers fehlt überall"-Bug mitgefixt.

## Checklist

- [x] Alle Code-Referenzen vor Execute re-verifiziert (Pfade, Zeilen, Script-Namen)
- [x] Schema: `color`-Spalte in tiers-pgTable (`schemas/postgres.ts`)
- [x] Migration re-baselined: orphaned `0058_tiers.sql` → journalisierte `0058_white_puff_adder.sql` (CREATE TABLE tiers inkl. color + Seed), Runner-Apply beim Restart verifiziert
- [x] `Tier`/`TierCreateData`/`TierUpdateData` um `color` erweitert (+ `DEFAULT_TIER_COLOR`-Const)
- [x] Adapter `postgres-tiers.ts`: `TierRow`/`toTier`/INSERT/UPDATE mappen `color`
- [x] Admin-Route validiert `color` (`^#[0-9a-fA-F]{6}$` → 400)
- [x] Tests: `admin-tiers.test.ts` (freeTier.color, valid-color → 201, invalid-color → 400) — 8/8
- [x] Gates grün: Backend `typecheck`, `pnpm lint` (976 Files), `test:run` (1343 passed / 50 skipped)
- [x] Kleine logische Commits (auf User-Freigabe)
