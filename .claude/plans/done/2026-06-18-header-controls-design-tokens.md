# Header-Controls als eigene Design-Token-Gruppe

Plan-Nr.: MC-042

**Datum:** 2026-06-18
**Branch:** day-night

## Ziel

Die drei Header-Controls — Navigation (`HeaderNavMenu`), Day/Night-Switcher und
Sprachumschalter (beide `VerticalSegmentedControl`) — bekommen **eine eigene,
dedizierte Token-Gruppe**, damit ihre Tag/Nacht-Farben unabhängig vom restlichen UI
justierbar sind. Im Prototyp entsteht dafür eine **eigene Sektion „Header Controls"**.
Alles landet im exportierten JSON und wird über die bestehende Pipeline
(Backend-Validierung → Dashboard → Frontend-SSR) sauber eingelesen und angewandt.

### Scope (vom User bestätigt)

1. **Neue dedizierte Tokens** (nicht die geteilten `segTrack`/`segIndicator`/`button`).
2. **Flächen + Text** justierbar (Track-HG, Indicator/Active-HG, Label-Text normal + bright), je Tag/Nacht.
3. **Ein gemeinsames Set** für alle drei Controls (sie sehen identisch aus).

## Befund: warum dedizierte Tokens nötig sind

`segTrack`/`segIndicator` teilen sich die Header-Controls mit `EmbossedSegmentedControl`
(genutzt von `EmbossedCard.SegmentedControl` in `PageOverlayContent.tsx:221,272` — die
Overlay-Seiten Info/Help). `button`-Text ist app-weit. Justierung der bestehenden Tokens
würde also fremdes UI mitverändern → eigene `nav*`-Tokens.

## Token-Modell

Neue Glass-Controls: **`navTrack`** (recessed, der Track hinter Hamburger/Switchern),
**`navIndicator`** (raised, aktive Zelle / Hamburger-Icon / Item-Hover).
Neue Text-Surface: **`nav`** (Label-/Item-Text, normal + bright).
Prefix `nav` ist konsistent mit der bereits vorhandenen `.mc-nav-item`-Klasse.

**Defaults = aktuelle Werte** (visueller Status quo bleibt):
- `navTrack` = `segTrack` (day `#00364a`@0.32 · night `#000000`@0.28)
- `navIndicator` = `segIndicator` (day `#94e3fe`@0.35 · night `#94e3fe`@0.20, blur 2, br 0.42, rim 0.08)
- `nav` Text = `button`-Text (`mkTextSurface(BARLOW, 15, 200, None)`)

## Die Pipeline ist generisch → minimale Kern-Änderungen

Parser, CSS-Emitter, Backend und Dashboard loopen alle generisch über die Token-Keys.
Neue Keys in den Enums + DEFAULTS werden automatisch geparst, emittiert, validiert,
exportiert und gespeichert. **Kein** Umbau an Parser / `designTokensToCss` / Backend / Dashboard.

## Schritte

### 1. `packages/shared/src/design-tokens.ts`
- `GlassControl` (@35): `NavTrack: "navTrack"`, `NavIndicator: "navIndicator"` ergänzen.
- `GLASS_DEFAULTS` (@435): `navTrack` (Kopie von `segTrack`@540), `navIndicator` (Kopie von `segIndicator`@566).
- `TextSurface` (@47): `Nav: "nav"` ergänzen.
- `TEXT_SURFACE_DEFAULTS` (@655): `nav: mkTextSurface(BARLOW, 15, 200, TextCapitalization.None)` (= `button`@658).
- Parser-Loops (@1027 glass, @1039 text) + `GLASS_FIELD_SPECS`/`TEXT_SURFACE_FIELD_SPECS`: **generisch, keine Änderung**.

### 2. `apps/frontend/src/styles/glass.css`
- `.mc-glass-nav-track` (mirror `.mc-glass-seg-track`@467 + recessed-box-shadow-Gruppe @519, liest `--navTrack-*`).
- `.mc-glass-nav-indicator` (mirror `.mc-glass-seg-indicator`@479, liest `--navIndicator-*`).
- `.mc-txt-nav-bright` / `.mc-txt-nav-normal` (mirror `.mc-txt-button-*`@287-303, liest `--text-nav-*`).
- `.mc-nav-item:hover` Color-Var von `--text-button-bright-*` → `--text-nav-bright-*` umstellen.

### 3. Komponenten (die 3 Controls)
- `VerticalSegmentedControl.tsx`: `mc-glass-seg-track`→`mc-glass-nav-track` (@127); aktive Zelle `mc-glass-seg-indicator mc-txt-button-bright`→`mc-glass-nav-indicator mc-txt-nav-bright`; inaktiv `mc-txt-button-normal`→`mc-txt-nav-normal` (@123-124). Deckt Day/Night + Sprache ab (beide nutzen diese Komponente).
- `HeaderNavMenu.tsx`: Trigger/Track/Dropdown/Items von `mc-glass-seg-*`→`mc-glass-nav-*` und `mc-txt-button-*`→`mc-txt-nav-*`.
- `EmbossedSegmentedControl.tsx`: **unverändert** (Overlay-Seiten behalten `segTrack`/`segIndicator`).

### 4. Test-Anpassung
- `DayNightSwitcher.test.tsx:102`: `.mc-glass-seg-track` → `.mc-glass-nav-track`.

### 5. `frontend-prototype.html` — eigene Sektion „Header Controls"
- `G_CONTROLS` (@2886): `navTrack`/`navIndicator` mit Marker `header: true` ergänzen.
- `G_DEFAULTS` (@2913): `navTrack` (= `segTrack`@2921), `navIndicator` (= `segIndicator`@2922).
- `TYPO_SURFACES` (@3081): `nav` mit `header: true`.
- `TYPO_DEFAULTS` (@3132): `nav` (= `button`-Typo).
- `buildGlassControls` (@3920): Liste auf `!header` filtern (nav nicht in Glass-Sektion).
- `buildTypographyControls` (@3927): `nav` aus Text-Sektion ausfiltern.
- Neue `buildHeaderControls()`: zwei `buildTuneSection`-Aufrufe (@3922 Vorlage) in `#headercontrols-controls` — die nav-Glass-Controls (G_FIELDS) + die nav-Text-Surface (TYPO_FIELDS).
- Neue Sektion-HTML `<div class="sec" id="sec-headercontrols">` vor `<div id="controls">`@1260.
- `wireStaticSections` (@3965): `"sec-headercontrols"` ergänzen.
- CSS `.nav-track`/`.nav-indicator` (mirror `.seg-track`@660 / `.seg-indicator`@671, lesen `--navTrack-*`/`--navIndicator-*`).
- **Live-Preview:** kompaktes Header-Mock in der Sektion — `.nav-track` mit `.nav-indicator`-Zelle + zwei Item-Zeilen (normal + Hover) mit `--text-nav-*` — damit Track-HG, Active-HG und Item-Text sichtbar justierbar sind.
- `applyGlass`@3567 / `applyTypography`@3337 / Export@1950 / `buildGlassState`@3515: **generisch, keine Änderung** (loopen über alle Keys → nav auto-inklusive).

## Was NICHT geändert wird (generisch)
- `apps/frontend/src/lib/designTokensCss.ts` (@123 glass-Loop, @144 text-Loop) — auto-emittiert `--navTrack-*`, `--navIndicator-*`, `--text-nav-*`.
- `apps/backend/src/routes/site-settings.ts:75` — generisches `parseDesignTokens`.
- `apps/dashboard/.../DesignSettingsPage.tsx` — generische Paste-JSON-Textarea + `parseDesignTokens`-Validierung.

## Gates / Verifikation
- [ ] `pnpm --filter @musiccloud/shared` Typecheck grün (neue Enum-Member + Defaults typen).
- [ ] Frontend `astro check` 0 errors · `pnpm lint` clean · `pnpm doctor:diff` 0.
- [ ] Frontend-Tests grün (inkl. angepasstem `DayNightSwitcher.test`); `designTokensCss.test` weiterhin grün.
- [ ] Clean-State-Check (monorepo-package-config): `pnpm install` + `pnpm test` ohne separaten Build.
- [ ] Browser (agent-browser): Header-Controls rendern unverändert (Defaults = alte Werte); im Prototyp die neue Sektion justiert Track/Indicator/Text live.
- [ ] Prototyp-Export enthält `glass.navTrack`, `glass.navIndicator`, `text.nav`; durch `parseDesignTokens` round-trip-fähig.
- [ ] Alle Code-Referenzen verifiziert (Funktionen, Pfade, Var-Namen).

## Verified facts (grep/Read am Plan-Schreib-Zeitpunkt)
- `GlassControl`@35, `GLASS_DEFAULTS`@435 (`segTrack`@540, `segIndicator`@566), `TextSurface`@47, `TEXT_SURFACE_DEFAULTS`@655 (`button`@658), Parser-Loops @1027/@1039 — `packages/shared/src/design-tokens.ts` (vollständig gelesen).
- `designTokensToCss` glass-Loop @123, text-Loop @144 — generisch, nur Button-Hover-Lift @132-139 hardcoded (für nav nicht nötig) — `apps/frontend/src/lib/designTokensCss.ts` (vollständig gelesen).
- Backend generisch: `apps/backend/src/routes/site-settings.ts:75` `parseDesignTokens`.
- Dashboard generisch: `apps/dashboard/src/features/system/DesignSettingsPage.tsx:67` `parseDesignTokens` (Paste-Textarea, vollständig gelesen).
- glass.css: `.mc-glass-seg-track`@467/@519, `.mc-glass-seg-indicator`@479, `.mc-txt-button-*`@287-303, `.mc-nav-item:hover` (vorhanden, nutzt aktuell `--text-button-bright-*`).
- Prototyp: `G_CONTROLS`@2886, `G_FIELDS`@2895, `G_DEFAULTS`@2913 (`segTrack`@2921, `segIndicator`@2922), `TYPO_SURFACES`@3081, `TYPO_DEFAULTS`@3132, `buildTuneSection`-Aufrufe @3922/@3928/@3940, `applyGlass`@3567, `applyTypography`@3337, Export@1950, `buildGlassState`@3515, Sektionen-HTML @1191-1258 + `#controls`@1260, `wireStaticSections`@3965, `.seg-track`-CSS@660 / `.seg-indicator`@671.
- Geteilte Nutzung bestätigt: `EmbossedSegmentedControl` ← `EmbossedCard.SegmentedControl`@317 ← `PageOverlayContent.tsx:221,272`.
- Test-Abhängigkeit: `DayNightSwitcher.test.tsx:102` sucht `.mc-glass-seg-track`.

## Verified-Check
- [x] All code references verified (functions, scripts, paths, env vars, package-manager commands)
