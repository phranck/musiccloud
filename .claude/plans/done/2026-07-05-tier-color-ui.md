# Tier-Farbe — Dashboard-Editor & Preisseite

Plan-Nr.: MC-097

## Preface / Kontext

Folgeplan zu [MC-096](2026-07-05-tier-color-backend.md): Nachdem `color` in DB/Backend/öffentlicher API vorhanden ist, kommt die UI. Im Dashboard wird die Farbe per Color-Picker gesetzt und als Swatch in der Tabelle angezeigt; auf der Developer-Portal-Preisseite als Akzent auf den Tier-Cards.

**Prerequisite:** MC-096 gemerged (öffentliche `/api/v1/tiers` + Admin-CRUD liefern/akzeptieren `color`).

## Ziel / Scope

1. Dashboard: `TierResponse.color` + Create/Update-Bodies; Color-Picker im Tier-Formular; Farb-Swatch vor dem Namen in der Tabelle.
2. Developer-Portal-Preisseite: `TierDto.color` + Farb-Akzent (Swatch vor dem Tier-Namen, konsistent zum Dashboard).

## Design

### Dashboard

- `apps/dashboard/src/features/developer/api.ts`:
  - `TierResponse`: `color: string`.
  - `createTier`-Body: `color` in den `Partial<Pick<…>>`-Teil.
  - `updateTier`-Body: `color` in den `Partial<Pick<…>>`-Teil.
- `apps/dashboard/src/features/developer/TierEditorPage.tsx`:
  - `TierFormData.color: string`; `EMPTY_FORM.color = "#64748b"`.
  - `toSubmitBody`: `color: data.color` mitgeben.
  - Reducer `OpenEdit`: `color: action.tier.color`.
  - `TierFormDialog`: neues Feld „Color" mit nativem `<input type="color">` (Swatch) + Hex-Anzeige daneben; `onFormChange({ color: e.target.value })`.
  - `useTierColumns` (name-Cell): kleiner Swatch vor dem Namen — `<span className="size-3 rounded-full" style={{ backgroundColor: a.color }} aria-hidden />` + Name. Inline-Style ist hier legitim (dynamischer Wert, keine Tailwind-Klasse möglich); der Wert ist backend-validiertes Hex.

### Developer-Portal-Preisseite

- `apps/developer/src/pages/pricing.astro`:
  - `TierDto`: `color: string`.
  - Card-Heading (Zeile 113-114): Swatch vor `{tier.name}` — `<span class="size-3 rounded-full shrink-0" style={\`background-color:${tier.color}\`} aria-hidden="true"></span>`. Validiertes Hex → Inline-CSS unbedenklich.

### Sicherheit

Keine zusätzliche Client-Validierung nötig: `color` ist am Backend-Write-Boundary (MC-096) streng als `#RRGGBB` validiert, daher als Inline-CSS-Wert safe.

## Verified facts (Plan-write-time, 2026-07-05)

- Dashboard `TierResponse`: `apps/dashboard/src/features/developer/api.ts:123-133` (id/name/requestsPerMinute/requestsPerDay/attributionRequired/price/sortOrder/createdAt/updatedAt). `createTier` = `Pick<…,"name"|"requestsPerMinute"|"requestsPerDay"> & Partial<Pick<…,"attributionRequired"|"price"|"sortOrder">>`; `updateTier` = `Partial<Pick<…>>`. (Read)
- `TierEditorPage.tsx` (in dieser Session neu gebaut): `TierFormData`, `EMPTY_FORM`, `toSubmitBody`, Reducer `OpenEdit`, `TierFormDialog`, `useTierColumns`. (Session-Kontext)
- pricing.astro: `TierDto` (17-25, noch kein color), Card-Markup 112-135, Heading `<h3 …>{tier.name}</h3>` (114), rendert `size-N`/`text-fg`-Tokens, Phosphor-Icons. Fallback bei Backend-unreachable. (Read)
- Farbe backend-validiert (MC-096) → Inline-CSS safe. (MC-096)

## Checklist

- [x] Alle Code-Referenzen vor Execute re-verifiziert (Pfade, Zeilen)
- [x] Dashboard `api.ts`: `TierResponse.color` + Create/Update-Bodies
- [x] Dashboard `TierEditorPage`: `TierFormData.color` + `EMPTY_FORM` + `toSubmitBody` + Reducer `OpenEdit`
- [x] Dashboard `TierFormDialog`: Color-Picker-Feld (`<input type="color">` + Hex-Anzeige)
- [x] i18n-Key `colColor` (developer-Namespace, Interface + DE „Farbe" + EN „Color") ergänzt
- [x] Dashboard `useTierColumns`: Swatch vor dem Namen in der name-Cell
- [x] Preisseite `pricing.astro`: `TierDto.color` + Swatch im Card-Heading
- [x] Gates grün: Dashboard `typecheck`, developer astro check (0 Fehler), `pnpm lint` (976), `pnpm run doctor:diff`/full (0 Issues), Dashboard `test:run` (61/61)
- [x] Kleine logische Commits (auf User-Freigabe)
