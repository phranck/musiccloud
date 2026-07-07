# Tier `recommended`-Flag — Backend

Plan-Nr.: MC-106

## Preface

Teil 1 von 3 des Features „recommended-Tier". Dieser Plan liefert das Datenmodell, die
server-seitige Invariante und die API. Die beiden Folgepläne bauen darauf auf:
- MC-107 — Dashboard-Editor (Recommended-Toggle + Listen-Badge)
- MC-108 — Pricing-Seite (Tiefeneffekt + Recommended-Badge)

MC-107 und MC-108 hängen von diesem Plan ab (API muss `recommended` liefern/annehmen).

## Ziel

Das Tier-Model bekommt ein Flag `recommended`. Es darf **höchstens eines** (0 oder 1) aller
Tiers `true` sein. Setzen von `true` räumt alle anderen ab (Mutual Exclusion, atomar). `false`
ist jederzeit erlaubt (dann sind alle `false`). Kein Auto-Recommend (Default `false`, auch beim
ersten Tier). Kein Nachrücken beim Löschen. `recommended` ist unabhängig von `enabled`.

## Design

- **Schema** (`apps/backend/src/db/schemas/postgres.ts`, `tiers`-Tabelle @1786): neue Spalte
  `recommended: boolean("recommended").notNull().default(false)`.
- **Migration**: aus dem Repo-Root `pnpm db:generate` (= `drizzle-kit generate --config=drizzle.config.postgres.ts`)
  → erzeugt `0066_*.sql` + Snapshot. Anwenden lokal via `pnpm db:migrate` (= `node scripts/migrate.mjs`).
- **Repo-Interfaces** (`apps/backend/src/db/tiers-repository.ts`): `recommended: boolean` in `Tier` (@20),
  `recommended?: boolean` in `TierCreateData` (@47) und `TierUpdateData` (@63).
- **Adapter** (`apps/backend/src/db/adapters/postgres-tiers.ts`, nutzt raw `#pool`):
  - Row-Mapper/`listTiers` (@60): `recommended` aus der Row mappen (snake→camel).
  - `createTier` (@64): `recommended` einfügen (Default false). Ist es `true`, in **einer Transaktion**
    (pooled client `connect()` + `BEGIN`/`COMMIT`/`ROLLBACK`) nach dem Insert
    `UPDATE tiers SET recommended = false WHERE id <> $newId`.
  - `updateTier` (@90): kommt `recommended === true`, in einer Transaktion zuerst
    `UPDATE tiers SET recommended = false WHERE id <> $id`, dann das normale (dynamische) Field-Update
    (setzt das Ziel auf `true`). Bei `false`/`undefined` nur das normale Field-Update, keine Transaktion.
  - `deleteTier` (@165): unverändert (kein Nachrücken).
  - Raw SQL ist laut Projektkonvention ok; nur die Mehrfach-Statements des `true`-Falls brauchen die Transaktion.
- **Routes**:
  - Admin (`apps/backend/src/routes/admin-tiers.ts`) POST (@31) + PATCH (@67): wenn `recommended` im Body
    vorhanden ist, `typeof body.recommended !== "boolean"` → 400; sonst durchreichen an create/update.
  - Public (`apps/backend/src/routes/public-tiers.ts`): `GET /api/v1/tiers` → `repo.listTiers()` gibt das
    Feld automatisch mit aus (keine Änderung nötig, außer Verifikation).
- **Tests**:
  - Route-Tests (`apps/backend/src/routes/admin-tiers.test.ts`, gemocktes Repo): `freeTier`-Fixture (@16)
    um `recommended` ergänzen; POST/PATCH mit `recommended: true` akzeptiert und an create/update
    durchgereicht; non-boolean `recommended` → 400.
  - Adapter-Integrationstest (`apps/backend/src/db/adapters/__tests__/postgres-tiers.integration.test.ts`,
    Muster der bestehenden `postgres-*.integration.test.ts`): (a) create Default `false`; (b) `true` setzen
    räumt andere ab → höchstens eines `true`; (c) `false` setzen erlaubt → keines `true`; (d) Löschen des
    recommended-Tiers lässt keines recommended.

## Task-Checkliste

- [x] Schema: Spalte `recommended` (boolean, notNull, default false) in `tiers` (postgres.ts)
- [x] Migration erzeugen: `pnpm db:generate` → `0066_supreme_tusk.sql` + Snapshot; Diff sichten (nur `ADD COLUMN`)
- [x] Repo-Interfaces erweitern: `Tier`, `TierCreateData`, `TierUpdateData` (tiers-repository.ts)
- [x] Adapter Row-Mapping/`listTiers`: `recommended` mappen (postgres-tiers.ts)
- [x] Adapter `createTier`: `recommended` einfügen; bei `true` andere in Transaktion abräumen
- [x] Adapter `updateTier`: bei `recommended === true` andere in Transaktion abräumen, sonst normales Update
- [x] Admin-Route POST + PATCH: Boolean-Validierung + Durchreichen (admin-tiers.ts)
- [x] Public-Route: verifiziert — `GET /api/v1/tiers` → `repo.listTiers()` liefert `recommended` mit
- [x] Route-Tests: `freeTier` um `recommended`; recommended akzeptiert; non-boolean → 400; Repo-Args geprüft (18 Tests grün; auch `developer-auth.test.ts`-Fixture nachgezogen)
- [x] Adapter-Integrationstest: create-default-false, at-most-one, false-erlaubt, delete-lässt-keines (4/4 real gegen lokale DB nach `pnpm db:migrate`)
- [x] Gates grün: backend `typecheck`, Repo-`lint` (biome, 982 Dateien), `test:run` (1359 passed); `pnpm db:generate` idempotent (kein Rest-Diff)
- [x] All code references verified (functions, scripts, paths, env vars, package-manager commands)

## Verifizierte Fakten

- `tiers = pgTable` @ `apps/backend/src/db/schemas/postgres.ts:1786`; `TierRow`:1812, `TierInsert`:1813 (grep)
- Repo (`tiers-repository.ts`): `Tier`:20, `TierCreateData`:47, `TierUpdateData`:63, `TierRepository`:79 mit `listTiers`/`createTier`/`updateTier`/`deleteTier` (grep)
- Adapter (`adapters/postgres-tiers.ts`): raw `#pool` (pg `Pool`), keine Transaktion vorhanden; `listTiers`:60, `createTier`:64, `updateTier`:90, `deleteTier`:165 (grep)
- Admin-Route (`routes/admin-tiers.ts`): POST:31, PATCH:67, DELETE:101; Validierungs-Konstanten `HEX_COLOR_RE`/`MAX_TIER_*` (grep); noch kein `recommended`
- Public-Route (`routes/public-tiers.ts`): `GET ENDPOINTS.v1.tiers` → `repo.listTiers()` (grep)
- Migration: Root `pnpm db:generate` = `drizzle-kit generate --config=drizzle.config.postgres.ts`; apply `pnpm db:migrate` = `node scripts/migrate.mjs`; letzte Migration `0065_sudden_namor.sql` → nächste `0066` (grep package.json + ls migrations/postgres)
- Integrationstest-Muster: `apps/backend/src/db/adapters/__tests__/postgres-*.integration.test.ts` (find)
- Route-Test (`routes/admin-tiers.test.ts`): `freeTier`-Fixture:16, `mockTierRepo`:35 (vi.fn createTier/updateTier), `getTierRepository`-Mock:47 (grep)
- Wiring: `getTierRepository` @ `db/index.ts:45` → `new PostgresAdapter(config.url)` (grep)
