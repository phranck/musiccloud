# Cover-Screen: Day/Night-Variante entfernen (Single-Mode)

Plan-Nr.: MC-074

**Goal:** Der TFT-Cover-Screen (Screen-Platte + Overlays: bg, tint, matrix, sheen, innerShadow) verliert seine Day/Night-Variante vollständig. Es gibt nur noch **einen** Satz Werte (die bisherigen **Day**-Werte). Damit entfällt die per-Frame-`color-mix(--g-dayness)`-Neuberechnung des Covers → behebt das Safari-Ruckeln beim Day/Night-Wechsel auf der Share-Page (Chrome war immer glatt, Landing immer glatt; nur die Share-Page-Cover-Layer waren der Treiber).

**Sauber-Prinzip (User, wörtlich):** „Da sollte nichts Altes übrig bleiben." Kein `night=day`-Reinpappen, sondern echter Kollaps: die `DayNight`-Hülle für `cover` fliegt aus Schema, Wiring, CSS und Prototype raus.

**Root-Cause-Beleg (Performance-Trace):** Landing-Fade in Chrome sauber (INP 40 ms, kein Paint-Insight). Ruckler nur Safari + nur Share-Page. Ursache: `--g-dayness` (auf `<html>`, pro Frame) treibt auf der Share-Page zusätzlich die Cover-Layer via `color-mix()`/`calc()` (animations.css 65-134), v.a. das 4px-Punktraster `.mc-tft-screen-matrix` — teurer Per-Frame-Paint, den Safari nicht schluckt.

**Nachtrag (2026-06-30, verifiziert):** Cover-Flatten allein machte Safari NICHT glatt — notwendig, aber nicht hinreichend. Safari wurde erst flüssig nach der **kombinierten** DOM-Reduktion: Cover-Single-Mode (dieser Plan) + nur die zur Viewport passende Share-Layout-Variante rendern statt Desktop+Mobile parallel + List/Grid-Toggle entfernt (List-only). Die eigentliche Kostenstelle ist der Per-Frame-Recalc **aller ~250 `--g-dayness`-Deps**, der mit der Share-DOM-Größe skaliert (nicht nur die Cover-Layer). Details im Memory `project_dayness_recalc_landmine`.

## Verhalten / Entscheidung

- Cover ist **mode-unabhängig** (wie `cardRadius`/`paddings` im selben Token-Modell), kein `DayNight<CoverFields>` mehr.
- Werte = die bisherigen **Day**-Werte: `bg #05070a`/1, `innerShadow 0.42`, `matrixColor #00364a`, `matrixOpacity 0.42`, `sheenLight 0.07`, `sheenShadow 0.16`, `tintColor #caf0fe`/0.15.
- Optik: der Cover-Screen sieht Tag wie Nacht gleich aus (Day-Look). Das Album-Artwork selbst ist unberührt (war nie Teil der Tokens).
- Prod-Sicherheit: ein bereits persistiertes `design_tokens`-Setting (alte `cover.cover.{day,night}`-Form) darf nicht brechen — der Parser liest die Legacy-`day`-Form und kollabiert sie auf den Single-Wert.

## Touch-Points (alle grep-verifiziert, file-disjunkt zu MC-073)

### Shipped
- **packages/shared/src/design-tokens.ts**
  - `cover: { cover: DayNight<CoverFields> }` → `cover: { cover: CoverFields }` (Z.320).
  - `COVER_DEFAULTS: DayNight<CoverFields>` → `COVER_DEFAULTS: CoverFields` = Day-Werte (Z.843-866).
  - Parser (Z.1209-1215): `sanitizeDayNight(...)` → `sanitizeFields(...)` (single); Legacy-Read: wenn `cover.cover.day` existiert, daraus lesen.
  - `CoverFields` (Z.208) + `COVER_FIELD_SPECS` (Z.961) bleiben.
- **packages/shared/src/__tests__/design-tokens.test.ts** — `tokens.cover.cover.day.tintColor` → `tokens.cover.cover.tintColor` (Z.44-48); evtl. weitere Cover-Assertions.
- **apps/frontend/src/lib/designTokensCss.ts** (Z.220-234) — nur noch `--cover-bg/-inner/-matrix/-matrix-o/-sheen-l/-sheen-s/-tint` aus `tokens.cover.cover` (kein day/night).
- **apps/frontend/src/styles/glass.css** (Z.304-317) — `:root`-Seed auf single `--cover-*` (Day-Werte).
- **apps/frontend/src/styles/animations.css** (Z.65-134) — die 5 TFT-Layer statisch `var(--cover-*)`, kein `color-mix`/`--g-dayness` mehr. **Der Fix.**

### Prototype (dev tool, `mockups/frontend-prototype.html`)
- Cover als **Single-Mode-Gruppe** nach `paddings`/`cardRadius`-Vorbild modellieren (kein Sonderfall-Hack in der generischen Day/Night-Maschinerie).
- `COVER_DEFAULTS` (Z.3428) → single `mkCover(...)` (Day-Werte), kein `{day,night}`.
- Controls-Renderer (`buildTuneSection`-Call Z.4190), `applyCover` (Z.3672), Export (Z.2090: `cover: coverCfg`), Import (Z.2138), Reset (Z.4232), `COVER_KEY`-Store: auf Single-Mode.
- Verify am Execute: wie `paddings`/`cardRadius` State/Controls/Export im Prototype gehandhabt werden (das Single-Mode-Vorbild).

### Nicht betroffen
- TftScreenParts.tsx + Tests (referenzieren nur CSS-Klassen, kein day/night-Token) — Markup bleibt (5 Layer, nur statisch gefärbt).
- Dashboard: kein eigener Cover-Code; „JSON-Import" = `parseDesignTokens` aus packages/shared → durch Schema-Änderung abgedeckt.
- Backend: nutzt denselben Parser → abgedeckt.

## Checkliste

- [x] Schema: `cover` → single `CoverFields`, `COVER_DEFAULTS` = Day-Werte
- [x] Parser: single-Read + Legacy-`day`-Read (prod-sicher); Test angepasst
- [x] designTokensCss: single `--cover-*` Emission
- [x] glass.css: single `--cover-*` Seed
- [x] animations.css: 5 TFT-Layer statisch, kein color-mix/--g-dayness (FIX)
- [ ] Prototype: Cover Single-Mode (defaults/controls/apply/export/import/reset/store) — offen, Dev-Tuner-Tool (`mockups/frontend-prototype.html`) noch nicht angepasst
- [x] Code-Referenzen verifiziert (Shipped-Seite)
- [x] Gates Shipped grün: Biome clean, tsc 0, Doctor 0, shared 27 / frontend 126 Tests
- [x] User verifiziert in Safari (Share-Page Day/Night-Wechsel glatt — bestätigt 2026-06-30 nach kombinierter DOM-Reduktion)
- [x] Commit (logischer Split, getrennt von MC-073; auf User-Ansage „den Stand committen" 2026-06-30)

## Verified facts

- `plans next` → MC-074 (2026-06-30).
- Cover-Konsumenten monorepo-weit (grep, Source ohne dist): glass.css 304-317, animations.css 65-134, designTokensCss.ts 220-234, design-tokens.ts (320/843/899/961/1209-1215), design-tokens.test.ts 44-48, prototype 3409-3432/3672/2090/2138/4190/4232. Keine Backend-/Dashboard-Sonder-Cover-Logik.
- `CoverFields` (9 Felder): bg, bgOpacity, innerShadow, matrixColor, matrixOpacity, sheenLight, sheenShadow, tintColor, tintOpacity.
- Day-Werte (Ziel): design-tokens.ts COVER_DEFAULTS.day (Z.844-854) == glass.css `--cover-day-*` (Z.304-316) == prototype mkCover day (Z.3430).
- Prototype ist generischer Day/Night-Tuner (`buildContentState` iteriert `["day","night"]`); `cardRadius`/`paddings` sind die existierenden mode-unabhängigen Vorbilder.
