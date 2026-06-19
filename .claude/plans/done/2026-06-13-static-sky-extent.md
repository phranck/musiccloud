# MC-031 — Statische Himmels-Ausdehnung (Fenster zeigt Ausschnitt)

**Status:** abgeschlossen (2026-06-13)
**Branch:** `gsap` (HEAD `acd68e2`, origin/gsap getrackt)
**Vorgänger:** MC-029 Phase 4 (Nachthimmel-Stack), MC-030 (Day-Night-Switcher, UI derzeit ausgeblendet — von diesem Plan unberührt).

## Preface

Heute rechnet die gesamte Szene (Sky-Gradient, Füllsterne, Katalogsterne, Wolken, Polaris) in `cuv`-Koordinaten, deren Einheit die **Fensterhöhe** ist. Konsequenz: Ein kleineres Fenster presst denselben Himmelsausschnitt in weniger Pixel — alles schrumpft mit.

**User-Anforderung (2026-06-13):** Die Ausdehnung des Himmels soll **statisch** sein. Fenster verkleinern / Smartphone = man sieht nur den **Ausschnitt**, den die Fenster-/Screengröße zulässt — wie ein Fenster vor einem festen Wandbild. Die virtuelle Fläche muss **etwas größer als natives 5K** (5120×2880) sein. Der Prototyp (`background-prototype.html`) wird mitgezogen.

**User-Entscheidung (AskUser, 2026-06-13) — Anker:** „An Polaris ausgerichtet, aber mit den vertikalen Settings für den Shader." → Der Ausschnitt ankert an **Polaris**, dessen Fenster-Position weiterhin die bestehenden Settings `polarisX`/`polarisY` definieren. Formel: `skyOffset = polaris01 × (skySize − viewportCss)`. Damit sitzt Polaris in JEDER Fenstergröße exakt bei polarisX/polarisY im Fenster (Sternrotation immer im Bild); Gradient, Stern- und Wolkenfeld liegen fix in der virtuellen Fläche und werden vom Fenster nur ausgeschnitten. Keine neuen Anker-Settings (YAGNI) — polarisX/polarisY übernehmen die Doppelrolle (Fenster-Position von Polaris = Anker der Fläche).

## Spec / Goal

- Neue Settings `skyWidth`/`skyHeight` (CSS-Px der virtuellen Fläche), **Default 5632×3168** (= 5K × 1.1, erfüllt „etwas größer als 5K"). Tunebar im Prototyp.
- Fenster-Resize ändert NUR den sichtbaren Ausschnitt: Sterne bleiben zueinander ortsfest und behalten ihre Pixel-Größe; Wolkenformationen behalten ihre Größe; der Gradient läuft über die virtuelle Höhe (kleines Fenster sieht nur seinen Teil).
- Polaris erscheint in jedem Fenster bei `polarisX`/`polarisY` (bestehende Semantik der Fenster-Position bleibt — die Fläche schiebt sich entsprechend unters Fenster).
- **Vignette bleibt ein FENSTER-Effekt** (fotografische Eck-Abdunklung des sichtbaren Bilds, nicht der Fläche).
- **Kein 5K-Rendering:** Es wird weiterhin nur der sichtbare Buffer gerendert (renderScale×DPR wie bisher); die virtuelle Größe ist reine Koordinaten-Transformation. GPU-Kosten ≈ unverändert.
- Fenster größer als die Fläche (8K-Monitore): graceful — Offset wird negativ, GLSL-`smoothstep` clampt den Gradient an den Endfarben, Stern-/Wolkenfelder sind prozedural unendlich, Polaris-Formel gilt unverändert.
- Prototyp: gleiche Shader-Mathematik + 2 neue Slider (skyWidth/skyHeight) + angepasste Tooltips (en/de).

## Design

### Koordinaten-Umbau (Kern)

Neue Uniforms in allen drei Programmen: `u_skySize` (vec2, CSS-Px der Fläche), `u_skyOffset` (vec2, CSS-Px), `u_pixelScale` (float, Buffer-Px pro CSS-Px). `u_resolution` (Buffer-Px des Fensters) bleibt für Vignette + NDC.

**Fragment-Shader (SKY_FRAG, CLOUD_FRAG)** — heute:
```glsl
vec2 uv = gl_FragCoord.xy / u_resolution;
float aspect = u_resolution.x / u_resolution.y;
vec2 cuv = (uv - 0.5) * vec2(aspect, 1.0);
```
neu:
```glsl
vec2 skyPx = gl_FragCoord.xy / u_pixelScale + u_skyOffset;   // CSS-Px in der Fläche
vec2 uv = skyPx / u_skySize;                                  // 0..1 der Fläche
float aspect = u_skySize.x / u_skySize.y;
vec2 cuv = (uv - 0.5) * vec2(aspect, 1.0);                    // Einheit: virtuelle Höhe
// Vignette separat auf dem FENSTER:
vec2 winUv = gl_FragCoord.xy / u_resolution;
vec2 winCuv = (winUv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);
… col *= vignetteAt(winCuv);
```
- `starLayer`-Pixeldistanz: `distPx = length(f - pos) * (u_resolution.y / density)` → `… * (u_skySize.y * u_pixelScale / density)` (Zellgröße fix in der Fläche, Vergleichsgröße weiter in Buffer-Px).
- Dither (`gl_FragCoord`-hash) bleibt unverändert.

**STAR_VERT (Katalogsterne)** — heute `cuv → NDC` direkt; neu über die Fläche ins Fenster projiziert:
```glsl
vec2 virtCuv = u_polaris + vec2(cos(angle), sin(angle)) * r;          // Einheit: virtuelle Höhe
vec2 skyPx  = (virtCuv / vec2(aspect, 1.0) + 0.5) * u_skySize;        // CSS-Px in der Fläche
vec2 winCss = skyPx - u_skyOffset;                                    // CSS-Px im Fenster
vec2 viewportCss = u_resolution / u_pixelScale;
gl_Position = vec4(winCss / viewportCss * 2.0 - 1.0, 0.0, 1.0);
```
- `gl_PointSize = sizeCss * u_sizeScale` bleibt (fixe CSS-Größe — genau der gewünschte statische Look).
- Cloud-Occlusion-Sample mit `virtCuv` (gleiche Domain wie der Cloud-Pass — Konsistenz bleibt).
- `vignetteAt` am Stern: auf dessen Fenster-cuv (`(winCss/viewportCss − 0.5) × (winAspect, 1)`).

**draw() (JS)**:
```ts
const offsetX = settings.polarisX * (settings.skyWidth - cssWidth);
const offsetY = settings.polarisY * (settings.skyHeight - cssHeight);
const aspectV = settings.skyWidth / settings.skyHeight;
const polX = (settings.polarisX - 0.5) * aspectV;   // Polaris in Flächen-cuv
const polY = settings.polarisY - 0.5;
```
**Beweis der Anker-Formel:** Polaris liegt in der Fläche bei `polaris01 × skySize` CSS-Px; im Fenster bei `polaris01 × skySize − offset = polaris01 × viewportCss` → exakt `polarisX/polarisY` der Fenstergröße, für jede Größe. ✓

`resize()` cached künftig `cssWidth`/`cssHeight` auf der Scene (heute nur `pixelScale`) — die Parameter existieren bereits in der Signatur.

### Geänderte Files

1. **`nightSky/settings.ts`** — `skyWidth: 5632`, `skyHeight: 3168` in Interface (TSDoc: virtuelle Fläche, CSS-Px, > 5K-Anforderung) + `NIGHT_SKY_DEFAULTS` + `NIGHT_SKY_RANGES` (z. B. 1280–16384 / 720–8640). Doku-Updates: `polarisX/Y` („Fenster-Position von Polaris UND Anker des Ausschnitts in der Fläche"), `skyFov` („Grad Himmel auf der **virtuellen** Höhe"), `starDensity`/`cloudScale` (Bezug: virtuelle Fläche).
2. **`nightSky/settings.test.ts`** — neuer Vertrag: `skyWidth > 5120 && skyHeight > 2880` (pinnt die 5K-Anforderung als Test), Ranges vorhanden.
3. **`nightSky/scene.ts`** — Shader-Umbau wie oben (3 Programme, neue Uniforms, Fragment-Mapping, Stern-Projektion, Fenster-Vignette), `draw()`-Offset/Polaris-Berechnung, `resize()` cached CSS-Größe. Scene-Header-TSDoc um das Ausschnitt-Modell ergänzen.
4. **`background-prototype.html`** — identischer Shader-Umbau (Quelle und Production bleiben look-paritätisch); `PARAMS` + 2 Slider `skyWidth`/`skyHeight` (Gruppe „Sky", min/max wie RANGES, step 64); `drawScene()`-Offset; Labels/Tips en+de für die neuen Regler; bestehende Tips von `skyFov`/`polarisX`/`polarisY`/`starDensity`/`cloudScale` auf die Flächen-Semantik umformuliert.
5. **Unverändert:** `BackgroundScene.tsx`, `worker.ts`, `loop.ts`, `protocol.ts` — der Resize-Pfad transportiert `cssWidth`/`cssHeight` bereits bis in die Scene; Settings fließen via Init.

### Math-Verifikation (Workflow `wf_566a33f8-d84`, 2026-06-13)

Vier unabhängige Derivationen (Fragment/Y-Achse, Stern-Projektion, Anker-Invariante, DPR-Adversary) + Synthese: **Verdict `proposed-math-correct`.** Anker-Beweis exakt und DPR-unabhängig (`winCss = polaris01 × viewportCss`, alle Größen kürzen sich); Y-Achse durchgehend y-up, kein Sign-Flip. Verbindliche Schärfungen für Task 2/3:

1. **Stern-Vignette (STAR_VERT `:249`)** — wahrscheinlichste Fehlerquelle: `vignetteAt(cuv)` MUSS auf `vignetteAt(winCuvStar)` mit `winCuvStar = (winCss / viewportCss − 0.5) × vec2(u_resolution.x/u_resolution.y, 1.0)` — sonst sind Sterne in Fenster-Ecken ~22 % zu hell (Flächen- statt Fenster-Vignette).
2. **`resize()` persistiert `cssWidth`/`cssHeight` UNGERUNDET** (zwei Felder neben `pixelScale`); NICHT aus `canvas.width / pixelScale` rekonstruieren (Sub-Pixel-Crop-Shift durch `round()`). Prototyp nutzt `canvas.clientWidth/clientHeight` direkt.
3. **Alle DREI Programme** bekommen `u_skySize`/`u_skyOffset`/`u_pixelScale` (locations-Arrays + draw-Sets) — fehlt eines, bleibt dieser Pass fenster-relativ und driftet sichtbar gegen die anderen (z. B. Wolken gegen Sterne beim Resize). `u_pixelScale` = bestehender `pixelScale`-Wert (== `u_sizeScale`), keine zweite Quelle.
4. **KEIN Offset-Clamp** bei Fenster > Fläche: Clamp würde den Polaris-Anker jenseits der Kante brechen. Verhalten degradiert graceful (Gradient clampt auf Endfarben, Felder extrapolieren nahtlos, Polaris bleibt exakt). Floor dokumentieren: skyWidth/skyHeight ≥ jede unterstützte Viewport-Größe; realistische Verletzung erst bei ~6000-px-Einzelfenstern → Hebel wäre eine größere Fläche.
5. Browser-Gate muss prüfen: Wolken bleiben beim Resize am Sternfeld verankert (kein Pass auf Fenster-Aspect vergessen).

### Risiken / Hinweise

- **Look-Drift der abgenommenen Settings:** `starDensity 100`, `cloudScale 8`, `skyFov 110` etc. beziehen sich künftig auf die 3168-Px-Fläche statt aufs Fenster. Ein typisches Desktop-Fenster (~900 px hoch) zeigt dann ~28 % der Fläche — Sterne/Wolken wirken im Fenster entsprechend größer/spärlicher als heute. **Das finale Tuning macht der User im Prototyp** (wie MC-029 Phase 4: Copy settings → Sign-off → Werte in `settings.ts` pinnen). Der Plan liefert die Mechanik mit unveränderten Default-Werten.
- Prototyp-`applySettings` clamped gegen Slider-Ranges — die neuen Keys müssen in `PARAMS` stehen, sonst verwirft Paste sie.
- `localStorage`-State des Prototyps (`mc-bg-prototype-v1`) kennt die neuen Keys nicht → Defaults greifen automatisch (Spread-Reihenfolge `{...defaults, ...stored}` ✓ bestehendes Verhalten).

## Implementation

Gates vor jedem Commit: `pnpm test:run`, `astro check`, `pnpm lint`, `pnpm doctor:diff`. Commits einzeln nach Freigabe.

### Task 1 — Settings + Vertrag
- RED: `settings.test.ts`-Erweiterung (Defaults > 5120/2880, Ranges definiert).
- GREEN: `settings.ts` (Interface, Defaults, Ranges, Doku-Updates).
- Commit: `Feat: add the static sky extent settings (larger than native 5K)`

### Task 2 — Scene-Umbau (Production)
- Shader + draw + resize wie im Design. Kein Unit-Test (GL ist browser-verifiziert, bestehende Praxis); `BackgroundScene.test.tsx` muss unverändert grün bleiben.
- Commit: `Feat: render the night sky as a fixed-extent backdrop cropped by the viewport`

### Task 3 — Prototyp-Umbau
- Gleiche Shader-Änderungen, neue Slider, Tooltips en/de.
- Commit: `Chore: static sky extent in the night-sky tuning prototype`

### Task 4 — Browser-Gate (Prod-Build :3002 + Prototyp, chrome-devtools-mcp)
- Resize-Beweis: Screenshot groß (z. B. 1600×1000) vs. klein (800×600) vs. Phone-Viewport (390×844) — Konstellationsgröße/Wolkengröße identisch (Pixel-Maß), Polaris jeweils bei polarisX/polarisY des Fensters, Gradient zeigt Ausschnitt.
- Prototyp: Slider wirken, Copy/Paste rundreist die neuen Keys, Resize live.
- Konsole fehlerfrei; Worker-Pfad + Fallback unverändert grün (bestehende Tests).
- Danach: **User-Tuning im Prototyp** (Safari) → finale Settings per „Copy settings" → in `settings.ts` pinnen (Follow-up-Commit nach Sign-off).

## Verified facts (2026-06-13 beim Plan-Schreiben, Branch `gsap`, HEAD `acd68e2`)

- `scene.ts:176-178` — Fragment-Mapping `uv = gl_FragCoord.xy / u_resolution; cuv = (uv-0.5)*vec2(aspect,1)` (Read ✓); identisch im CLOUD_FRAG `:293-295` (Read ✓)
- `scene.ts:169` — `distPx = length(f - pos) * (u_resolution.y / density)` (Read ✓)
- `scene.ts:229-231` — STAR_VERT `cuv = u_polaris + dir*r; gl_Position = vec4(cuv.x*2.0/aspect, cuv.y*2.0, 0, 1)` (Read ✓)
- `scene.ts:122-126` — `GLSL_VIGNETTE` `vignetteAt(cuv)`; in allen drei Passes multipliziert (`:193`, `:249`, `:318`) (Read ✓)
- `scene.ts:501-504` — `draw()` rechnet `polX = (polarisX-0.5)*aspect; polY = polarisY-0.5` mit FENSTER-Aspect (Read ✓)
- `scene.ts:480` — `let pixelScale = 1` einziger gecachter Resize-Wert; `resize(cssWidth, cssHeight, scale)`-Signatur `:569` trägt CSS-Größe bereits (Read ✓)
- `scene.ts:520` — `u_starSize` wird als `settings.starSize * pixelScale` gesetzt; `u_sizeScale = pixelScale` `:542` (Read ✓)
- `settings.ts` — `NightSkySettings` ohne skyWidth/skyHeight; `NIGHT_SKY_RANGES`-Record-Struktur; `polarisX/Y`-TSDoc `:30-33` „screen position", `skyFov` `:28-29` „screen height" (Read ✓)
- `settings.test.ts` existiert (ls ✓ — Inhalt beim Execute lesen)
- `background-prototype.html` — `PARAMS`-Tabelle `:194-238` (def/min/max/step, applySettings clamped `:597-625`), `drawScene()` `:1348-1415` (polX/polY `:1351-1352` fenster-aspect), `resize()` `:1279-1288`, `LABELS_DE`/`TIPS_DE` `:343-406`, Store-Key `mc-bg-prototype-v1` mit `{...defaults, ...stored}` `:435` (Read ✓)
- Prototyp-Shader sind Quell-Duplikate der scene.ts-Shader (1:1-Port dokumentiert in scene.ts `:15-17`) (Read ✓)
- `BackgroundScene.tsx` `postResize()` → Worker-`Resize`-Message bzw. `fallbackScene.resize(width, height, …)` mit CSS-Maßen; `worker.ts` Resize-Case ruft `scene.resize(cssWidth, cssHeight, pixelScale(…))` (Read ✓, MC-030-Session)
- Natives 5K = 5120×2880; Default 5632×3168 = exakt ×1.1 (Rechnung)
- GLSL `smoothstep` clampt sein Ergebnis auf 0..1 → Gradient-Verhalten außerhalb der Fläche ist definiert (Endfarben) (GLSL-Spez, Wissens-Fakt)
- Höchste Plan-Nr.: MC-030 → dieser Plan ist MC-031 (Verzeichnis-Stand ✓)

## Open questions

- Keine — Anker-Frage per User-Antwort entschieden (Polaris-Anker über polarisX/polarisY); finale Optik-Werte kommen aus dem User-Tuning im Prototyp (Task-4-Follow-up).

## Checklist

- [ ] All code references verified (functions, scripts, paths, env vars, package-manager commands) — Verified-facts-Block oben, am Execute-Start re-greppen
- [x] Task 1 — Settings + 5K-Vertrag (RED→GREEN, Commit `8a0a051`; Gates grün 2026-06-13: Frontend 139/139, astro check 0/0, biome clean, doctor 0 issues; Defaults 5632×3168, Ranges 1280–16384 / 720–9216; 44-Keys-Contract + 5K-Floor-Test; Math-Verifikation per Workflow grün, Schärfungen im Design-Block)
- [x] Task 2 — Scene-Umbau Production (Commit `c652ea0`; Gates grün 2026-06-13: 139/139, astro check 0/0, biome clean, doctor 0; Browser-Smoke: Shader kompilieren (Canvas-Reveal), Resize 2264×1464 → 900×600 zeigt identische Stern-Pixelgrößen/-Abstände = Ausschnitt-Verhalten bewiesen, Konsole nur pre-existing Befunde)
- [x] Task 3 — Prototyp-Umbau (Gates grün 2026-06-13; Browser-Smoke: Shader kompilieren, FPS 10, neue Slider; Slider-step 16 statt 64, weil 3168 sonst nicht auf dem min+n×step-Raster liegt)
- [x] Addendum A (User 2026-06-13): Legacy-Gradient-Blobs restlos entfernt — `GradientBackground.astro` → `NightSkyBackground.astro` (Rename per Naming-Regel: kein Gradient mehr im File), BaseLayout-Refs, Kommentar-Refs in BackgroundScene.tsx; No-JS/No-WebGL-Besucher sehen jetzt die flache `bg-background`-Grundfarbe (DOM-verifiziert: kein radial-gradient-Element mehr)
- [x] Addendum B (User 2026-06-13): Getunte Static-Plane-Defaults gepinnt (Production `settings.ts` + Prototyp-defs): starDensity 170, starSize 1.1, twinkleAmount 0.86, twinkleSpeed 2.3, cloudCoverage 0.31, windSpeed 0.01, evolveSpeed 0.06, starOcclusion 0.1, skyBottomDay #9fd4eb — damit ist das Task-4-User-Tuning vorgezogen erledigt; alle Werte in den Slider-Ranges (settings.test grün)
- [x] Task 4 — Browser-Gate grün (2026-06-13): Resize 2264×1464 → 900×600 → Phone 390×844 — Stern-Pixelgrößen/-Abstände identisch, nur der Ausschnitt ändert sich; Konsole nur die 2 dokumentierten pre-existing Befunde; Prototyp-Smoke (FPS 10, Slider korrekt). User-Tuning war als Addendum B vorgezogen (Settings gepinnt `ceb5c87`).

---

## Completed

**Abgeschlossen am 2026-06-13** (Branch `gsap`, HEAD `bd6dff2`). Alle 4 Tasks + 2 User-Addenda, alle Gates grün.

**Commits:**
- `8a0a051` — skyWidth/skyHeight-Settings (5632×3168 = 5K×1.1) + 5K-Floor-Vertragstest
- `c652ea0` — scene.ts: Flächen-Crop-Mathematik (GLSL_PLANE in allen 3 Programmen, Polaris-Anker-Offset, Fenster-Vignette inkl. Per-Star, un-gerundete CSS-Größe in resize)
- `e4c400e` — Prototyp: gleiche Math + Sky-width/height-Slider (step 16 wegen min+n×step-Raster) + getunte defs + de/en-Tooltips auf Flächen-Semantik
- `ceb5c87` — Production-Defaults: 5. Sign-off-Iteration für die statische Fläche (starDensity 170, starSize 1.1, twinkle 0.86/2.3, coverage 0.31, windSpeed 0.01, evolveSpeed 0.06, starOcclusion 0.1, skyBottomDay #9fd4eb)
- `bd6dff2` — Legacy-Gradient-Blobs restlos entfernt; `GradientBackground.astro` → `NightSkyBackground.astro`; No-JS/No-WebGL = flache bg-background-Farbe

**Math-Verifikation:** 4 unabhängige Derivationen + Synthese (Workflow `wf_566a33f8-d84`), Verdict `proposed-math-correct`; Anker-Beweis exakt/DPR-unabhängig; Schärfungen (Per-Star-Fenster-Vignette, kein Offset-Clamp, alle 3 Programme) im Design-Block dokumentiert und umgesetzt.

**Browser-Gate-Befunde:** Desktop groß/klein + Phone 390×844 zeigen identische Stern-Pixelgrößen und -Abstände — der Himmel ist ein festes Wandbild, das Fenster nur ein Ausschnitt. Blob-Layer DOM-verifiziert entfernt. Konsole ausschließlich die zwei dokumentierten pre-existing Befunde (Hero-Input id/name, apple-meta-Deprecation). Prototyp: Shader kompilieren, FPS-Loop läuft, Copy-settings-JSON deckt die neuen Keys ab.

**Offen außerhalb des Plans:** User-Sichttest in Safari (Optik der getunten Werte auf der festen Fläche); Branch ist nicht gepusht (letzter Push-Stand `acd68e2`).
