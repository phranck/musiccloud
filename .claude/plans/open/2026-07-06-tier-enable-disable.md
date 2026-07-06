# Tier enable/disable + Disable-Reason

Plan-Nr.: MC-099

## Preface / Kontext

Teil 1 des Tier-Lifecycle-Features (User-Wunsch 2026-07-06). Tiers sollen deaktivierbar sein: ein `enabled`-Flag + ein `disableReason`-Freitext. Disablete Tiers werden auf der öffentlichen Pricing-Seite weiterhin gezeigt, aber **markiert** und mit **farblich hervorgehobenem Grund**. Die Sperre „nur enablete Tiers sind zuweisbar" gehört zur Zuweisung und liegt in **MC-100** (Zuweisung + Key-Override + Enforcement); dieser Plan liefert nur die Flags, den Editor und die Pricing-Markierung.

`isPublic` (frühere Idee) ist verworfen — Custom-Limits werden in MC-100 über Key-Overrides gelöst, nicht über nicht-öffentliche Tiers.

Baut direkt auf [MC-098](2026-07-06-tier-description.md) auf (gleicher Tier-Pfad: Schema → Adapter → Route → Editor → Pricing).

## Ziel

1. `tiers.enabled` (bool, default `true`) + `tiers.disableReason` (text, default `''`).
2. Backend-Typen/Adapter/Route mappen + validieren beide Felder.
3. Tier-Editor: Enable/Disable-Toggle + Reason-Feld (Reason nur relevant/aktiv, wenn disabled).
4. Pricing-Card: disablete Tiers optisch markiert (gedimmt + Badge) + `disableReason` farblich (Warnton).
5. Öffentliche API liefert beide Felder weiter (kein Filter — disablete Tiers bleiben sichtbar zum Markieren).

## Design

### DB / Migration (Drizzle)

`apps/backend/src/db/schemas/postgres.ts`, tiers-pgTable: nach `description` ergänzen:

```ts
enabled: boolean("enabled").notNull().default(true),
disableReason: text("disable_reason").notNull().default(""),
```

NOT NULL + Default → Bestands-Tiers automatisch `enabled=true` / `disableReason=''`. Danach `pnpm db:generate` → nächste `0060_*.sql`; Boot-Runner appliziert.

### Backend

- `tiers-repository.ts`: `Tier.enabled: boolean` + `Tier.disableReason: string`; in `TierCreateData`/`TierUpdateData` beide optional.
- `adapters/postgres-tiers.ts`: `TierRow` (`enabled`, `disable_reason`), `toTier`-Mapping, INSERT-Spalten/Params, dynamisches UPDATE.
- `routes/admin-tiers.ts`: `enabled` (bool) + `disableReason` (Freitext, Max-Länge analog description, z.B. `MAX_TIER_DISABLE_REASON_LENGTH = 200`) übernehmen/validieren.
- `routes/public-tiers.ts`: **kein Change** (Felder fließen mit; disablete Tiers bleiben in der Liste).

### Dashboard-Editor

- `features/developer/api.ts`: `TierResponse.enabled`/`.disableReason` + Create/Update-Bodies.
- `features/developer/TierEditorPage.tsx`: `TierFormData` + `EMPTY_FORM` (`enabled: true`, `disableReason: ""`), `toSubmitBody`, Reducer `OpenEdit`; im `TierFormDialog` ein Enabled-Toggle (Checkbox, Muster wie `attributionRequired`) + ein Reason-`<textarea>` (mit `formTextareaClass`), das nur bei `!enabled` sichtbar/aktiv ist; in der Tabelle ein dezentes „Disabled"-Badge in der name-Cell.
- `i18n/messages.ts`: Keys `colEnabled` (DE „Aktiv" / EN „Enabled"), `colDisableReason` (DE „Deaktivierungsgrund" / EN „Disable reason"), `tierDisabledBadge` (DE „Deaktiviert" / EN „Disabled").

### Developer-Portal / Pricing

- `pages/pricing.astro`: `TierDto.enabled`/`.disableReason`; disablete Card visuell markieren (reduzierte Opazität + Badge „Unavailable") und `disableReason` als farblich hervorgehobenen Hinweis (Warnton, token-getrieben — bestehende Farb-Utilities der developer-App nutzen). Enablete Cards unverändert.

### Vorentscheidungen (Technik)

`enabled` bool NOT NULL default true; `disableReason` text NOT NULL default '' (Max-Länge 200, Server + Client `maxLength`); Reason-Feld im Editor nur bei disabled aktiv; Pricing zeigt disablete Tiers weiter (markiert), filtert sie nicht raus.

## Verified facts (Plan-write-time, 2026-07-06, alle diese Session per Read/Edit)

- tiers-pgTable inkl. `description` (MC-098): `schemas/postgres.ts` ~1784-1808; letzte Migration `0059_melodic_hercules.sql`.
- `Tier`/`TierCreateData`/`TierUpdateData` (+ `description`): `tiers-repository.ts:10-49`.
- Adapter `postgres-tiers.ts`: `TierRow`, `toTier`, INSERT (jetzt 9 Params inkl. description), dyn. UPDATE.
- Admin-Route `admin-tiers.ts`: manuelle Validierung, `HEX_COLOR_RE`, `MAX_TIER_DESCRIPTION_LENGTH = 500`; Create + Patch.
- `public-tiers.ts`: `return repo.listTiers()`, kein DTO/Filter.
- Dashboard `api.ts`: `TierResponse` (+ description), `createTier`/`updateTier`-Picks.
- `TierEditorPage.tsx`: `TierFormData`/`EMPTY_FORM`/`toSubmitBody`/Reducer `OpenEdit`/`TierFormDialog` (Checkbox-Muster `attributionRequired` 230-240, `formTextareaClass` für description), `useTierColumns` name-Cell mit Swatch.
- `pricing.astro`: `TierDto` (+ description), Card-Markup (Name/Preis-Zeile, description-Absatz, requests-Block, attribution), EN-only, SSR-fetch + Fallback.
- `messages.ts` developer-Namespace: `colDescription`/`colColor` (Interface + DE + EN).
- `formTextareaClass` in `shared/ui/FormPrimitives.tsx` (MC-098).
- `plans next` = MC-099.

## Checklist

- [x] Alle Code-Referenzen vor Execute re-verifiziert (frisch aus MC-098, gleiche Session)
- [x] Schema: `enabled` + `disableReason` in tiers-pgTable
- [x] Migration `0060_yielding_mastermind.sql` (ADD COLUMN enabled/disable_reason), Boot-Apply + `/api/v1/tiers` liefert `enabled`/`disableReason` verifiziert
- [x] `Tier`/`TierCreateData`/`TierUpdateData` um `enabled`/`disableReason`
- [x] Adapter `postgres-tiers.ts`: Row/toTier/INSERT ($10/$11)/UPDATE mappen beide Felder
- [x] Admin-Route: `enabled` + `disableReason` (`MAX_TIER_DISABLE_REASON_LENGTH = 200`)
- [x] Dashboard `api.ts`: `TierResponse` + Create/Update-Bodies
- [x] `TierEditorPage`: Enabled-Toggle + bedingtes Reason-`<textarea>` + Reducer/Form + „Disabled"-Badge (amber) in name-Cell
- [x] i18n: `colEnabled` / `colDisableReason` / `tierDisabledBadge` (DE + EN)
- [x] `pricing.astro`: `TierDto` + disabled-Card gedimmt + „Currently unavailable" + Reason in Gold (`text-gold`)
- [x] Tests: `admin-tiers.test.ts` (freeTier enabled/disableReason, disabled-create → 201, reason >200 → 400) — Backend 1347
- [x] Gates grün: Typecheck (0/0/0), `pnpm lint` (976), `doctor:diff` (0), Tests Backend 1347 / Frontend 313 / Dashboard 61/61
- [ ] Kleine logische Commits (auf User-Freigabe)
