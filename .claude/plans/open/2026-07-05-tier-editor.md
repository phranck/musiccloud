# Tier Editor — Developer Dashboard

Plan-Nr.: MC-092

## Ziel

Ein vollständiger Tier-Editor im Admin-Dashboard, mit dem Tiers (API-Tarifstufen) frei angelegt, bearbeitet und gelöscht werden können. Die definierten Tiers erscheinen im Developer Portal auf der Pricing-Page und im Developer-Dashboard.

## Architektur

### Datenmodell

Neue Tabelle `tiers`:

| Spalte | Typ | Constraint |
|---|---|---|
| `id` | `text` | PK, nanoid |
| `name` | `text` | NOT NULL, UNIQUE |
| `requests_per_minute` | `integer` | NOT NULL, > 0 |
| `requests_per_day` | `integer` | NOT NULL, > 0 |
| `attribution_required` | `boolean` | NOT NULL, DEFAULT false |
| `price` | `text` | nullable (für später, z.B. "€ 9,90/Monat") |
| `sort_order` | `integer` | NOT NULL, DEFAULT 0 |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT now() |
| `updated_at` | `timestamptz` | NOT NULL, DEFAULT now() |

Kein FK von `api_clients` → `tiers` in diesem Plan — die Verknüpfung Client↔Tier kommt später (MC-093+), wenn das Billing-System gebaut wird. Die Tiers sind in dieser Phase reine Definitionen, die im Developer Portal angezeigt werden.

### Backend-Routen

Alle unter `/api/admin/developer/tiers`, geschützt durch `requireOwnerOrAdmin`:

- `GET /` — Liste aller Tiers (sortiert nach `sort_order`)
- `POST /` — Neues Tier anlegen
- `PATCH /:id` — Tier bearbeiten
- `DELETE /:id` — Tier löschen

### Öffentliche Route fürs Developer Portal

- `GET /api/v1/tiers` — Liste aller Tiers (für Pricing-Page und Developer-Dashboard), ungeschützt

### Dashboard-Pages

- **TierEditorPage** (`/developer/tiers`): DataTable mit allen Tiers, Spalten: Name, Traffic (Minute/Tag), Attribution, Preis, Sort-Order. Pro Row: Edit/Delete-Buttons.
- **TierEditDialog** (Inline-Dialog oder eigene Page): Formular für Name, requestsPerMinute, requestsPerDay, attributionRequired (Checkbox), price (Text), sortOrder.

### Developer Portal

- **Pricing-Page** (`pricing.astro`): Zeigt alle Tiers aus `GET /api/v1/tiers` als Cards statt des aktuellen statischen Commitments. Sortiert nach `sort_order`.
- **Dashboard** (`dashboard/index.astro`): Zeigt das aktuelle Tier des Developers an (aktuell immer "Free", später aus `developer_accounts.plan` oder dem Tier-Join).

### Sidebar

Neuer Eintrag "Tiers" in der Developer-Sektion (unter "Developer Accounts").

## Implementation

### 1. Migration (Drizzle)

- Migration `0058_tiers.sql`: `CREATE TABLE tiers` mit allen Spalten und Constraints
- Schema in `schemas/postgres.ts`: `tiers`-Table-Definition + Row/Insert-Types
- Mindestens ein Default-Tier "Free" per Migration einfügen (60 req/min, 10000 req/day, attribution=false, price=null)

### 2. Backend

- `tiers-repository.ts`: Interface `TierRepository` mit `listTiers`, `createTier`, `updateTier`, `deleteTier`
- `postgres-tiers.ts`: Postgres-Implementierung
- In `postgres.ts`: Wiring der neuen Adapter-Funktionen
- In `db/index.ts`: `getTierRepository()` Factory
- `routes/admin-tiers.ts`: CRUD-Routen unter `/api/admin/developer/tiers`
- `routes/public-tiers.ts`: `GET /api/v1/tiers` (öffentlich, ungeschützt)
- `endpoints.ts`: Neue Endpoint-Konstanten

### 3. Dashboard-Frontend

- `TierEditorPage.tsx`: DataTable + Inline-Edit/Create-Dialog
- `api.ts`: `TierResponse`-Type + `fetchTiers`, `createTier`, `updateTier`, `deleteTier`
- `hooks/useDeveloperData.ts`: `useTiers`, `useCreateTier`, `useUpdateTier`, `useDeleteTier`
- `routes.tsx` + `routeComponents.tsx`: Neue Route registrieren
- `messages.ts`: i18n-Keys (Tier-Editor, Spalten, Formular-Labels)
- `Sidebar.tsx`: Neuer Eintrag "Tiers"

### 4. Developer Portal

- `pricing.astro`: Dynamisches Rendering der Tiers aus `GET /api/v1/tiers` (SSR mit `fetch`)
- `dashboard/index.astro`: Aktuelles Tier anzeigen (statisch "Free" für jetzt)

## Checkliste

- [x] Migration `0058_tiers.sql` geschrieben
- [x] Drizzle-Schema `tiers` in `schemas/postgres.ts`
- [x] `TierRepository`-Interface in `tiers-repository.ts`
- [x] Postgres-Adapter `postgres-tiers.ts`
- [x] Wiring in `postgres.ts` + `db/index.ts`
- [x] Admin-CRUD-Routen `routes/admin-tiers.ts`
- [x] Öffentliche Route `routes/public-tiers.ts`
- [x] Endpoint-Konstanten in `endpoints.ts`
- [x] Dashboard `TierEditorPage.tsx`
- [x] Dashboard API-Types + Fetcher in `api.ts`
- [x] Dashboard Hooks in `useDeveloperData.ts`
- [x] Dashboard Routes + RouteComponents registriert
- [x] Dashboard i18n-Messages
- [x] Dashboard Sidebar-Eintrag
- [x] Developer Portal: Pricing-Page dynamisch
- [x] Developer Portal: Dashboard zeigt Tier (via planLabel, bereits vorhanden)
- [x] Backend-Typecheck grün
- [x] Dashboard-Typecheck grün
- [x] Biome-Lint grün
- [x] Backend-Tests (CRUD-Routen) — 6 Tests grün

## Completed

Alle 20 Tasks umgesetzt in 6 Commits.

## Verifizierte Fakten

| Referenz | Verifikation |
|---|---|
| `developer_accounts`-Tabelle in `schemas/postgres.ts:1560` | `Read` |
| `api_clients`-Tabelle in `schemas/postgres.ts:1686` | `Read` |
| `plan`-Spalte ist `text`, Default `"free"`, Check-Constraint nur `('free')` | `Read` |
| `ENDPOINTS.admin.developer` existiert in `packages/shared/src/endpoints.ts:359` | `Read` |
| `requireOwnerOrAdmin` in `lib/admin-caller.js` | `grep` |
| `apps/developer/src/pages/pricing.astro` existiert | `Bash ls` |
| `apps/developer/src/pages/dashboard/` existiert mit `index.astro` | `Bash ls` |
| `SidebarDeveloperSection` in `Sidebar.tsx:603` | `Read` |
| `plans next` = MC-092 | `~/.local/bin/plans next` |
