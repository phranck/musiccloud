# Tier-Zuweisung + Key-Override + Enforcement

Plan-Nr.: MC-100

## Preface / Kontext

Teil 2 des Tier-Lifecycle-Features (User 2026-07-06). Baut auf [MC-099](2026-07-06-tier-enable-disable.md) (Tier-Flags `enabled`/`disableReason`) auf.

**Status: Scope-Stub.** Detail-Design + „Verified facts" werden vor der Umsetzung ergänzt (nach MC-099), inkl. der noch nicht vollständig gelesenen Files (siehe „Offene Punkte"). Hier festgehalten sind die geklärten Produkt-Entscheidungen, damit nichts verloren geht.

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

## Design (Skizze — Detail folgt vor Umsetzung)

- **DB:** `developer_accounts`: `tierId text references tiers(id)` (onDelete-Verhalten klären: `set null`), `plan`-Spalte + Check-Constraint entfernen. `api_clients`: `requestsPerMinute`/`requestsPerDay` → nullable, Check-Constraints (`> 0`) auf „null oder > 0" anpassen. Zwei Migrationen.
- **Backend:** developer-account-Typen/Adapter/Route (`tierId` statt `plan`); api_client-Typen/Adapter/Route (nullable Override); effektive-Limit-Auflösung im api-access-repository (Join client → account → tier) + `authenticatePublic`.
- **Dashboard:** `TierDropdown`; `DeveloperDetailPage` (Dropdown + veraltet-Badge); `DeveloperAccountsPage` (plan-Spalte → Tier-Name + veraltet-Badge); `ClientDetailPage` (Override + Custom-Badge); i18n.
- **Enforcement-Tests:** effektive Limits (override gewinnt; null erbt Tier), disabled-Tier-Zuweisung bleibt.

## Offene Punkte (vor Umsetzung zu verifizieren/lesen)

- `api-access-repository.ts` `findActiveApiClientByTokenHash` + `ApiClient`-Typ (wie `resolved.client` entsteht; wo effektive Limits eingehängt werden).
- `developer-repository.ts` + Developer-Account-Adapter/Route (plan → tierId-Umbau).
- `ClientDetailPage.tsx` (aktuelle Traffic-Edit-Felder).
- Rate-Limiter-Verhalten bei Override-Wechsel (`DynamicRateLimiter`-Key = client.id — Änderung greift ab nächstem Fenster; ok).
- Migrationsreihenfolge: Free-Tier muss existieren, bevor `developer_accounts.tierId` backfillt.

## Checklist

- [ ] Detail-Design + „Verified facts" ergänzt (offene Punkte gelesen/verifiziert)
- [ ] `developer_accounts`: `tierId`-FK + Migration (`plan`→Free-Tier backfill, plan/Constraint entfernen)
- [ ] `api_clients`: Traffic-Felder nullable + Migration + Constraint-Anpassung
- [ ] Backend: developer-account (`tierId`) + api_client (Override) Typen/Adapter/Route
- [ ] Effektive-Limit-Auflösung (`override ?? tier`) im repository + `authenticatePublic`; stale-Kommentar entfernt
- [ ] `TierDropdown`-Component (nur enablete wählbar; zugewiesenes disabletes Tier weiterhin sichtbar)
- [ ] `DeveloperDetailPage`: TierDropdown + „nicht mehr aktives Tier"-Badge
- [ ] `DeveloperAccountsPage`: Tier-Name-Spalte + veraltet-Badge
- [ ] `ClientDetailPage`: Override-Felder + „Custom"-Badge
- [ ] i18n (DE/EN)
- [ ] Tests: effektive Limits (override/inherit), disabled-Zuweisung bleibt, Enforcement
- [ ] Gates grün + kleine logische Commits (auf User-Freigabe)
