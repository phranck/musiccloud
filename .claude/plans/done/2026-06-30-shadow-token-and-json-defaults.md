# Drop-Shadow-Token + JSON als neue Defaults

Plan-Nr.: MC-076

**Preface:** Phase B zur Prototype-Schlagschatten-Arbeit. Der User hat im Prototyp die globale Drop-Shadow-Geometrie getunt und das volle Design-Token-JSON geliefert mit der Ansage „nimm das als default settings". Zwei Teile: (1) die **neue `shadow`-Single-Group** durch die ganze Token-Pipeline verdrahten (Schema → Parser → `designTokensCss` → `glass.css`-Rezeptur → Dashboard-Import deckt `parseDesignTokens` ab), (2) die **Default-Werte** an das JSON angleichen, wo sie driften.

**Vorbild:** Die `cover`-Single-Group (mode-unabhängig, `cover: { cover: CoverFields }`) ist das exakte Muster für `shadow`.

## Verifizierter Diff (parseDesignTokens(JSON) vs DESIGN_TOKENS_DEFAULTS, 0 Parser-Fehler)

**24 Material-Diffs** (alles andere — text, vfd, footer, cover, backdrop, übrige glass-Flächen — matcht bereits):

- **paddings (7):** `--mc-pad-card` 12→10, `--mc-pad-header` 10→14, `--mc-pad-header-b` 0→12, `--mc-pad-artist` 6→10, `--mc-pad-track` 3→4, `--mc-pad-tracktime` 8→14, `--mc-pad-event-y` 4→10
- **glass (7):** card.night.tintTop `#232323`→`#354046`, card.night.tintBottom `#232323`→`#293137`, card.night.rim 0.07→0.03, button.night.rim 0.06→0.03, navTrack.night.tintTop `#000000`→`#004f6f`, navTrack.night.tintBottom `#000000`→`#004f6f`, navTrack.night.opacity 0.28→0.32
- **skylink (4):** day.color `#06324a`→`#fff800`, day.decoColor `#28a8d8`→`#fff800`, day.thickness 1.5→0.25, night.thickness 1.5→0.25
- **cardlink (6):** day.color `#06324a`→`#fefcdd`, day.decoColor `#28a8d8`→`#fff800`, day.thickness 1.5→0.25, day.offset 2.5→3.5, night.thickness 1.5→0.25, night.offset 2.5→3.5

**Neu: `shadow`-Gruppe** = `{ offsetX: 0, offsetY: 15, blur: 21, color: "#000000" }`.

**Shader (Nachthimmel) ausgeklammert:** Das JSON enthält auch Shader-Params (z.B. `fpsCap` 8 vs Default 7, `renderScale` 0.7). Separates Subsystem (`SHADER_DEFAULTS`/`NIGHT_SKY_DEFAULTS`) mit Perf-/Optik-Folgen — NICHT Teil dieses Plans; mit User klären, ob die auch als Default sollen.

## Implementation

### G1 — Schema: `shadow`-Single-Group (`packages/shared/src/design-tokens.ts`)
- `ShadowFields` Interface (offsetX, offsetY, blur: number; color: string) — analog `CoverFields` (`:212`).
- `DesignTokens`: `shadow: { shadow: ShadowFields }` (nach `cover: { cover: CoverFields }` `:325`).
- `SHADOW_DEFAULTS: ShadowFields = { offsetX: 0, offsetY: 15, blur: 21, color: "#000000" }` (analog `COVER_DEFAULTS` `:851`).
- `DESIGN_TOKENS_DEFAULTS`: `shadow: { shadow: SHADOW_DEFAULTS }` (nach `cover: { cover: COVER_DEFAULTS }` `:894`).
- `SHADOW_FIELD_SPECS: Record<keyof ShadowFields, FieldSpec>` (offsetX/Y: number −80..80; blur: number 0..200; color: color) — analog `COVER_FIELD_SPECS` `:956`.
- `parseDesignTokens`: `const shadow = sanitizeFields(rawObj.shadow?.shadow, SHADOW_DEFAULTS, SHADOW_FIELD_SPECS, "shadow.shadow", errors)` (analog cover `:1210-1216`); Return-Objekt `shadow: { shadow }` (nach `cover: { cover }` `:1251`).

### G2 — Material-Defaults an JSON angleichen (`design-tokens.ts`)
- `GLASS_DEFAULTS`: card.night (tintTop/tintBottom/rim), button.night.rim, navTrack.night (tintTop/tintBottom/opacity) — die 7 glass-Diffs.
- `PADDING_DEFAULTS` (bzw. die Paddings-Default-Quelle): die 7 paddings-Diffs.
- `SKYLINK_DEFAULTS` / `CARDLINK_DEFAULTS`: die 4 + 6 link-Diffs.

### G3 — Emission (`apps/frontend/src/lib/designTokensCss.ts`)
- Nach dem cover-Block (`:221-228`): `--mc-shadow-x`/`-y`/`-blur` (px) + `--mc-shadow-rgb` (rgb-Triplet aus `shadow.color`). Helper für hex→"r,g,b" (analog `toRgba`-Parsing).

### G4 — `glass.css`
- `:root`-Seed: `--mc-shadow-x: 0px; --mc-shadow-y: 15px; --mc-shadow-blur: 21px; --mc-shadow-rgb: 0,0,0;`.
- Box-Shadow-Rezeptur (die `0 12px 40px rgba(0,0,0, var(--_sh))`-Zeilen) → `var(--mc-shadow-x) var(--mc-shadow-y) var(--mc-shadow-blur) rgba(var(--mc-shadow-rgb), var(--_sh))` (identisch zum Prototyp).
- Die 7 glass-Seed-Diffs (`--card-night-*`, `--button-night-rm`, `--navTrack-night-*`) + ggf. paddings/skylink/cardlink-Seeds, falls in glass.css geseedet.

### G5 — Prototyp (`mockups/frontend-prototype.html`)
- `SHADOW_DEFAULTS` → `mkShadow(0, 15, 21, "#000000")` (war 0/12/40). Restliche G_DEFAULTS matchen das JSON bereits (Export-Quelle).

### G6 — Tests + Gates
- `design-tokens.test.ts`: `shadow`-Parse + Default; ggf. Legacy-Robustheit (fehlender `shadow`-Key → Default).
- `designTokensCss.test.ts`: `--mc-shadow-*`-Emission.
- Gates: shared tsc, Frontend `astro check`, Biome, Doctor, Vitest.

## Live-Hinweis
Die Live-Site rendert den **DB-persistierten** `design_tokens`-Blob (überschreibt Code-Defaults). Damit das JSON live wirkt, fügt der User es im **Dashboard** ein (Schema-Erweiterung macht `shadow` import-fähig). Code-Defaults = Fresh-Install-/Fallback-Baseline + Prototyp-Referenz.

## Checkliste

- [x] G1 `shadow`-Single-Group im Schema (Interface, Type, Default, Spec, parse, return)
- [x] G2 24 kanonische Defaults in `design-tokens.ts` an JSON angeglichen (paddings 7/glass 7/skylink 4/cardlink 6)
- [x] G3 `designTokensCss` emittiert `--mc-shadow-*` (+ `rgbTriplet`-Helper)
- [x] G4 `glass.css` `--mc-shadow-*`-Seed + Box-Shadow-Rezeptur migriert + die 7 glass-`:root`-Fallback-Seeds (`--card-night-*`, `--button-night-rm`, `--navTrack-night-*`) an JSON angeglichen. (Minimaler Rest: skylink/cardlink-*inline*-`var()`-Fallbacks `#06324a`/`#28a8d8` — reiner No-JS-Link-Farb-Fallback, nicht Teil der gescopten 7.)
- [x] G5 Prototyp `SHADOW_DEFAULTS` 0/15/21
- [x] G6 Tests (shadow parse `design-tokens.test`, shadow emit `designTokensCss.test`) + alle Gates grün (shared 53, frontend 313, tsc/astro check 0, Doctor 0, Biome 870)
- [x] Shader-Defaults: `fpsCap` 7→8 in `SHADER_DEFAULTS` + `NIGHT_SKY_DEFAULTS` + PINNED-Guard + 2 BackgroundScene-Asserts + Component-Doc. `dayness` 0 bleibt (mode-owned, Nacht-Start by design, inert).
- [x] Alle Code-Referenzen verifiziert (Cover-Vorbild, 24 Diffs gegen dist)
- [x] Commit — committet (`3619b814`)

## Verified facts

- `plans next` → MC-076 (2026-06-30).
- Cover-Vorbild: `CoverFields` `design-tokens.ts:212`, `DesignTokens.cover` `:325`, `COVER_DEFAULTS` `:851`, DEFAULTS `:894`, `COVER_FIELD_SPECS` `:956`, parse `:1210-1216`, return `:1251`. `sanitizeFields` `:1042`.
- designTokensCss cover-Emission `:221-228` (`tokens.cover.cover`).
- 24 Diffs via `node` gegen `packages/shared/dist/design-tokens.js` (`parseDesignTokens` 0 Fehler) — siehe Diff-Block oben.
- Prototyp-`shadow`-Pipeline (Phase A) bereits drin: `SHADOW_GROUPS`/`SHADOW_FIELDS`/`applyShadow`/`buildShadowControls`, Box-Shadow-Rezeptur auf `--mc-shadow-*`, Export `shadow: shadowCfg`. `SHADOW_DEFAULTS` dort noch 0/12/40 → auf 0/15/21 ziehen.

## Abgeschlossen (2026-07-04)

Checkliste 100 %, Code committet (`3619b814`) und Gates grün; vom User abgenommen. Nach `done/` verschoben auf ausdrückliche User-Ansage vom 2026-07-04.
