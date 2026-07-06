# Tier-Zuweisung + Key-Override + Enforcement

Plan-Nr.: MC-100

## Preface / Kontext

Teil 2 des Tier-Lifecycle-Features (User 2026-07-06). Baut auf [MC-099](2026-07-06-tier-enable-disable.md) (Tier-Flags `enabled`/`disableReason`) auf.

Detail-Design + Verified facts ergänzt 2026-07-06 (alle relevanten Files vollständig gelesen).

## Ziel / Scope

1. **Zuweisung:** `developer_accounts.plan` (heute `text IN ('free')`) → `tierId`-FK auf `tiers`. Jeder Account hat genau einen Tier. Bestandsdaten (`plan='free'`) → Free-Tier-ID migrieren.
2. **Key-Override:** `api_clients.requestsPerMinute`/`requestsPerDay` → **nullable**. `null` = erbt live vom Tier des Accounts, gesetzt = Override. Effektiv = `key.override ?? account.tier.value`. „Custom Tier" = mind. ein Override-Feld non-null.
3. **Enforcement:** Die Rate-Limit-Auflösung in `authenticatePublic` (`plugins/auth.ts:174-181`, nutzt heute `resolved.client.requestsPerMinute/Day`) auf den **effektiven** Wert umstellen. Limiter-Mechanik (`clientMinute/DayRateLimiter`) bleibt. Stale-Kommentar „not yet enforced" (`schemas/postgres.ts` ~1683) korrigieren.
4. **TierDropdown** (neue Component, Wrapper um `components/ui/Dropdown.tsx`): in `DeveloperDetailPage` statt des heutigen plan-Text-Inputs. Wählbar sind **nur enablete** Tiers.
5. **ClientDetailPage:** Override-Felder (per-minute/per-day) mit „erbt vom Tier"-Default; „Custom"-Badge, wenn Override gesetzt.
6. **Zuweisungs-Anzeige** (siehe Nachtrag unten).

## Nachtrag: veraltetes/deaktiviertes Tier bleibt zugewiesen (User 2026-07-06)

Wird ein Tier deaktiviert (`enabled=false`, z.B. Preisanpassung/nicht mehr angeboten), **behält** ein Developer, dem es bereits zugewiesen ist, dieses Tier weiter (keine Zwangsmigration). Es muss aber **gekennzeichnet** werden, dass der Developer ein nicht mehr aktives Tier hat:

- **DeveloperDetailPage** + **DeveloperAccountsPage**: Badge/Hinweis „nicht mehr aktives Tier" (Warnton), wenn der zugewiesene Tier `enabled=false` ist.
- **TierDropdown:** der aktuell zugewiesene *disablete* Tier wird weiterhin als aktuelle Auswahl angezeigt (markiert „nicht mehr aktiv"), ist aber in der Auswahlliste für **Neu**-Zuweisung nicht enthalten (nur enablete wählbar). So sieht der Admin den Ist-Zustand, kann aber nicht erneut ein disabletes Tier zuweisen.

## Design

### DB / Migration (ausschließlich Drizzle; eine Migration `0061` mit Daten-Backfill-Statements im Stil des 0058-Seeds)

`apps/backend/src/db/schemas/postgres.ts`:

- `developer_accounts` (Z. 1558-1577): `plan`-Spalte + Check `chk_developer_accounts_plan` **entfernen**; stattdessen
  `tierId: text("tier_id").references(() => tiers.id, { onDelete: "set null" })` (nullable — Tier-Löschung setzt auf NULL, Fallback-Limits greifen). Achtung Deklarationsreihenfolge: `tiers` steht weiter unten in der Datei → `references(() => tiers.id)` (Lazy-Callback) ist ok.
- `api_clients` (Z. 1686-1711): `requestsPerMinute`/`requestsPerDay` → nullable, ohne Default (`integer("requests_per_minute")`); Checks auf `IS NULL OR > 0` ändern.
- Stale-Kommentare fixen: api_clients-Doc „not yet enforced anywhere (MC-025 Phase 2)" (Enforcement existiert in `authenticatePublic` seit MC-088) und tiers-Doc „No FK from api_clients yet".

Nach `pnpm db:generate` die generierte `0061_*.sql` editieren (Muster 0058-Seed, `--> statement-breakpoint`):
1. Nach `ADD COLUMN tier_id` + FK: `UPDATE developer_accounts SET tier_id = (SELECT id FROM tiers WHERE name = 'Free' LIMIT 1) WHERE plan = 'free';` (Free-Tier existiert seit 0058-Seed; trifft der Subselect nichts, bleibt tier_id NULL → Fallback).
2. Vor/nach den api_clients-ALTERs: `UPDATE api_clients SET requests_per_minute = NULL, requests_per_day = NULL WHERE requests_per_minute = 60 AND requests_per_day = 10000;` — nur das eingehärtete Default-Paar wird zu „erbt"; abweichende Werte waren bewusste Admin-Edits und bleiben Overrides.
3. DROP von `plan` erst nach dem Backfill (Reihenfolge in der generierten Datei prüfen/umstellen).

### Backend — Typen & Adapter

- `tiers-repository.ts`: Konstanten `FALLBACK_REQUESTS_PER_MINUTE = 60` / `FALLBACK_REQUESTS_PER_DAY = 10000` (ein Ort für die Fallback-Regel).
- `developer-repository.ts` / `postgres-developer.ts`: `DeveloperAccount.plan` → `tierId: string | null`; Row/`DEVELOPER_ACCOUNT_COLUMNS`/Mapper/`updateDeveloperAccount` (`tierId?: string | null`, dyn. SET). `listDeveloperAccounts`-Query um `LEFT JOIN tiers` erweitern → zusätzlich `tierName: string | null`, `tierEnabled: boolean | null`. `findDeveloperAccountById` bleibt JOIN-frei (Auth-Hot-Path).
- `api-access-repository.ts` / `postgres-api-access.ts`: `ApiClient.requestsPerMinute/Day: number | null` (Override) + neue Felder `tierId/tierName: string | null`, `tierRequestsPerMinute/Day: number | null`, `effectiveRequestsPerMinute/Day: number` (Mapper rechnet `override ?? tier ?? fallback`). Alle Client-Reads (`findApiClientById`, `listApiClients`, `listApiClientsByDeveloperAccount`, `findActiveApiClientByTokenHash`) auf eine gemeinsame JOIN-Query (client → developer_accounts → tiers) umstellen. `createApiClient`: `COALESCE($7,60)/($8,10000)` raus → NULL-Insert (= erbt); Rückgabe via Re-Fetch (JOIN-Shape). `updateApiClient`: COALESCE-Pattern → dynamisches Feld-Pattern, damit `null` explizit setzbar ist (Override löschen); `data.requestsPerMinute?: number | null`.

### Enforcement

`plugins/auth.ts:174/178`: `resolved.client.requestsPerMinute/Day` → `resolved.client.effectiveRequestsPerMinute/Day`. Limiter unverändert (`DynamicRateLimiter` nimmt Cap pro Call — Tier-/Override-Änderungen greifen sofort, verifiziert `rate-limiter.ts:144-167`). Doku-Kommentare (auth.ts Z. 127-131, rate-limiter.ts Z. 213-220) auf „override ?? tier"-Quelle anpassen.

### Backend — Routen

- `admin-api-access.ts`:
  - GET accounts (Liste): `plan` → `tierId` + `tierName` + `tierEnabled`.
  - GET/PATCH accounts/:id: Body `plan` → `tierId?: string | null`; Validierung: non-null `tierId` muss ein **enabled** Tier sein (Lookup via `getTierRepository().listTiers()`) → sonst 400; `null` = Zuweisung entfernen. Responses liefern `tierId`/`tierName`/`tierEnabled` (Detail via Tier-Lookup in der Route — Tabelle ist winzig).
  - PATCH clients/:id (`clientUpdate`): `requestsPerMinute/Day?: number | null` (null = Override löschen); Validierung `> 0` nur für Zahlen.
  - `toClientResponse`: `requestsPerMinute/Day` (nullable Override) + `effectiveRequestsPerMinute/Day` + `tierName`.
- `dev-api-access.ts` `toClientResponse` (Z. 45-57): liefert die **effektiven** Werte unter den bestehenden Keys (`requestsPerMinute: client.effectiveRequestsPerMinute`) — Portal-UI (`ApiKeysPanel.tsx:135`, `usage.astro:57/61`) bleibt unverändert und zeigt automatisch das, was gilt.
- `developer-auth.ts` `/me` (Z. 156): `plan: account.plan` → `tierName: string | null` (Tier-Lookup); Portal `dashboard/index.astro:25` (`planLabel`) auf `tierName ?? "—"` umstellen.

### Dashboard

- `features/developer/api.ts`: `DeveloperAccountResponse.plan` → `tierId/tierName/tierEnabled`; `updateDeveloperAccount`-Body `tierId?: string | null`; `ApiClientResponse.requestsPerMinute/Day: number | null` + `effectiveRequestsPerMinute/Day: number` + `tierName: string | null`; `updateApiClient`-Body nullable.
- **`TierDropdown`** (neu, `features/developer/components/TierDropdown.tsx`): Wrapper um `components/ui/Dropdown.tsx` (`Dropdown<T>`, Props value/onChange/options/placeholder, verifiziert). Props: `value: string | null`, `onChange(tierId: string | null)`, nutzt `useTiers()`. Optionen = alle **enableten** Tiers (Farb-Swatch als `icon`) + falls `value` auf ein disabletes Tier zeigt: dieses als zusätzliche, markierte Option („(inactive)"), damit der Ist-Zustand sichtbar bleibt; neu wählbar sind nur enablete.
- `DeveloperDetailPage.tsx` (Z. 150-160): plan-Text-Input → `TierDropdown`; Warn-Badge (amber) „nicht mehr aktives Tier", wenn zugewiesenes Tier disabled; `AccountDraft.plan` → `tierId: string | null`; `handleSave` sendet `tierId`.
- `DeveloperAccountsPage.tsx` (Z. 52-59): plan-Spalte → `tierName ?? "—"` + amber-Badge wenn `tierEnabled === false`.
- `ClientDetailPage.tsx` (Z. 26-29, 99-111, 141-164): `RateLimitDraft` → `min/day: string` (leer = erbt); Inputs mit Placeholder = effektiver Tier-Wert; leerer Input sendet `null` (Override löschen), Zahl sendet Override; „Custom"-Badge wenn `client.requestsPerMinute != null || client.requestsPerDay != null`; Hinweiszeile „erbt von {tierName}".
- `ApiClientsPage.tsx` (traffic-Spalte Z. 75-88): effektive Werte anzeigen + „Custom"-Badge bei Override.
- `hooks/useDeveloperData.ts`: `useUpdateDeveloperAccount`/`useUpdateClient`-Body-Typen anpassen.
- i18n `messages.ts` (developer-Namespace): `colTier` (DE „Tier"/EN „Tier"), `tierInactiveBadge` (DE „Tier nicht mehr aktiv"/EN „Tier inactive"), `tierNone` (DE „Kein Tier"/EN „No tier"), `clientCustomBadge` (DE „Custom"/EN „Custom"), `clientInheritsFrom` (DE „erbt von {tier}"/EN „inherits from {tier}"), `tierDropdownInactiveSuffix` („(inaktiv)"/„(inactive)").

### Tests

- `admin-tiers.test.ts` unberührt. `dev-api-access.test.ts`: Mock-Clients um neue Felder (`effectiveRequestsPerMinute/Day`, nullable Overrides) ergänzen; Response-Assertions auf effektive Werte.
- Neu: Unit-Test für die effektive-Limit-Regel (Mapper: override gewinnt / erbt Tier / Fallback ohne Tier) — als Adapter-Test mit gemocktem Row-Input oder pure-Helper-Test.
- Enforcement: bestehender Auth-Pfad wird von `dev-api-access.test.ts`/Route-Tests abgedeckt; Quota-Werte kommen jetzt aus `effective*` (Mock liefert sie).

## Verified facts (Plan-write-time 2026-07-06, alle per Read in dieser Session)

- `developer_accounts` Schema Z. 1558-1577 (`plan text NOT NULL DEFAULT 'free'`, Check `IN ('free')`); `api_clients` Z. 1686-1711 (`requests_per_minute/day integer NOT NULL DEFAULT 60/10000`, Checks `> 0`, Kommentar „not yet enforced" stale).
- `DeveloperAccount`/`updateDeveloperAccount`: `developer-repository.ts:39-51/184-192`; Adapter `postgres-developer.ts` (`DEVELOPER_ACCOUNT_COLUMNS` Z. 74-75, Mapper Z. 86-100, `listDeveloperAccounts` mit `da.*`+clientCount Z. 145-166, dyn. UPDATE Z. 310-350).
- `ApiClient`-DTO `api-access-repository.ts:58-71`; `findActiveApiClientByTokenHash` Kontrakt Z. 213 (`{client, token}`), Adapter-Impl `postgres-api-access.ts:349-366` (zwei Point-Reads); `createApiClient` mit `COALESCE($7,60)/($8,10000)` Z. 241-259; `updateApiClient` mit COALESCE-Pattern Z. 284-302 (kann nicht auf NULL setzen → dyn. Pattern nötig).
- Enforcement heute: `plugins/auth.ts:174-181` (`clientMinute/DayRateLimiter.check(resolved.client.id, resolved.client.requestsPerMinute/Day)`); `DynamicRateLimiter` cap-per-call `rate-limiter.ts:144-167`.
- Admin-Routen `admin-api-access.ts`: Account-GET/PATCH Z. 89-181 (plan im Body/Response), clientUpdate Z. 267-293, `toClientResponse` Z. 41-56; Suspend-Kaskade Z. 152-158.
- Portal: `dev-api-access.ts` `toClientResponse` Z. 45-57; `/me` `plan` `developer-auth.ts:156`; `dashboard/index.astro:25` `planLabel`; `ApiKeysPanel.tsx:135` + `usage.astro:57/61` zeigen `client.requestsPerMinute/Day`.
- Dashboard: `Dropdown<T>` `components/ui/Dropdown.tsx` (Props value/onChange/options/label/size/align/placeholder, `DropdownOption {value,label,icon,count}`); `DeveloperDetailPage` plan-Input Z. 150-160, Draft Z. 25-29/53-57, Save Z. 63-73; `DeveloperAccountsPage` plan-Spalte Z. 52-59; `ClientDetailPage` Draft/limits Z. 26-29/99-111, Inputs Z. 141-164; `ApiClientsPage` traffic-Spalte Z. 75-88; Hooks `useDeveloperData.ts` (useUpdateDeveloperAccount Z. 76-93, useUpdateClient Z. 125-134, useTiers Z. 136-141); `TierResponse` inkl. `enabled/disableReason/color` (MC-098/099).
- `ENDPOINTS.admin.developer.accounts/accountDetail/tiers/tierDetail` existieren (`packages/shared/src/endpoints.ts:383-390`); Account-Routen sind zusätzlich als Raw-Strings in `admin-api-access.ts` registriert — kein neuer Endpoint nötig.
- Free-Tier-Seed existiert seit Migration `0058_white_puff_adder.sql` (`INSERT ... 'Free'`); letzte Migration ist `0060_yielding_mastermind.sql`.
- `plan`-Konsumenten im Backend (vollständig): `schemas/postgres.ts`, `postgres-developer.ts`, `developer-auth.ts:156`, `admin-api-access.ts` (grep `\.plan\b`).

## Checklist

- [x] Detail-Design + „Verified facts" ergänzt (offene Punkte gelesen/verifiziert)
- [x] Schema: `developer_accounts.tierId`-FK (+ `plan`/Check raus), `api_clients`-Felder nullable + Checks `IS NULL OR > 0`, stale Kommentare gefixt
- [x] Migrationen `0061_lowly_kylun` (ADD tier_id + api_clients nullable + Backfills) und `0062_first_anthem` (DROP plan) — Zwei-Schritt-generate wegen drizzle-kit-Rename-Prompt (kein TTY); Boot-Apply + E2E verifiziert (Account trägt tier_free; Client-Override 60/1000 blieb erhalten)
- [x] Backend-Typen/Adapter: `DeveloperAccount.tierId`, `ApiClient` nullable Overrides + `tier*`/`effective*`, `CLIENT_JOIN_SELECT` für alle Reads, `createApiClient` ohne COALESCE, `updateApiClient` dyn. (null setzbar)
- [x] Fallback-Konstanten (`FALLBACK_REQUESTS_PER_MINUTE/DAY`) + Regel an einer Stelle (`rowToApiClient`)
- [x] `authenticatePublic` nutzt `effectiveRequestsPerMinute/Day`; Doku (auth.ts, rate-limiter.ts) aktualisiert
- [x] Admin-Routen: Account-PATCH `tierId` (enabled-Check nur bei Änderung — unverändertes disabled Tier re-submitten bleibt ok; null erlaubt); Responses `tierId/tierName/tierEnabled`; clientUpdate nullable + >0-Validierung; `toClientResponse` mit tier*/effective
- [x] Portal: `dev-api-access` liefert effektive Werte (Portal-UI unverändert korrekt); `/me` `tierName` (nur dort aufgelöst); `session.ts` + `dashboard/index.astro` angepasst
- [x] Dashboard `api.ts` + Hooks: neue Shapes
- [x] `TierDropdown` (`features/developer/components/`, Wrapper um `Dropdown` mit neuem `aria-label`-Prop; Farb-Swatches; nur enablete + zugewiesenes disabled als „(inaktiv)"-Ist-Option; „Kein Tier"-Option)
- [x] `DeveloperDetailPage`: TierDropdown + amber-Badge; browser-verifiziert (Listbox „Kein Tier"/„Free")
- [x] `DeveloperAccountsPage`: Tier-Spalte + Badge; browser-verifiziert („Free")
- [x] `ClientDetailPage`: Override-Felder (leer = erbt, Placeholder = Tier-Wert) + „Custom"-Badge + „erbt von {tier}"; Roundtrip browser-verifiziert (leeren→Badge weg→wiederherstellen)
- [x] `ApiClientsPage`: effektive Werte + „Custom"-Badge; browser-verifiziert („60/Minute · 1000/Tag Custom")
- [x] i18n (DE/EN): colTier, tierNone, tierInactiveBadge, tierDropdownInactiveSuffix, clientCustomBadge, clientInheritsFrom (colPlan ersetzt)
- [x] Tests: 4 neue effective-limit-Unit-Tests (override/erbt/gemischt/fallback), Fixtures aller 5 Route-/Auth-Suiten migriert, auth.test enforced effective
- [x] Gates grün: Typecheck 0, `pnpm lint` (978), `doctor:diff` 0, Tests Backend 1351 / Frontend 313 / Dashboard 61
- [ ] Kleine logische Commits (auf User-Freigabe)

## Offener Produkt-Punkt (bewusst nicht umgesetzt)

Neue Signups starten mit `tierId = null` („Kein Tier", effektive Limits = konservativer Fallback 60/10000); die Zuweisung ist eine bewusste Admin-Aktion im Dashboard. Falls Signups automatisch ein Default-Tier (z.B. Free) bekommen sollen, ist das ein kleiner Folge-Change (Signup-Flow + Wahl eines Default-Markers am Tier).
