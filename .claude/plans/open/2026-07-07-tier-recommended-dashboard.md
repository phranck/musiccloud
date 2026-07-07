# Tier `recommended`-Flag — Dashboard-Editor

Plan-Nr.: MC-107

## Preface

Teil 2 von 3 des Features „recommended-Tier". Baut auf MC-106 (Backend) auf: die API liefert und
akzeptiert dann `recommended`. Schwesterplan MC-108 behandelt die Pricing-Seite. Dieser Plan
bringt das Flag in den Dashboard-Tier-Editor und die Tier-Tabelle.

**Abhängigkeit:** MC-106 muss stehen (DTO/Route liefern `recommended`).

## Ziel

Im Tier-Editor (Dialog) ein „Recommended"-ToggleSwitch; in der Tier-Tabelle ein „Recommended"-Badge
am empfohlenen Tier. Der Toggle ist ein **freier** Toggle (kein Lock): an = dieses Tier empfehlen
(Backend räumt die anderen ab), aus = nicht empfohlen. Höchstens eines ist empfohlen — das erzwingt
das Backend (MC-106); die Liste refetcht nach dem Speichern und spiegelt den Zustand.

## Design

- **DTO** (`apps/dashboard/src/features/developer/api.ts`): `recommended: boolean` in `TierResponse`
  (@142) und in den Create-/Update-Input-Feldlisten (Union-Picks @174-181 und @198-205), analog zu
  `enabled`/`attributionRequired`.
- **Editor** (`apps/dashboard/src/features/developer/TierEditorPage.tsx`):
  - Form-State `recommended: boolean` (Default `false`, @50/57-Muster), `OpenEdit` mappt
    `action.tier.recommended` (@67/74-Muster).
  - Neuer `ToggleSwitch` im Dialog nach dem Muster von `enabled` (@231, `checked={form.enabled}`):
    id `tier-recommended`, `checked={form.recommended}`, onChange dispatcht `SetForm` mit
    `{ recommended: ... }`.
  - Label/Hilfetext englisch (Dashboard-UI): z. B. „Recommended" / „Highlight this tier on the pricing page".
  - Beim Speichern `recommended` in den Create/Update-Payload aufnehmen (bestehendes Submit-Handling).
- **Tabelle** (Tier-Liste, `TierEditorPage.tsx` Table-View): kleines „Recommended"-Badge in der
  Name-Zelle, wenn `tier.recommended` — gleiche Badge-Mechanik wie das bestehende disabled-Badge.
- **react-doctor-Prävention**: TSX-Datei — Accessibility (Toggle-Label/`htmlFor`), keine Inline-
  Domain-Literale, stabile Props beachten (`react-doctor-prevention.md`, projektlokale Doctor-Plugins).

## Task-Checkliste

- [x] DTO: `recommended` in `TierResponse` + in die Create-/Update-Input-Feldlisten (api.ts)
- [x] Editor Form-State: `recommended` + Default `false` + `OpenEdit`-Mapping (TierEditorPage.tsx)
- [x] `ToggleSwitch` „Recommended" im Dialog (Muster `enabled`), `SetForm`-Dispatch
- [x] Submit: `recommended` fließt via `toSubmitBody` in Create/Update-Payload (Spread durch die Hooks)
- [x] Tabelle: „Recommended"-Badge (emerald) in der Name-Zelle des empfohlenen Tiers; i18n-Keys `colRecommended`/`tierRecommendedBadge` (de/en)
- [x] Gates: dashboard `typecheck` grün, Biome clean, `doctor:diff` 0 Issues. `test:run` NICHT lauffähig — vorbestehender vitest-Env-Bug (`Cannot set property testPath ... getter`) failt die GESAMTE Dashboard-Suite (per Stash-Vergleich als pre-existing verifiziert), keine MC-107-Regression
- [x] All code references verified (functions, scripts, paths, env vars, package-manager commands)

## Verifizierte Fakten

- DTO `TierResponse` @ `apps/dashboard/src/features/developer/api.ts:142`; Vergleichsfelder `attributionRequired`:147, `enabled`:158; Input-Feld-Unions @174-181 und @198-205 (grep)
- Editor (`TierEditorPage.tsx`): `ToggleSwitch`-Import @19 (`@/components/ui/ToggleSwitch`); Form-Felder `attributionRequired`:34/`enabled`:41; Defaults @50/57; `OpenEdit`-Mapping @67/74; Reducer-Actions `OpenCreate`/`OpenEdit`/`SetForm` @101-114; `ToggleSwitch`-Usage @231 (`checked={form.enabled}`) (grep)
- Projektlokale Doctor-Policy: `doctor.config.ts`, `packages/react-doctor-plugin-domain-literals` (react-doctor-prevention.md)
