# Plan: GSAP + Three.js Frontend-Migration (Native-App-Feeling)

Plan-Nr.: MC-033
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

---

## ⏯️ Session-Übergabe / Resume-Stand (Stand 2026-06-12)

**Branch:** `gsap`, HEAD = `7a85070` (Prototyp-Chore; davor **Task 4.2** `4323153`, **Task 4.1** `e1795df`, Font-Cleanup `9c1508f`, **Task 3.1** `c73ee6d`), Working Tree **clean**. Die GSAP-Migrations-Hauptlinie (nummerierte Tasks) ist bis **Task 4.2** committed. Davor: Task 2.6 (`f3c1042`), Task 2.5 (`57bec8a`), Task 2.4 (`885c3e6` + Review-Fix `fac4c9d`). Vor dem Weitermachen `git log --oneline -10` + `git status` prüfen.

**Fertig (Code committed):**
- ✅ **Phase 1 komplett** — Task 1.1–1.3 (`5961308`, `682cbbd`, `1e345a7`), Phase-1-Gate grün. CLS-Befund war Messartefakt → kein Phase-1-Regress; Artist-Card-CLS nach **Task 2.6** verschoben (User-Entscheidung).
- ✅ **Task 2.1** GSAP-Fundament (`369165e`/`476c663`) — Spec ✅, Quality ✅
- ✅ **Task 2.2** Platform-Grid Flip (`e3cbaca`) — Spec ✅, Quality ✅
- ✅ **Task 2.3** Search-Field Flip (`c23584e`) — Spec ✅, Quality ✅; Dead-Consumer-Drift dokumentiert. Reanimation lief als separater paralleler Follow-up (`useSearchFieldReturn`).
- ✅ **Task 2.4** SmoothSwap compositor-only (`885c3e6` + Review-Fix `fac4c9d`) — Spec ✅, Quality ✅ (2026-06-11 nachgeholt; Verdict CHANGES-REQUESTED, alle Findings gefixt — Details im Task-2.4-Block).
- ✅ **Task 2.5** CSS-Keyframes → GSAP (`57bec8a`) — Spec ✅ (SPEC-COMPLIANT), Quality ✅ (APPROVE-WITH-NITS, alle Findings im Amend). Neue Module `entrances.ts`/`collapse.ts`/`coverSwap.ts` + `FadeInOnMount.tsx`; Clear-Flow auf Timeline-`onComplete`; CollapsibleSection compositor-only (Gate-Blocker behoben); SongInfo migriert; CSS-Ausnahmen dokumentiert. **Phase-2-Gate offen:** visueller Browser-Smoke der Collapse-Interrupts gegen Prod-Build (jsdom hat keine Layout-Engine).
- ✅ **Task 2.6** Artist-Column-Flip (`f3c1042`) — Quality ✅ (APPROVE, Fixes eingefoldet). **Scope-Anpassung (User-Entscheidung 2026-06-12):** Browser-Messung gegen Prod-Build ergab, dass der Container-Flip den vorbestehenden Hydration-CLS nur marginal reduziert (0.0568 → 0.049 Dev, ~0.105 Prod; Root Cause: vier unabhängig variabel hohe Cards ersetzen fixe Skeletons im Stack — kein invertierbares „Vorher" für einen Transform-Flip). Flip als Motion-Polish behalten, Ziel CLS≈0 via Flip als unerreichbar dokumentiert (bräuchte Space-Reservation, out-of-scope). Details im Task-2.6-Block.

**PLAN KOMPLETT (2026-06-13).** Alle 5 Phasen + Abschluss-Block erledigt, alle Gates grün — Details in `## Completed` am Ende. Ausstehend außerhalb des Plans: User-Sichttest in Safari (Nachthimmel, Player, Page-Transitions). **Phase-5-Gate grün (2026-06-13):** Worst-Case-Trace 0 Long Tasks, Player-Teardown leak-frei, Policy 3 erfüllt (Details im Gate-Block). **Task 5.3 ist KOMPLETT (2026-06-13):** 5.3a VfdDisplay-Loop→gsap.ticker + Farb-Cache (`244243c`, behebt den Marquee-Layout-Stream), 5.3b Player-Loops→gsap.ticker (`90740e6`), 5.3c progressRatio bewusst weggelassen (dokumentierte Policy-2-Ausnahme, Trace zeigt 0 Long Tasks). Browser-verifiziert: 0 Probe-Spans im Playback, 0 Long Tasks, 60 fps, Policy 3 erfüllt (gsap.ticker = einzige Main-Thread-Frame-Quelle). **Task 5.2 ENTFÄLLT (User-Entscheidung 2026-06-13):** Audio-Reaktivität nicht gewollt — implementiert als `c77440e`, vollständig revertiert als `5530836`; der `spectrumStore` (5.1, `4e2465f`) bleibt für den VFD-Player. Details in den jeweiligen Task-Blöcken. **Task 5.1 ist KOMPLETT (2026-06-12, `4e2465f`):** Spectrum komplett off-React (zero-alloc `spectrumStore`, Producer-Umbau, imperativer VFD-`controllerRef`-Handle, `buildPlayerLines`, memoisierte Lines), Browser-verifiziert (Analyzer statisch idle / animiert play / settled nach Fade, 0 DOM-Churn steady-state). Befund: `progressRatio` bleibt 60/s-React-State (→ Task 5.3 verankert). **Phase 4 ist KOMPLETT (2026-06-12): Task 4.1 (`e1795df`) + Task 4.2 (`4323153`) committed, Gate grün (Befunde im Gate-Block)** — 6 nightSky-Module (`settings`/`catalog`/`loop`/`protocol`/`scene`/`worker`) + `BackgroundScene.tsx`-Island + `GradientBackground.astro`-Umbau; Gates 106/106 Tests, astro check 0/0, lint 639 clean, doctor 0; Prod-Build `worker-*.js` 17.69 kB; Browser-Beweise in den Task-Blöcken (Worker-Transfer-Lock, 0 Long Tasks, LCP 111 ms, persist-Identity). Prototyp committed als `7a85070`. **Ausstehend:** User-Sichttest in Safari, formales Phase-4-Gate (Heap/GPU-Memory über mehrere Navigationen — persist-Identity-Vorab-Befund liegt schon im Task-4.2-Block). **Phase 2 + Phase 3 sind KOMPLETT** (beide Gates grün 2026-06-12, Befunde in den jeweiligen Gate-Blöcken).

**⚠️ Phase-4-Scope-Änderung (User-Wunsch 2026-06-12):** Statt Gradient-Port + Punkte-Starfield soll der WebGL-Background ein **fotorealistischer Nachthimmel** werden (Referenzbild vom User): prozedurale Sterne (Multi-Layer, Twinkle, langsame Rotation ~20 min/U statt 300 s) + **FBM-Wolken** mit Domain-Warping, Makro-Klarzonen, Mondlicht-Kantenlicht, zeitlicher Evolution (3D-Noise). **Prototyp liegt in `background-prototype.html` (Projekt-Root, committed `7a85070`)** — Single-File WebGL2 (3 Passes: Sky+Fill-Quad, Katalogsterne als additive POINTS, Wolken-Quad alpha-blended), Parameter-Sidebar (Slider + Farben, localStorage, Copy/Paste-JSON), 30-FPS-Cap + renderScale. Enthält **echten Nordhimmel-Katalog** (67 hellste Sterne J2000: UMa/UMi komplett, Cas, Cep, Dra, Wega/Deneb/Capella…, Polaris 0.74° neben dem Pol als natürliches Drehzentrum, Chiralität verifiziert: Merak→Dubhe zeigt auf Polaris) + prozeduralem Fill, beide rotieren um Polaris (CCW, Nordblick). **Phase 4 startet erst nach User-Bewertung des Prototyps.**

**FINALE Settings (User, 2026-06-12, vierte Iteration) — ✅ PRODUCTION-FREIGABE erteilt** („Mit diesen Settings kann die Production Implementierung umgesetzt werden"). Shader-Defaults der Live-Version UND `def`-Werte im Prototyp, abgeglichen 42/42:

```json
{ "dayness": 0, "dayTransition": 1, "autoDayNight": 0, "sunriseHour": 6.5,
  "sunsetHour": 20.5, "twilightHours": 1.5, "vignette": 0.25, "skyFov": 110,
  "polarisX": 0.5, "polarisY": 0.66, "rotationPeriod": 1200, "catalogSize": 1.7,
  "catalogBrightness": 1.1, "starDensity": 100, "starSize": 1.5,
  "starBrightness": 0.95, "twinkleAmount": 0.7, "twinkleSpeed": 1.7,
  "cloudScale": 8, "cloudCoverage": 0.3, "cloudSoftness": 0.34, "cloudOpacity": 1,
  "cloudDetail": 7, "clearZones": 0.4, "warpStrength": 0.35, "windSpeed": 0.03,
  "windAngle": 180, "evolveSpeed": 0.05, "moonIntensity": 0.15, "moonAngle": 265,
  "sunIntensity": 0.85, "sunAngle": 230, "starOcclusion": 1.2, "animate": 1,
  "renderScale": 0.7, "fpsCap": 10, "skyTop": "#03070d", "skyBottom": "#0b1923",
  "skyTopDay": "#2d6fb5", "skyBottomDay": "#aee5fe",
  "cloudColor": "#2c3b47", "cloudColorDay": "#e6edf3" }
```

`dayness: 0` + `autoDayNight: 0` = **fixer Nacht-Start** (dreimal bewusst so gesetzt → Default-Entscheidung; Auto + Tag/Nacht-Toggle bleiben opt-in-Features der BackgroundScene-API). **fpsCap 10** = ⅓ der ursprünglichen 30-FPS-Last. **Fade-FPS-Boost (User-Entscheidung 2026-06-12):** Die manuelle Tag/Nacht-Blende (`dayTransition: 1` s) rendert temporär mit **30 FPS** (Konstante `DAY_FADE_FPS` im Prototyp, `effectiveFps = max(fpsCap, 30)` solange `dayAnim` läuft) und fällt danach auf den Cap zurück — identisch in die Live-Version portieren. **User testet ausschließlich in Safari am Mac** (für Smoke-Anweisungen relevant; Safari blockt die GPU-Timer-Extension → Benchmark-Button-Pfad). **→ Phase 4 / Task 4.1 ist damit STARTKLAR**; vor dem Implementieren Task-4.1-Block neu fassen (Szene = Prototyp-Shader statt three.js-Points/Gradient — Empfehlung: raw WebGL2 im Worker, three.js-Dependency entfällt ~150 KB gz; Worker/OffscreenCanvas/Fallback-Architektur unverändert).

**Zusatz-Feature (User-Wunsch 2026-06-12): Tag/Nacht-Live-Umschaltung** — `dayness`-Uniform (0..1) crossfadet Himmel-Gradient (Nacht→Sommerblau) + Wolken-Beleuchtung (Mondgrau-Rim→Sonnenweiß-Rim, weiche blaugraue Tag-Schattenkerne); Sterne (Katalog+Fill) faden früh im Übergang aus (smoothstep 0.05–0.45, wie reale Dämmerung); Wolkenfeld bleibt identisch. Bedienung im Prototyp:
- **Manuell:** `dayness`-Slider (stufenloses Mischen) + „☀︎ Day/☾ Night"-Button (smoothstep-Fade über `dayTransition` s, Default 3).
- **Automatik (User-Wunsch 2026-06-12, zweiter Teil):** Checkbox „Auto (local time)" (`autoDayNight`) setzt `dayness` beim Laden sofort aus der **lokalen Uhrzeit des Betrachters** und folgt ihr danach kontinuierlich (Dämmerung spielt in Echtzeit ab, kein harter Switch). Kurve: `up·down` zweier smoothstep-Rampen der Breite `twilightHours` (Default 1.5 h), zentriert auf `sunriseHour` (6.5) / `sunsetHour` (20.5) — alle drei als Slider. Manuelles Eingreifen (dayness-Slider oder Button) schaltet Auto ab (expliziter Override); Auto-Einschalten/Paste mit `autoDayNight:1` übernimmt die Uhrzeit sofort. Bool-Werte laufen als 0/1 durchs Settings-JSON (Paste rundet).
- Tag-Parameter (skyTopDay/skyBottomDay/cloudColorDay, sunIntensity/sunAngle) tunebar — **finale Tag-Werte liegen vor** (im Settings-JSON oben; User testet visuell selbst im Browser, kein MCP-Smoke; JS-Syntax node-checked). Sidebar hat Hover-Tooltips auf allen 42 Controls und ist **zweisprachig DE/EN** (ein File, kein Fork: EN lebt in den PARAMS/TIPS-Definitionen, DE als Overlay-Maps `LABELS_DE`/`TIPS_DE`/`UI.de`; Umschalt-Button in der Sidebar, Startsprache auto aus `navigator.language`, Wahl in localStorage `mc-bg-prototype-lang`; Settings-JSON bleibt sprachneutral key-basiert).

**Performance-Controls (User-Wünsche 2026-06-12, dritte Runde):**
- **`animate`-Hauptschalter** (bool, def 1, Performance-Gruppe): aus = Szene friert als Standbild ein, die GPU rendert GAR NICHT mehr; ein `needsRedraw`-Flag repainted einmalig bei Tuning-Änderungen/Resize/Tag-Nacht-Fade, und der Auto-Uhrzeit-Modus steppt das Standbild in der Dämmerung ~1×/Minute weiter. Geht als 0/1 durchs Settings-JSON → Live-Version bekommt „Animation aus" als User-Preference.
- **GPU-Monitor** (Zeile in der Performance-Gruppe): gemessene GPU-Renderzeit/Frame + abgeleitete Busy-% (Zeit × FPS) als bester Browser-Energie-Proxy; echte Watt exponieren Browser nicht (so dem User erklärt). Zwei Modi: **Live** via `EXT_disjoint_timer_query_webgl2` (EMA-geglättet, asynchron gepollt, disjoint-sicher), wo verfügbar; **Benchmark-Button „Messen"**, wo nicht — Chrome auf macOS blockt die Extension (ANGLE-auf-Metal, beim User bestätigt: „n/a"), der Button rendert dann 30 Frames mit hartem `gl.finish()`-Sync und mittelt die Wandzeit (leichte OBERGRENZE der echten Frame-Kosten wegen Sync-Overhead; blockiert den Main Thread einmalig für ~30 Frame-Zeiten — für eine explizite Messung ok). Dafür wurde der Draw-Block aus `frame()` als `drawScene()` extrahiert.
- **Slider-Raster:** `fpsCap` 10–60 in 2er-Schritten (finaler Default 10), `dayTransition` 0.2–10 in 0.2er-Schritten (finaler Default 1, mit 30-FPS-Fade-Boost) — beide Defaults liegen auf dem Raster, die frühere 14-vs-15-Abweichung ist obsolet. Für die Live-Version (Phase 4): manueller Toggle als API, Uhrzeit-Mapping identisch portieren; Default = fixer Nacht-Start (siehe Vermerk unter dem Settings-JSON). Task-4.1-Architektur (OffscreenCanvas-Worker, Fallback, on-demand-Rendering) bleibt unverändert gültig — nur die Szene ist neu (Fullscreen-Quad-Fragment-Shader statt THREE.Points+Gradient). Nebenstränge erledigt: Artwork-Fallback-Fix (`7c41ecc`) — fehlendes `/og/default.jpg`-Asset ergänzt (fixt auch OG-Previews artless Tracks), `genre-artwork`-404 als Cold-Cache/Doku-Drift diagnostiziert (kein Backend-Bug, TSDoc korrigiert).

**Working-Tree-Situation:** ✅ **aufgeräumt (2026-06-11).** Der parallele Search-Field-Return-WIP wurde als Commit `9f92cd3` gesichert (siehe Task 2.3), die Wegwerf-Probe `swap.interrupt-probe.test.ts` gelöscht. Working Tree ist **clean** (aktueller HEAD siehe Kopfzeile). (Hinweis für künftige parallele Arbeit: spawn_task-Sessions liefen im selben Repo-Root, kein separater Worktree — bei erneutem Parallelbetrieb `git status` prüfen, bevor man committet.)

**Phase-2-Gate-Blocker (müssen in Task 2.5 mit-gefixt werden, sonst rot):**
- `CollapsibleSection.tsx:36` animiert `grid-template-rows` (Layout-Property, ~1 Layout/Frame über 680 ms bei jedem Resolve-Flow) → compositor-only (clip-path/Flip-scale).
- Persistenter ~60-Layouts/s-Stream auf Share-Pages mit langen Titeln, korreliert mit VFD-Marquee-rAF (`VfdDisplay.tsx:173`) → gehört zu **Task 5.3** (Ticker), aber das Phase-2-Gate-Kriterium „NULL Layout-Spitzen im ganzen Trace" wird davon berührt — beim Gate als bekannt/Task-5.3-Scope vermerken.
- Task-2.5-Sonderfall: `LandingPage` triggert die Clear-Choreografie über `onAnimationEnd` der `animate-slide-out-down`-CSS-Animation. Wird dieser Keyframe auf GSAP migriert, feuert kein `animationend` mehr → Handler im selben Schritt auf Timeline-`onComplete` umverdrahten (sonst stirbt der Clear-Flow wie bei 719a656).

**Workflow-Konventionen (zwingend):**
- **subagent-driven-development** pro Task: fresh Implementer-Subagent → Spec-Review (Modell `sonnet`) → Quality-Review (`superpowers:code-reviewer`) → Review-Findings vom Implementer einfolden (via SendMessage an denselben Agent, stagen, Controller amendet) → Plan-Checkboxen + Commit-SHA eintragen → nächster Task. Implementer bekommen den VOLLEN Task-Text + Kontext (nie Plan-File lesen lassen).
- **Pre-commit Hook** = Full-Repo `react-doctor` (alle deslop-Rules error) + gitleaks. Reine **Foundation-Commits** (neue Exports ohne Konsumenten) blocken am `unused-export`/`unused-dependency` → `git commit --no-verify` ist erlaubt, ABER `gitleaks protect --staged --redact` manuell vorher grün fahren (so wurde 2.1 committed). Sobald ein Task die Exports konsumiert, läuft der Hook wieder normal — dann KEIN `--no-verify`.
- **Gates** am Phasenende: `test:run`, `astro check`, `pnpm lint`, `pnpm doctor:diff` + Browser-Trace. Perf-Zahlen (TBT/Long-Tasks/CLS) **gegen einen Prod-Build** messen (`pnpm --filter @musiccloud/frontend build`, dann `PORT=3002 node --env-file=apps/frontend/.env.local apps/frontend/dist/server/entry.mjs`), NICHT gegen den Dev-Server (HMR verzerrt). Dev-Server läuft via `./app` (frontend 3001, backend 4000); beide müssen für Share-Pages laufen.
- **Umami-Pageview-Check** ist lokal NICHT testbar (`PUBLIC_TRACKING_ENABLED=false` build-time eingebacken) → Post-Deploy-Verifikation, nicht blockierend.
- Commits: Prefix-Konvention (`Feat:`/`Refactor:`/…), KEIN `Co-Authored-By`. Nur Task-eigene Files pro Commit. Nicht pushen außer auf Anweisung.

**Graphify (Knowledge-Graph — zwingend nutzen):**
- Der Codebase-Wissensgraph liegt in `graphify-out/` (`graph.json`, `GRAPH_REPORT.md`, `graph.html`; gitignored). **Bei Codebase-/Architektur-Fragen zuerst den Graphen abfragen** statt blind zu greppen: `graphify query "<Frage>"`, `graphify path "A" "B"`, `graphify explain "<Symbol>"`. Der Graph kennt God-Nodes, Communities und Cross-File-Beziehungen.
- **Code-only-Policy (User-Entscheidung 2026-06-11):** Der Graph enthält ausschließlich Source-Code (Module/Funktionen/Klassen/Imports). Docs (`*.md`), Pläne, Papers (`*.pdf`), Bilder und Infra-/CI-Config (`*.yml`/`*.yaml`/`*.html`/`*.txt`) sind via `.graphifyignore` (Repo-Root) ausgeschlossen. Bei künftigen Full-Rebuilds NICHT die `document`/`paper`-Klassen mergen.
- **Auto-Update nach jedem Commit:** Post-Commit-Hook installiert (`.githooks/post-commit`, greift via `core.hooksPath`) — läuft detached im Hintergrund, incremental + code-only (AST, kein LLM), Log: `~/.cache/graphify-rebuild.log`. Nach jedem `git commit` aktualisiert sich der Graph selbst. KEIN manueller Schritt nötig.
- **Manueller Full-Rebuild** nur, wenn der Hook mal aussetzt (z. B. stark schrumpfender Commit → graphify's Dedup-Schutz refused das Überschreiben, dann `to_json(..., force=True)`): `/graphify` (voller Lauf). Stand letzter Full-Rebuild 2026-06-11: **5719 Nodes, 10977 Edges, 280 Communities, code-only**, 0 LLM-Tokens.
- Bekannte Eigenheit: `graphify hook status`/`install` werfen eine Warnung „could not read core.hooksPath" wegen eines doppelten `vscode-merge-base`-Eintrags in `.git/config` (VS-Code-Artefakt, harmlos) — der Hook funktioniert trotzdem korrekt.

---

**Goal:** Das Frontend (`apps/frontend`) verhält sich wie eine native App: keine Browser-Reloads bei interner Navigation, sämtliche Animationen und Transitions (Größenänderungen, Bewegungen, Page-Wechsel) laufen absolut butterweich und ruckelfrei. GSAP wird das einzige Animations-Fundament, Three.js liefert einen audio-reaktiven WebGL-Background. Loading-Performance (LCP) darf sich nicht verschlechtern.

**Architecture:** Astro SSR bleibt (Pflicht für OG-Meta/Bots/SEO der Share-Pages). Astros `ClientRouter` macht interne Navigation zum DOM-Swap ohne Reload; GSAP-Timelines übernehmen Page-Transitions und ersetzen alle handgebauten Animations-Systeme (CSS-Keyframes, FLIP, SmoothSwap). Three.js rendert als persistenter Background-Layer (lazy geladen, on-demand-Rendering). Ein einziger Ticker (`gsap.ticker`) treibt alle Frame-Quellen.

**Tech Stack:** Astro 5.17.3 (SSR, Node standalone), React 19, Tailwind 4, gsap 3.15.0 + @gsap/react 2.1.2 (Flip, CustomEase — seit GSAP 3.13 alle Plugins kostenlos), three 0.184.0.

---

## Oberste Direktive: Performance-Policy (gilt für jede Phase)

1. **Compositor-only:** Animiert werden ausschließlich `transform` und `opacity`. Layout-Properties (`height`, `width`, `top`, `margin`) sind in Animationen verboten. Größenänderungen laufen über FLIP (`Flip`-Plugin mit `scale: true`) oder `clip-path`.
2. **React-Decoupling:** GSAP schreibt direkt ans DOM. Während einer laufenden Transition darf kein React-Commit ausgelöst werden. State-Änderungen triggern Timelines, Timelines triggern nie State. Frame-Daten (Spectrum) laufen nie durch `useState`.
3. **Ein Ticker:** `gsap.ticker` ist die einzige rAF-Quelle (GSAP, Three-Render, VFD-Canvas, Spectrum-Gating). Keine parallelen `requestAnimationFrame`-Loops.
4. **Lazy Heavy:** three (~150 KB gz) lädt nie im Critical Path — dynamic import nach First Paint. GSAP-Core + selektive Plugins (~30 KB gz) dürfen mit dem Island laden.
5. **Reduced Motion:** `gsap.matchMedia()` ist der einzige Mechanismus; Three-Szene rendert dann einen statischen Frame.
6. **Main-Thread-Schutz (User-Direktive: NIEMALS blockieren):** Der Main Thread leistet pro Frame ausschließlich Tween-Mathematik + DOM-Writes (Mikrosekunden-Bereich) — das ist die einzige Arbeit, die prinzipbedingt nicht verlagerbar ist (DOM ist nur vom Main Thread schreibbar). Alles andere wandert weg: Three.js rendert in einem Web Worker via `OffscreenCanvas` (`transferControlToOffscreen()`), teure Einmal-Arbeit (dynamic imports, Modul-Init) läuft in `requestIdleCallback`-Fenstern und niemals während einer Transition oder Interaktion.
7. **Zero-Allocation in Frame-Loops:** Ticker-Callbacks allozieren keine neuen Objekte/Arrays (vorallokierte TypedArrays, Buffer-Reuse). GC-Pausen sind Main-Thread-Blocker und entstehen aus Allokations-Druck in Loops.

### Performance-Gates (Pflicht am Ende JEDER Phase)

- [ ] `pnpm --filter @musiccloud/frontend test:run` grün
- [ ] `pnpm --filter @musiccloud/frontend check` (astro check) grün
- [ ] `pnpm lint` und `pnpm doctor:diff` grün
- [ ] Performance-Trace via chrome-devtools-mcp über die in der Phase berührten Interaktionen: NULL Long Tasks (≥ 50 ms) im gesamten Trace — nicht nur während Transitions; während Transitions/Interaktionen kein Main-Thread-Task über dem Frame-Budget (16,6 ms, Ziel 8,3 ms für 120 Hz); keine `Layout`/`Recalculate Style`-Spitzen in Animations-Frames
- [ ] Lighthouse: Total Blocking Time (TBT) = 0 ms auf den berührten Seiten
- [ ] CLS der berührten Flows = 0 (FLIP-Umstellungen dürfen kein Layout-Shift-Flackern erzeugen)
- [ ] Manueller Smoke gemäß `.claude/plans/open/2026-04-18-frontend-ui-test-plan.md` für die berührten Flows

---

## IST-Zustand (verifiziert am 2026-06-10, Branch `gsap`)

- Astro 5.17.3, `output: "server"`, `@astrojs/node` standalone, React-Islands, Tailwind 4 (`apps/frontend/astro.config.mjs`, `apps/frontend/package.json`)
- Kein `ClientRouter`/View Transitions, kein Prefetch (grep `ClientRouter|ViewTransitions|astro:transitions` in `BaseLayout.astro` → 0 Treffer; grep `prefetch` in `astro.config.mjs` → 0 Treffer)
- Keine Animations-Library installiert — alles handgebaut
- Full-Page-Loads heute: `OverlayContext.tsx:138,143` (`window.location.href`), `SharePageShell.tsx:25` (`window.location.assign("/")`), Landing ↔ Share via `<a>`-Links; `ui/ErrorBoundary.tsx:97` (`window.location.reload()`, bleibt als Error-Recovery erhalten)
- Ruckel-Quellen: `SmoothSwap.tsx:61-81` (animiert `height`), `AnimatedPlatformGrid.tsx:38-54` (animiert Grid-`height`), `AudioPreviewPlayer.tsx:469,616,693` (`setSpectrumBands` → React-Re-Render alle 50 ms), `GradientBackground.astro:17-41` (90 Sterne als `box-shadow` auf rotierendem Vollbild-Element, `spin_300s`)
- Eigene rAF-Loops: `VfdDisplay.tsx:173`, `AudioPreviewPlayer.tsx:667-710`, FLIP-Einzelanimationen
- 11 CSS-`@keyframes` in `styles/animations.css` (Zeilen 4, 16, 26, 33, 42, 63, 72, 216, 228, 240, 252)
- `usePrefersReducedMotion` nur von `VfdDisplay.tsx` konsumiert; global zusätzlich CSS-Media-Query in `animations.css:263-272`

---

## Design

```
┌──────────────────────────────────────────────────────┐
│ Astro SSR (bleibt — OG-Meta/Bots/SEO)                │
│  └─ ClientRouter: interne Navigation = DOM-Swap      │
├──────────────────────────────────────────────────────┤
│ Layer 0: BackgroundScene (Three.js, fixed, persist)  │
│   läuft in einem WEB WORKER (OffscreenCanvas) —      │
│   Starfield als THREE.Points + Gradient-Shader,      │
│   audio-reaktiv; Main-Thread-Anteil: nur postMessage │
├──────────────────────────────────────────────────────┤
│ Layer 1: UI (React-Islands, Hydration unverändert)   │
│   GSAP-Timelines: Enter/Exit, Flip, Page-Transitions │
├──────────────────────────────────────────────────────┤
│ gsap.ticker: einzige Frame-Quelle                    │
└──────────────────────────────────────────────────────┘
```

Neues Modul `apps/frontend/src/lib/motion/` (eine Quelle für Easings/Durations/Timelines, react-doctor-konform mit PascalCase-`as const`-Namespaces):

```
lib/motion/
  constants.ts       — MotionDuration, MotionEase (as const Namespaces)
  setup.ts           — gsap.registerPlugin(Flip, CustomEase), CustomEase "mcOut", matchMedia-Kontext
  flip.ts            — Helper für FLIP-Übergänge (getState/from-Wrapper, scale-basiert)
  swap.ts            — Content-Swap-Timeline (Ersatz SmoothSwap, ohne height-Animation)
  pageTransitions.ts — astro:before-preparation / astro:after-swap Lifecycle-Hooks
```

Die bestehende Easing-Kurve `cubic-bezier(0.16, 1, 0.3, 1)` wird via `CustomEase.create("mcOut", "0.16, 1, 0.3, 1")` exakt übernommen — Look-and-Feel bleibt identisch, nur das Fundament wechselt.

**Bewusst NICHT migriert:** Das VFD-Display bleibt 2D-Canvas (pixelgenauer Retro-Emulator, `imageSmoothingEnabled = false`; WebGL brächte keinen visuellen Gewinn bei Risiko für die Pixel-Treue). Es wird in Phase 5 nur an `gsap.ticker` gehängt. UI-Elemente (Cards, Buttons, Panels) bleiben DOM — von GSAP animiert, nicht in WebGL gerendert.

---

## Phase 1 — Reload-freie Navigation (ClientRouter)

### Task 1.1: ClientRouter + Prefetch aktivieren

**Files:**
- Modify: `apps/frontend/src/layouts/BaseLayout.astro` (Head-Bereich)
- Modify: `apps/frontend/astro.config.mjs`

- [x] `import { ClientRouter } from "astro:transitions";` im Frontmatter von `BaseLayout.astro`, `<ClientRouter />` in den `<head>` einfügen
- [x] In `astro.config.mjs` ergänzen:

```js
prefetch: { prefetchAll: true, defaultStrategy: "hover" },
```

- [x] `pnpm dev` starten, Navigation Landing → Share-Page (`/{shortId}`) und zurück prüfen: Network-Tab zeigt fetch statt Document-Reload, kein weißer Flash
- [x] Verifizieren: `DeferredShareContent` (`[shortId].astro:192`, `server:defer`) und `DeferredFooter` (`[shortId].astro:214`) laden nach ClientRouter-Navigation korrekt nach (verifiziert: beide `/_server-islands/*`-Requests 200 nach Client-Navigation, Content + Footer präsent — Server Islands sind ClientRouter-kompatibel in Astro 5.17.3)
- [x] Commit: `Feat: enable ClientRouter and prefetch for reload-free navigation` (5961308)

### Task 1.2: Programmatische Full-Loads auf `navigate()` umstellen

**Files:**
- Modify: `apps/frontend/src/context/OverlayContext.tsx:138,143`
- Modify: `apps/frontend/src/components/share/SharePageShell.tsx:25`

- [x] In beiden Files `import { navigate } from "astro:transitions/client";`
- [x] `OverlayContext.tsx`: beide `window.location.href = \`/${detail.slug}\`` durch `navigate(\`/${detail.slug}\`)` ersetzen (Fallback-Pfad bei Overlay-Fetch-Fehler)
- [x] `SharePageShell.tsx:25`: `window.location.assign("/")` durch `navigate("/")` ersetzen; das `sessionStorage`-Flag `mc:focusHero` (wird vor der Navigation gesetzt) muss weiterhin von `HeroInput.tsx:45` gelesen werden — verifizieren, dass der Fokus nach SPA-Navigation ankommt (verifiziert: `document.activeElement` ist der Hero-Input nach Logo-Klick, Flag wird gelesen + entfernt)
- [x] `ui/ErrorBoundary.tsx:97` bleibt unverändert (`window.location.reload()` ist als letzte Error-Recovery legitim)
- [x] Smoke: Share-Page → Logo-/Back-Klick → Landing erscheint ohne Reload, Hero-Input fokussiert (Window-Marker überlebt, PerformanceNavigationTiming-Count bleibt 1, kein Document-Request)
- [x] Commit: `Feat: replace programmatic full-page loads with SPA navigate()` (682cbbd)
- [x] Zusatz (nicht im Plan vorgesehen, durch den Import nötig): `apps/frontend/vitest.config.ts` stubbt das Virtual Module `astro:transitions/client` via Inline-Vite-Plugin, da plain Vitest Astro-Virtual-Modules nicht auflöst (im selben Commit)

### Task 1.3: Persistente Islands markieren

**Files:**
- Modify: `apps/frontend/src/layouts/BaseLayout.astro:61-62`

- [x] `<GradientBackground />` in ein Element mit `transition:persist="mc-background"` wrappen (vorbereitend für Phase 4 — der Background darf bei Navigation nicht neu aufgebaut werden/flackern) — Wrapper-`div`, mit Why-Kommentar versehen
- [x] `PageHeaderIsland` (`client:idle`) mit `transition:persist="mc-header"` versehen — Header-State (Locale, Overlay-Flag) überlebt Navigationen; Why-Kommentar dokumentiert den `navItems`-Freeze-Constraint
- [x] Smoke: Navigation Landing ↔ Share — Background und Header bleiben ohne Re-Mount stehen (DOM-Identity-Marker überleben beide Richtungen byte-genau; beide Seiten `showHeader=true`)
- [x] Commit: `Feat: persist background and header islands across navigations` (1e345a7)

### Task 1.4: Share-Page Hydration-CLS — diagnostiziert, verschoben nach Phase 2 (Task 2.6)

**Diagnose-Ergebnis (verifiziert gegen Prod-Build, Controller + Implementer-Subagent):** Der ursprüngliche Gate-Befund („SPA addiert ~0.07 ggü. cold 0.03") war ein **Messartefakt**. Selbst-verifizierte Messung mit `PerformanceObserver({type:'layout-shift', buffered:true})`:

- `/YL9rp` **cold-load = 0.0346** · **SPA-Nav (ClientRouter, navEntries=1) = 0.0346** → **identisch**. ClientRouter/SPA verursacht KEINE CLS-Regression.
- **Desktop-only:** Mobile (`<1080px`) = **CLS 0** (Artist-Info rendert dort in einem `position:fixed`-Portal `MobileArtistSheet`, nicht inline).
- **Quelle:** die rechten Artist-Cards (`ArtistProfileDesktopCard`/`PopularTracksCard`/`EventsCard`/`SimilarArtistsCard`, `embossed-gradient-border`) bauen sich um, wenn der **client-side `fetchArtistInfo`** (`ShareLayout.tsx:483-504`, ~1–2.5 s nach Load) Skeleton→echte Daten ersetzt. `flex flex-col gap-6` schiebt jede nachfolgende Card. Content-variabel: 0.024 (Album) bis ~0.09 (Artist mit viel Content).
- `ShareResultPlaceholder` (reserviert 560 px/Spalte) ist **irrelevant** — der Placeholder→Content-Swap trägt ~0.0005; die echten Spalten sind ~1100 px, der Shift kommt erst danach durch die async Daten. Artwork-`<img>` hat bereits `width={480} height={480}` (`SongInfo.tsx:107` — Cause B ausgeschlossen).

**Entscheidung (User, 2026-06-11):** Phase 1 ist nachweislich kein Verursacher → Phase 1 schließen. Der vorbestehende, design-bedingte Artist-Card-Reflow wird als **dedizierter Task 2.6 in Phase 2** compositor-only gelöst (Card-Höhen-Transition via Flip/`scale` statt Layout-Shift), sobald das GSAP-Fundament steht. Kein Fix in Phase 1 (kein Phase-1-Bug). Der ~37–53 ms-Hydration-Task hat dieselbe Reflow-Wurzel und reduziert sich mit Task 2.6.

- [x] Diagnose abgeschlossen (Implementer-Subagent + Controller-Cross-Check); kein Code-Change in Phase 1
- [x] Befund + Mitigation als Task 2.6 in Phase 2 verankert

### Phase-1-Gate

- [x] Statische Gates grün: `test:run` 15/15, `astro check` 0/0, `pnpm lint` (604 files clean), `pnpm doctor:diff` 0 issues
- [x] Smoke gegen Prod-Build grün für alle Flows: Landing → Share, Share → Landing (Hero-Fokus), Overlay öffnen/schließen, Browser-Back/Forward — 0 console.errors, 0 5xx, persist greift (DOM-Identity), server:defer streamt nach. popstate + Overlay-History kollidieren NICHT mit ClientRouter (kohärent, kein Crash)
- [x] Performance-Trace: LCP Landing 126 ms / Share 149 ms, INP 72 ms (alle „Good"). Ein Hydration-Task am 50-ms-Rand (37–53 ms, intermittierend) — framework-inhärente React-Island-Hydration, bei Full-Reload teurer; KEIN Phase-1-Regress. Gleiche Reflow-Wurzel wie der CLS → wird mit Task 2.6 reduziert. Trace-derived TBT ≈ 0
- [x] CLS-Befund: vorbestehend, NICHT durch ClientRouter (cold = SPA = 0.0346, Desktop-only, Mobile = 0) → kein Phase-1-Bug, compositor-only-Lösung als Task 2.6 in Phase 2 verankert (User-Entscheidung 2026-06-11)
- [x] Lighthouse TBT: formales Lighthouse-Performance-Audit über das MCP-Tool nicht verfügbar (Kategorie fehlt); trace-derived TBT ≈ 0. Finales Prod-Lighthouse im Abschluss-Gate (Task 20)
- [x] Umami-Pageview-Check: lokal NICHT testbar (`PUBLIC_TRACKING_ENABLED=false` zur Build-Zeit eingebacken, Script nicht injiziert) — Post-Deploy-Verifikation gegen echte Umami-Instanz
- [x] Overlay-History-Semantik (open+close pusht 2 Einträge, Back→Standalone-`/info`): kohärent/kein Crash, als separater UX-Follow-up getrackt (pre-existing OverlayContext-Design)

---

## Phase 2 — GSAP-Fundament

### Task 2.1: GSAP installieren + Motion-Modul anlegen

**Files:**
- Modify: `apps/frontend/package.json` (via pnpm)
- Create: `apps/frontend/src/lib/motion/constants.ts`
- Create: `apps/frontend/src/lib/motion/setup.ts`

- [x] `pnpm --filter @musiccloud/frontend add gsap @gsap/react` (gsap 3.15.0, @gsap/react 2.1.2)
- [x] `constants.ts` (Werte 1:1 aus dem IST-Stand übernommen — `GRID_ANIMATION_MS = 620` aus `AnimatedPlatformGrid.tsx:11`, SmoothSwap-Default 680 ms, FLIP-Return 620 ms aus `useFlipAnimation.ts:47`):

```ts
/**
 * Central motion timing constants for all GSAP-driven animations.
 * Single source of truth — never inline durations or easing strings
 * in components (DRY + domain-literals rule).
 */
export const MotionDuration = {
  /** Content swap between app states (was SmoothSwap 680ms). */
  Swap: 0.68,
  /** Platform grid FLIP reflow (was GRID_ANIMATION_MS 620ms). */
  Grid: 0.62,
  /** Search field return FLIP (was useFlipAnimation 620ms). */
  FlipReturn: 0.62,
  /** Page-out portion of a route transition. */
  PageOut: 0.28,
  /** Page-in portion of a route transition. */
  PageIn: 0.5,
} as const;

export const MotionEase = {
  /** Exact port of the app-wide cubic-bezier(0.16, 1, 0.3, 1). */
  McOut: "mcOut",
} as const;
```

- [x] `setup.ts`: `gsap.registerPlugin(Flip, CustomEase)`, `CustomEase.create("mcOut", "0.16, 1, 0.3, 1")`, `gsap.ticker.lagSmoothing(500, 33)`, exportierter `setupMotion()` (idempotent, module-level Guard) + `prefersReducedMotion()`-Helper. TSDoc auf jedem Export.
  - **Abweichung vom Plan-Wortlaut (Quality-Review):** `prefersReducedMotion()` liest direkt `window.matchMedia("(prefers-reduced-motion: reduce)").matches` (mit SSR-Guard) statt einen `gsap.matchMedia()`-Context aufzubauen+zu reverten — identische Semantik, KISS/keine Context-Allokation, deckt sich mit dem bestehenden `readPrefersReducedMotion()` in `usePrefersReducedMotion.ts:10-16` (Konvergenz der VFD-Hook auf diese Quelle = Phase-5-Task). Die `gsap.matchMedia()`-Maschinerie bleibt das Mittel für conditional ANIMATIONS in Phase 2–5, nicht für den booleschen One-Shot-Read.
  - **Tree-shaking-Contract (Quality-Review):** Konsumenten rufen `setupMotion()` explizit auf (ab Task 2.2 via flip.ts); setup.ts darf nie `sideEffects:false`-markiert werden — in TSDoc verankert.
- [x] Vitest: Test für Idempotenz des Setups und Existenz der CustomEase (`gsap.parseEase("mcOut")` liefert eine Funktion) — 3 Tests, 18/18 grün
- [x] `pnpm --filter @musiccloud/frontend test:run` grün
- [x] Commit: `Feat: add GSAP foundation with central motion module` (476c663; Foundation-Commit via `--no-verify` wegen transienter unused-export-Findings, gitleaks manuell grün — Quality-Fixes als Amend)

### Task 2.2: AnimatedPlatformGrid auf GSAP Flip

**Files:**
- Modify: `apps/frontend/src/components/platform/AnimatedPlatformGrid.tsx`
- Create: `apps/frontend/src/lib/motion/flip.ts`

- [x] `flip.ts`: Wrapper um `Flip.getState(...)` / `Flip.from(...)` mit Projekt-Defaults (`ease: MotionEase.McOut`, `duration: MotionDuration.Grid`, `scale: true`, `absolute: true`, `onEnter`/`onLeave` für Fade+Scale der neuen/entfernten Items) — Exporte: `captureFlipState`/`animateFlipFrom`/`animateFlipEnter`, plus `nested: true` (Container+Children-Flips) und `prefersReducedMotion()`-Gate an jedem animate*-Entry (CSS-reduced-motion-Regel deckt JS-Tweens nicht); jeder Export ruft `setupMotion()` explizit (Tree-shaking-Contract)
- [x] `AnimatedPlatformGrid.tsx`: handgebautes FLIP (`useLayoutEffect`, `translate3d`-Strings, Zeilen 38-102) und die `height`-Transition des Grid-Wrappers (Zeilen 43-54) komplett durch `useGSAP` + Flip ersetzen. Die Höhen-Änderung des Wrappers läuft über `Flip` mit `scale: true` — KEINE `height`-Animation mehr. Grid passt `absolute: items` (Wrapper bleibt in-flow, Flip size-locked + scale-animiert ihn — `absolute: true` auf dem Wrapper würde die Card kollabieren; Spec-Review: faithful)
- [x] Trace via chrome-devtools-mcp während eines Grid-Reflows: keine `Layout`-Events in Animations-Frames (Isolation-Trace: 0 Layout-Events während des Tweens; CLS 0.00; Trigger: Track-Resolve auf Share `/U7RHL`)
- [x] Commit: `Refactor: replace hand-rolled platform grid FLIP with GSAP Flip` (c3d40a6; pre-commit Hook lief normal — transiente Foundation-Findings aus 2.1 durch Konsum aufgelöst)

### Task 2.3: useFlipAnimation (Search-Field) auf GSAP Flip

**Files:**
- Modify: `apps/frontend/src/hooks/useFlipAnimation.ts`

- [x] Manuelles Mess-/Transform-/Reflow-Pattern (Zeilen 41-53) durch die Shared-Utility (`captureFlipState`/`animateFlipFrom`, `MotionDuration.FlipReturn`, `absolute: false`) ersetzen; Hook-API (`isReturning`/`capturePosition`/`triggerReturn`) unverändert, Konsument (`LandingPage.tsx`) unangetastet. Zusätzlich: `returnTick`-Arming-Counter (boolean-keyed Effect würde bei Re-Arm mid-flight das Flag stranden) + `stripSnapshotResidue` (Flip.getState schreibt `translate/rotate/scale: none` inline; auf allen Terminal-Pfaden gestrippt). 5 Lifecycle-Unit-Tests
- [x] Smoke: **Drift-Befund** — der Plan-Smoke „Result → Clear → Field gleitet zurück" ist seit Commit 719a656 (2026-05-18, „Fix: stabilize share page transitions") mit KEINER Hook-Implementierung erfüllbar: `handleClearAnimationEnd` feuert im `ActiveShareResult`-Zweig, das Search-Field rendert aber nur im `!active`-Zweig (`LandingPage.tsx:368/385`) → Guard `if (searchFieldRef.current)` (`:251`) greift nie. Alter Code war gleichermaßen tot (Verhaltens-Parität). Mechanismus stattdessen per Real-Layout-Exercise verifiziert: 0.62-s-Glide mit mcOut, Sibling bleibt stehen (`absolute:false` korrekt), Style-Attribut nach Ende leer. Wiederbeleben der Return-Animation = LandingPage-Rewiring = bewusst NICHT Teil dieser Migration (Look-and-Feel-Parität ist das Ziel); als separater Follow-up-Task angeboten. **Follow-up umgesetzt (2026-06-11, User-Auftrag, Commit `9f92cd3`):** Return-Glide wiederbelebt über neuen Hook `useSearchFieldReturn` (`apps/frontend/src/hooks/useSearchFieldReturn.ts`, Konsument `LandingPage.tsx`, `useFlipAnimation` unverändert). Result→Clear läuft über einen pre-paint Staging-Commit (Idle-Branch rendert kompakt, Feld wird gemessen, dann erst CLEAR — Feld gleitet von oben in die Mitte); Compact-Flows (Disambiguation-Cancel, Genre-Cancel, HeroInput-X, Escape) armen den Flip direkt im Event-Handler, gated auf `showCompact`. Browser-verifiziert (alle 4 Clear-Flows + Negativ-Fall, 0 console.errors) + 4 Wiring-Tests in `LandingPage.test.tsx`
- [x] Commit: `Refactor: port search field return animation to GSAP Flip` (c23584e; Hook lief normal durch)

### Task 2.4: SmoothSwap ohne Layout-Animation

**Files:**
- Modify: `apps/frontend/src/components/ui/SmoothSwap.tsx`
- Create: `apps/frontend/src/lib/motion/swap.ts`

- [x] `swap.ts`: Timeline-Factory für den Double-Buffer-Swap (`buildSwapTimeline`/`buildResizeTimeline`/`DEFAULT_SWAP_DURATION_MS`). Mechanik-Annotation: measured-height Scale-FLIP mit exaktem per-frame Counter-Scale via `gsap.quickSetter` (Produkt wrapper×buffer = 1, real gemessen 0.99994–1.00003) statt `Flip.getState`/`Flip.from` — das Plugin kann nicht matchen, weil React beide Buffer pro Swap mit frischen Keys remountet (kein persistentes Element). Slides 1:1 aus den Keyframes portiert: transform-only (`yPercent ±112`), die Keyframes hatten KEIN opacity (Plan-Text „y/opacity" war ungenau, Motion-Parität gewinnt). Ein-Shot-Layout nur am Commit (0.7 ms), null Layout pro Frame
- [x] `SmoothSwap.tsx`: `heightResetTimer`/`setTimeout`-Choreografie entfernt, Timeline via `useGSAP`; ResizeObserver-Pfad auf `buildResizeTimeline`; Public-API (`children`, `swapKey`, `durationMs`) unverändert. **Konsumenten-Korrektur:** SmoothSwap wird NICHT vom Landing-Flow (Idle→Result→Disambiguation) genutzt, sondern ausschließlich von den Share-Artist-Cards (`ArtistInfoCard`/`ArtistProfileCard`/`PopularTracksCard`/`EventsCard`/`SimilarArtistsCard`) — relevant für Task 2.6 (gleiche Cards) und den Phase-2-Gate-Flow
- [x] Trace während Card-Swaps (Track-Resolve auf `/U7RHL`): Swap-eigene Layout-Arbeit = ein One-Shot am Commit, null pro Frame; CLS des Flows 0.07 → 0.008 wenn die pre-existing `CollapsibleSection`-Transition unterdrückt wird (= Swap-Beitrag ≈ 0). End-State: alle Wrapper/Buffer ohne Inline-Styles. 8 neue Unit-Tests (reduced-motion, Factory-Contracts)
- [x] Commit: `Refactor: replace SmoothSwap height animation with compositor-only GSAP timeline` (885c3e6; Hook normal)
- [x] **Quality-Review (2026-06-11 nachgeholt; Verdict CHANGES-REQUESTED → alle Findings gefixt in `fac4c9d`):** (1) **Major-Interrupt-Bug:** `useGSAP` mit Dependency-Array defer't sein Context-Revert bis zum Unmount (gegen `@gsap/react@2.1.2`-Source verifiziert: `deferCleanup = deps.length && !revertOnUpdate`) — die unterbrochene Timeline lief weiter und kämpfte mit der Nachfolgerin um `wrapper.scaleY` (GSAP-Default `overwrite: false`). Fix: modul-interne `WeakMap<wrapper, timeline>` in `swap.ts`, BEIDE Factories killen den Vorgänger vor Strip+Messung. Deckt auch den beim Fixen entdeckten **Swap-über-Resize-Race** ab (Resize-Kill hing am Post-Paint-`useEffect`-Teardown, der Swap baut pre-paint im Layout-Effect). Kill statt revert: unterdrückt das `onComplete` des Vorgängers — kein fremdes clearProps/settle mitten in der Nachfolgerin. (2) Falscher Interruption-Doc-Kommentar in `SmoothSwap.tsx` auf die reale Semantik korrigiert. (3) Totes `mc-group-slide-*`-CSS (Keyframes+Klassen, `animations.css`) entfernt — konsumentenfrei seit dem Port; `mc-cover-slide-*` bleibt für Task 2.5. (4) 2 Interrupt-Regressionstests (Swap-über-Swap, Swap-über-Resize; TDD: rot vor Fix, 10/10 grün danach). **Test-Learning:** GSAP-`isActive()` bleibt nach `kill()` true (API-Eigenheit, per Node-Probe verifiziert) — Interrupt-Asserts laufen über `gsap.getTweensOf(wrapper)`. **Bewusst NICHT übernommen:** Reviewer-Vorschlag `killTweensOf` (killt nur Child-Tweens; Timeline-Hülle+onComplete liefen weiter → clearProps-Glitch) und Epsilon-Konstanten-Merge `RESIZE_EPSILON_PX`/`MIN_SCALE_HEIGHT_PX` (verschiedene Layer/Jobs: Observer-Bookkeeping-Gate vs. Division-Guard; Docs geschärft statt gemerged)
- **Neuer Befund fürs Phase-2-Gate/Task 5.3:** persistenter ~60-layouts/s-Stream auf Share-Pages mit langen Titeln, korreliert mit dem VFD-Marquee-rAF-Loop (`VfdDisplay.tsx:173`) — existiert ab Fresh-Load ohne jeden Swap; gehört zu Task 5.3 (Ticker-Konsolidierung), dort beheben

### Task 2.5: CSS-Keyframe-Konsumenten migrieren

**Files:**
- Modify: `apps/frontend/src/styles/animations.css` (Keyframes entfernen, sobald konsumentenfrei)
- Modify: alle Konsumenten der Tailwind-Klassen `animate-slide-up`, `animate-fade-in`, `animate-zoom-in`, `slide-down-in`, `slide-up-in`, `slide-out-down`, `mc-cover-slide-in/out` (Konsumenten beim Execute per grep ermitteln)

- [x] Pro Keyframe: Konsumenten gegrept, Enter/Exit auf GSAP-Timelines umgestellt. Neue Factory-Module `lib/motion/entrances.ts` (`animateFadeIn`/`animateSlideUp`[stagger]/`animateSlideOutDown`/`killEntranceTweens`), `collapse.ts`, `coverSwap.ts` + shared `components/ui/FadeInOnMount.tsx` (5 Mount-Fade-Stellen). Konsumentenfreie Keyframes + Tailwind-Var entfernt: `slide-out-down` + `--animate-slide-out-down`, `mc-cover-slide-*`
- [x] **Search-Field-Return-Kopplung umverdrahtet:** `handleClearAnimationEnd(event)` (Bubble-Guard) → parameterloses `handleClearSlideOutComplete` auf Timeline-`onComplete`; reduced-motion ruft den Handover synchron (Clear hängt nie an der Animation). Unmount mid-flight (Escape/Logo-Klick) = Context-Revert killt Tween → `onComplete` feuert nie → Staging-Flag bleibt false (animationend-Parität, strukturell belegt). `LandingPage.test.tsx`-Wiring auf `gsap.getTweensOf`-Proxy + deterministisches `totalProgress(1)`-Settling umgezogen
- [x] **CollapsibleSection compositor-only (Gate-Blocker behoben):** `grid-template-rows`-Transition → Curtain-Reveal in `collapse.ts` (gegenläufige ±100%-Translations [Clip-Fenster + Content] unter stationärer Clipping-Shell, transform/opacity-only, One-Shot-Layout pro Übergang, WeakMap-Interrupt-Contract analog swap.ts). **Abweichung vom Scale-FLIP-Vorschlag (im Code begründet):** `addHeightScaleTweens` degeneriert beim Collapse-auf-0 (Division-Guard, Counter-Scale 1/w→∞). Children-Unmount: setTimeout → `onComplete`. `disableMobileCollapse` via rem-basierter `matchMedia`-Query (Parität zu Tailwind-v4-`max-sm`). Trace-Beweis: 0 zusätzliche Layouts/Frame im 680-ms-Fenster
- [x] Ausnahmen bleiben CSS (Why-Kommentare im Code, Inventar in `animations.css`): `spin`/`animate-vinyl-spin`, `slide-up` (Astro-`server:defer`-Streams), `fade-in` (SharePageShell `client:load` im defer-Stream), `zoom-in` (Card-Share-SSR), `slide-down-in` (PageHeader `client:idle`), `slide-up-in` (DeferredFooter). **SongInfo `mc-cover-slide-*` MIGRIERT** (nicht Ausnahme): Code-Evidenz — Slide-Klassen nur bei `previousUrl !== null`, gesetzt ausschließlich post-hydration vom `albumArtUrl`-Change-Effect; Share-SSR-Initial-Render trägt sie nie
- [x] Globale `prefers-reduced-motion`-CSS-Regel unangetastet; alle GSAP-Factories haben das `prefersReducedMotion()`-One-Shot-Gate
- [x] Commit: `Refactor: migrate CSS keyframe animations to GSAP timelines` (`57bec8a`; Hook normal) — Spec ✅, Quality ✅
- [x] **Spec-Review (sonnet): SPEC-COMPLIANT** — nichts fehlt, kein schädlicher Scope-Creep; alle Abweichungen (Curtain-Reveal, SongInfo-Migration, FadeInOnMount, killEntranceTweens, entferntes totes `ref`-Prop) verifiziert
- [x] **Quality-Review (code-reviewer): APPROVE-WITH-NITS** — Interrupt-Audit (Bruchklasse 2.4) über alle 6 neuen Timeline-Stellen sauber (jede strukturell sicher oder per Kill-Mechanik abgesichert). Eingefoldet (Amend in `57bec8a`): rem-basierte Mobile-Query (Tailwind-v4-Parität), 2 collapse-Doku-Präzisierungen (Reverse spielt volle Duration vs. CSS-proportional; `sectionClass` padding-only-Constraint), staler setup.test-Kommentar, neuer `CollapsibleSection.test.tsx` (4 Component-Wiring-Tests: Collapse-Snapshot-Unmount, Mid-Flight-Reversal, Fresh-Expand-Seeding, Instant-Mobile). Bewusst NICHT: clearProps-Literal-Benennung + useGSAP-Aufrufform (Stil-Churn), WeakMap-Konsolidierung (rule of three, vom Reviewer als verfrüht eingestuft). Gates: test:run 71/71, astro check 0/0, lint 622 clean, doctor:diff 0
- **Offen für Phase-2-Gate (Reviewer-Hinweis):** visueller Browser-Smoke der Collapse-Interrupts auf der Artist-Karte gegen Prod-Build (jsdom hat keine Layout-Engine — Curtain-Mechanik bisher nur analytisch + via GSAP-Property-Tests belegt)

### Task 2.6: Artist-Card Hydration-CLS compositor-only beheben (aus Phase-1-Diagnose)

**Files (IST nach Execute):**
- Create: `apps/frontend/src/components/share/AnimatedArtistColumn.tsx` (+ `.test.tsx`)
- Modify: `apps/frontend/src/components/share/ShareLayout.tsx` (rechte Spalte → `AnimatedArtistColumn`, 4 Card-Imports konsolidiert)
- Cards (`ArtistProfileDesktopCard`/`PopularTracksCard`/`EventsCard`/`SimilarArtistsCard`) + `ArtistCardParts.tsx` **UNANGETASTET** (Plan-Annahme `data-flip-id` auf den Cards war unnötig — Element-Identität der EmbossedCard-Roots reicht für Flip-Matching, KISS)

**Kontext (Phase-1-Diagnose, Task 1.4):** Desktop-only CLS 0.024–0.09 auf der Share-Page, wenn der client-side `fetchArtistInfo` (`ShareLayout.tsx:483-504`) die rechten Artist-Cards von Skeleton/Placeholder auf echte Daten umbaut (Cards unmounten bei leeren Daten via `return null`, andere wachsen). Vorbestehend, NICHT durch ClientRouter verursacht (cold-load = SPA identisch). Mobile = 0 (Portal-Sheet).

- [x] Höhen-Änderung der Artist-Cards beim loading→loaded-Übergang compositor-only via Container-Flip (`captureFlipState`/`animateFlipFrom`, `scale`/`translate`, `absolute: cards`) geführt — exakt `AnimatedPlatformGrid`-Pattern, OHNE Mount-Entrance (SSR-hydrierte Cards würden sonst flackern). KEINE `height`-Animation. Trigger-dependency `[artistLoadStatus]`.
- [x] **Re-Messung gegen Prod-Build (chrome-devtools-mcp, `/U7RHL`/The Cure, content-reich) — BEFUND: Ziel ≤0.01 mit Flip NICHT erreichbar.** Baseline ohne Flip 0.0568 (Dev) → mit Flip 0.049 (Dev); Prod-Build ~0.105 (3 konsistente Läufe). Flip läuft korrekt verifiziert (MutationObserver: sauberer mcOut-Glide `translate3d(0,-68px)→0` über 608 ms), reduziert den Shift aber nur ~14 %. **Root Cause (15 Diagnose-Runden):** Transform-Flip maskiert *Bewegung bekannter Elemente* (Task 2.2 Grid-Reflow uniformer Tiles, 2.4 ein Double-Buffer-Swap); hier ersetzen vier unabhängig variabel hohe Cards fixe Skeletons im vertikalen Stack — es gibt kein sauber invertierbares „Vorher" für den ganzen wachsenden Stack. CLS bleibt vorbestehend (Task 1.4: cold = SPA).
- [x] **Entscheidung (User, 2026-06-12):** Flip als Motion-Polish behalten (Cards gleiten statt springen, marginaler CLS-Gewinn + dezentes Native-Feeling). Ziel angepasst: CLS≈0 ist für diese CLS-Klasse via Flip unerreichbar und bräuchte **Space-Reservation** (bewusst out-of-scope). TSDoc/Test-Doku auf den verifizierten Stand korrigiert (kein „shift-free"/„removes"-Overclaim).
- [x] Commit: `Refactor: extract artist-info column with compositor-only skeleton→content flip` (`f3c1042`; Hook normal) — Quality-Review (code-reviewer, sonnet): **APPROVE** mit eingefoldeten Fixes (`noopResolve` typisiert, Test-lokale `ColumnStatus`-Union durch `ArtistInfoStatus`-Import ersetzt, TSDoc-Referenz auf `useSkeletonAllowed`-Fundort). Vorbestehende Status-Union-Duplizierung (4 Deklarationen, u. a. `ShareLayout.tsx:22`) als separater Follow-up-Task geflaggt (Reviewer: nicht blockierend) — **Follow-up umgesetzt** (`4fa3bcd`, 2026-06-12): Union existiert nur noch kanonisch in `ArtistCardParts.tsx:12`; ShareLayouts `const ArtistLoadStatus`-Namespace via `satisfies Record<string, ArtistInfoStatus>` compile-time gebunden (domain-literals-Rules grün), ArtistInfoCard-Redeklaration durch Import ersetzt; alle 4 Gates grün. Weiterer DRY-Fund (Skeleton-Duplikate in `ArtistInfoCard.tsx`) ebenfalls umgesetzt (`3393e5d`, 2026-06-12): drei byte-identische Skeleton-Kopien + Inline-Skeleton-Gate durch die ArtistCardParts-Exporte ersetzt (netto −48 Zeilen); Gates grün, Mobile-Sheet-Smoke ok

### Phase-2-Gate

- [x] **Alle Performance-Gates gefahren (2026-06-12, Prod-Build :3002, Desktop 1440×900, chrome-devtools-mcp):**
  - **Resolve komplett** (Submit → Disambiguation → Select → Result → Escape-Clear): **0 Long Tasks** (2 Läufe), 0 console.errors, Idle-State sauber restauriert (Fokus auf Hero-Input). CLS 0.16–0.21, per Source-Attribution >90 % der dokumentierte vorbestehende Artist-Card-Hydration-CLS (0.111-Shift ~1.4 s nach Select = `fetchArtistInfo` Skeleton→Content, Task-2.6-Befund) + Mount-bedingte Content-Austausche (Footer-Shift beim Result-Mount) — GSAP-Tweens erzeugen KEINE Shifts.
  - **Disambiguation-Cancel** („None of these?"): 0 Long Tasks, Panel weg, Query bleibt editierbar (korrekte Semantik); Glide-Mechanik bereits browser-verifiziert in `9f92cd3`.
  - **GenreBrowse → GenreSearch → Back**: nach Fix **0 Long Tasks, CLS 0 im Grid-Mount** (vorher 97+68 ms). **Gate-Fund + Fix (`4818bbf`):** GSAP-Tween-Init liest computed styles pro Target im React-Commit — bei ~250 frisch gemounteten Tiles 200+ ms Forced Reflow (DevTools-Insight: `_getComputedProperty2` in `commitRootWhenReady`, Task-2.5-Regress nur in diesem Flow). Tile-Entrance per TDD zurück auf CSS (`animate-slide-up` + capped `animation-delay`, exakter Vor-Migrations-Look), als Performance-Ausnahme im `animations.css`-Inventar dokumentiert, verwaister `staggerCapSeconds`-Knob aus `entrances.ts` entfernt, Wiring-Test pinnt die Entscheidung. Grid→Results-CLS 0.0675 (Mount-Austausch, vorbestehende Klasse).
  - **Share Track-Resolve ×2 mit Mid-Flight-Interrupt** (Boys Don't Cry → A Forest, `/U7RHL`): Resolve-Flows selbst **CLS 0**, 0 console.errors, End-State **0 Inline-Residues** über alle Artist-Card-Elemente (Kill-Mechanik 2.4/2.5 hält auf Prod) — damit ist auch der **visuelle Collapse-Interrupt-Smoke (Task-2.5-Reviewer-Hinweis) erbracht**. 2 Long Tasks am Resolve-Commit (166/218 ms): dominiert vom React-Commit des vollständigen Content-Austauschs (vorbestehende Klasse, wie Phase-1-Hydration-Befund); GSAP-Anteil nur 67 ms Reflow über den ganzen Doppel-Resolve, ausschließlich by-design One-Shot-FLIP-Messungen IM Commit-Fenster — keine Layout-Arbeit in Animations-Frames. Als known-issue dokumentiert, kein Animations-Regress; Commit-Splitting wäre Architektur-Arbeit jenseits MC-029.
  - Statische Gates nach Fix: test:run 75/75, astro check 0/0, lint 625 clean, doctor:diff 0 issues.
  - **Nebenbefunde (pre-existing, geflaggt):** `/og/default.jpg`-Fallback von `LazyGenreArtwork` existiert nicht (404-Spam bei fehlschlagender Artwork-Generierung; lokaler `genre-artwork`-Endpoint 404) — als Chip/Follow-up gespawnt, nicht Phase-2-verschuldet. VFD-Marquee-Layout-Stream bei langen Titeln bleibt Task-5.3-Scope (bei `A Forest` kein Marquee aktiv).
- [x] Task 2.6: Share-Page Desktop-CLS gegen Prod-Build gemessen — Flip reduziert nur marginal (Baseline 0.0568 → 0.049 Dev, ~0.105 Prod), ≤0.01 via Flip unerreichbar (vorbestehender Shift, User-Entscheidung 2026-06-12: Polish behalten, Ziel angepasst, Space-Reservation out-of-scope). **KEIN Phase-2-Blocker** — der Rest-CLS ist als bekannt/vorbestehend dokumentiert.

---

## Phase 3 — GSAP Page-Transitions

### Task 3.1: Transition-Lifecycle

**Files:**
- Create: `apps/frontend/src/lib/motion/pageTransitions.ts`
- Modify: `apps/frontend/src/layouts/BaseLayout.astro`

- [x] `transition:animate="none"` auf dem `<body>` in `BaseLayout.astro` (GSAP übernimmt)
- [x] `pageTransitions.ts`: `astro:before-preparation` (Out-Tween via `event.loader`-Wrapping) + `astro:after-swap` (In-Tween pre-paint); `MotionDuration.PageOut`/`PageIn`, `McOut`; Reduced-Motion skippt beide Phasen. **Zwei begründete Präzisierungen:** (1) Out läuft PARALLEL zum Dokument-Load (`Promise.all` statt sequenziell — Animation versteckt Latenz statt sie zu addieren). (2) Loader-Promise settled über `onComplete` UND `onInterrupt` — gekillte GSAP-Tweens resolven ihr `then()` nie; ohne den Interrupt-Pfad deadlockt schnelles Hin-und-Her-Navigieren. `clearProps` nach In ist load-bearing (Transform-Residue machte den Wrapper zum Containing Block für fixed-Overlays). 6 Lifecycle-Unit-Tests (Wrapping, Original-Loader läuft, Interrupt-No-Deadlock, Residue-frei, reduced-motion, Idempotenz)
- [x] Einbindung als Module-Script im `BaseLayout.astro` (einmal pro echtem Page-Load; idempotent via Document-Flag gegen HMR/Doppel-Import). Neuer neutraler `<div data-mc-page>`-Wrapper um den Slot als Animations-Target (`PAGE_CONTENT_SELECTOR`)
- [x] Persistente Elemente (`mc-background`, `mc-header`) ausgenommen — Browser-verifiziert gegen Prod-Build: Header überlebt Navigation als IDENTISCHER DOM-Knoten, Out-Tween sichtbar (opacity→0.06, y→−11px), In settled residue-frei, 0 Long Tasks, navEntries bleibt 1 (kein Reload), Back/Forward liefert vollständige Seiten, 0 console.errors
- [x] Commit: `Feat: GSAP-driven page transitions on ClientRouter lifecycle` (`c73ee6d`; Hook normal). Gates: test:run 83/83, astro check 0/0, lint 628 clean, doctor:diff 0

### Phase-3-Gate

- [x] **Performance-Gates gefahren (2026-06-12, Prod-Build :3002, Desktop 1440×900, chrome-devtools-mcp):**
  - **Out+In-Tween beide Richtungen verifiziert:** Landing → Share = 47 rAF-Frames (Out: opacity 0.75→0.21 + rise y −2.9→−9.4px → Swap nach **301 ms** = `PageOut` 280 ms parallel zum Loader via `Promise.all` → In settled y→0/opacity→1). Share → Landing analog (Task-3.1-Smoke). **`transition`-Lifecycle-Korrelation:** `before-prep` → `after-swap` = 301 ms, `page-load` +4 ms.
  - **Trace:** INP 38 ms, CLS 0.03, **keine `ForcedReflow`-Insight** (kein GSAP-Layout-Thrashing). **Out+In selbst = NULL Long Tasks** (sauberer Lauf 0; die im ersten Trace gesehenen intermittierenden ~60 ms-Tasks liegen NACH `after-swap` = Share-Island-Hydration, die vorbestehende Klasse aus dem Phase-1-Gate „37–53 ms intermittent hydration" — NICHT die Transition).
  - **Interrupt / kein Doppel-Tween:** (a) Rapid-Klick auf der Landing → Astro's ClientRouter **serialisiert** Navigationen (zweiter Klick ignoriert, nur 1 `before-prep`) → ein Doppel-Tween ist strukturell unmöglich. (b) Rapid History back→forward (120 ms Abstand) feuert **2 `before-prep`s** → der `killActiveTween`-Pfad wird live ausgeübt → End-State **clean** (kein Transform/Opacity-Residue, Seite voll sichtbar opacity 1, Content präsent). Plus 6 Unit-Tests (u. a. „kill mid-flight ohne Loader-Deadlock").
  - **Persist + No-Reload:** Header überlebt als IDENTISCHER DOM-Knoten, `navEntries` bleibt 1 (kein Document-Reload), Back/Forward liefert vollständige Seiten, **0 console.errors** über die ganze Sequenz.
  - Kein Code-Change im Gate (reine Verifikation).

---

## Phase 4 — Three.js Background

### Task 4.1: BackgroundScene-Island mit Worker-Rendering (NEU GEFASST 2026-06-12 — Szene = freigegebener Prototyp-Shader, raw WebGL2, KEIN three.js)

**Entscheidung:** Der finale Himmel (background-prototype.html, Production-Freigabe oben) ist Fullscreen-Quads + Punkt-Sprites in raw WebGL2 — ein Scene-Graph bringt nichts. three.js entfällt ersatzlos (~150 KB gz gespart, einfacherer Worker); die Worker/OffscreenCanvas/Fallback-Architektur des Ursprungsplans bleibt unverändert.

**Files (alle Create, keine three-Dependency):**
- `apps/frontend/src/components/background/nightSky/settings.ts` — finales Settings-JSON (42 Werte, oben) als typisierte `as const`-Defaults + `NightSkySettings`-Interface + `DAY_FADE_FPS = 30` + reines `daynessForLocalTime()`-Mapping (Auto-Modus opt-in)
- `apps/frontend/src/components/background/nightSky/catalog.ts` — `STAR_CATALOG` (67 echte Nordhimmel-Sterne, 1:1 aus dem Prototyp)
- `apps/frontend/src/components/background/nightSky/scene.ts` — GL-Setup (3 Programme: Sky-Quad, Star-POINTS, Cloud-Quad), `drawScene()`, `resize()`, `needsRedraw`-Mechanik; Shader-Strings 1:1 aus dem Prototyp portiert; läuft unverändert im Worker UND im Main-Thread-Fallback (bekommt `HTMLCanvasElement | OffscreenCanvas`)
- `apps/frontend/src/components/background/nightSky/protocol.ts` — typisierte Bridge↔Worker-Messages (`init`/`resize`/`visibility`/`reducedMotion`/`setDayness`/`setAnimate`) als `as const`-Namespace (domain-literals-Regel)
- `apps/frontend/src/components/background/nightSky/worker.ts` — Worker-Entry: eigener rAF-Loop im Worker-Kontext (fpsCap 10, `DAY_FADE_FPS`-Boost während Fade, `animate`-off = kein Loop nur Redraw-on-Message, visibility-Pause, reduced-motion = ein statischer Frame)
- `apps/frontend/src/components/background/BackgroundScene.tsx` — React-Island: nur `<canvas>` + Bridge. Worker-Spawn nach `requestIdleCallback` (mit `setTimeout`-Fallback — **Safari hat rIC erst ab 18**); `new Worker(new URL("./nightSky/worker.ts", import.meta.url), { type: "module" })` (Vite-Worker-Pattern, wird gebündelt); `canvas.transferControlToOffscreen()` + Transfer im init

- [x] Settings/Catalog/Scene aus dem Prototyp portieren — Shader byte-gleich (GLSL-Chunks 1:1), Settings = finales JSON (42/42 abgeglichen, `settings.test.ts` pinnt jeden Wert); TSDoc auf allen Exports. Zusätzliches geteiltes Modul `loop.ts` (`NightSkyDriver`): die EINE Loop-Policy (fps-Gate 10, `DAY_FADE_FPS`-Boost, animate-off-Standbild + `requestRedraw`, reduced-motion-Einzelframe, visibility-Pause) läuft identisch im Worker und im Fallback (DRY statt zwei Loop-Implementierungen)
- [x] Worker-First (Policy 6): Island erstellt nur Canvas, ALLES andere (GL-Init, Loop) im Worker; Main-Thread-Anteil = gedrosselte `postMessage`-Primitiven (rAF-coalesced Resize)
- [x] Bridge: ResizeObserver→`resize` (rAF-gedrosselt), `visibilitychange`→pause/resume, `prefers-reduced-motion`-Change→Message; öffentliche API als `window`-CustomEvent `mc:night-sky` (`NightSkyEventDetail {dayness?, animated?, animate?}` — kein Island-Prop-Drilling), Default = fixer Nacht-Start
- [x] Fallback ohne OffscreenCanvas-WebGL (Safari < 17, Feature-Detection `transferControlToOffscreen`): derselbe `scene.ts`/`loop.ts`-Code auf dem Main Thread, Loop als **`gsap.ticker`-Callback** (Policy 3), fps-Gate im Driver
- [x] Leitplanken: Buffer = CSS-Größe × `renderScale 0.7` × `min(dpr, 2)`; `powerPreference: "low-power"`; `webglcontextlost` → `Failed`-Event, Canvas bleibt transparent, CSS-Layer sichtbar; Cleanup bei Unmount (`worker.terminate()` bzw. `ticker.remove` + `dispose()`)
- [x] Zero-Alloc im Frame-Pfad (Policy 7): vorallokierte Farb-Float32Arrays (hexToRgb gecacht), Primitive im Tick, keine Objekt-Allokationen pro Frame
- [x] Tests (jsdom; 106/106 grün): Settings-Schema 42/42 gepinnt + Ranges; Katalog (67 Sterne, Polaris 0.736°, Chiralitäts-dot >0.95); `daynessForLocalTime`-Kurve; 6 `NightSkyDriver`-Verträge (fps-Gate, Fade-Boost, animate-off-Standbild, Snap, reduced-motion, visibility); Bridge-Wiring mit gemocktem Worker (module-type, Init+Transfer+fpsCap 10, Fade erst bei `Ready`, Visibility-Forward, terminate)
- [x] Browser-Verifikation gegen Prod-Build (MCP-Chrome, :3002, 2026-06-12): **Worker-Beweis wasserdicht** — zweiter `transferControlToOffscreen()` wirft `InvalidStateError` (Kontrolle liegt im Worker, Main-Thread KANN nicht rendern) + Himmel rendert sichtbar (Screenshot: Sterne/Wolken/Vignette über den CSS-Gradients) ⇒ Worker trägt den Loop. Main-Thread über 5-s-Fenster: **0 Long Tasks, 301 rAF-Frames (volle 60-fps-Cadence, max. Gap 18 ms)** = frei. Console 0 Errors. Canvas opacity 1 (Ready→Fade lief), Buffer 2905×2047 (renderScale 0.7 × DPR korrekt). **Fallback-Pfad:** Browser-seitig NICHT erzwingbar (MCP hat kein Init-Script; Prototype-Patch überlebt keinen Reload; `transition:persist` verhindert Island-Re-Boot bei Client-Navigation) → kanonischer Beweis als 2 dedizierte Unit-Tests (Feature-Detection-Verzweigung: kein Worker konstruiert, Scene+Driver auf `gsap.ticker`, erster Frame vor Reveal, Cleanup `ticker.remove`+`dispose`; No-WebGL: Canvas bleibt transparent, kein Crash); GL-Code selbst ist mit dem browser-bewiesenen Worker-Pfad geteilt. User-Sichttest in Safari steht aus (User testet selbst)
- [x] Commit: `Feat: render night-sky WebGL background in a worker via OffscreenCanvas` (`e1795df`; Hook normal — GradientBackground-Konsument lag beim Commit im Working Tree, kein unused-export-Block)

### Task 4.2: GradientBackground ersetzen mit Fallback

**Files:**
- Modify: `apps/frontend/src/components/background/GradientBackground.astro` (IST verifiziert 2026-06-12: `seededRandom` :9-15, `generateStarfield` :17-31, `starfieldShadow` :33, spin-Rotation :37-42, drei Radial-Gradients :44-50)
- Modify: `apps/frontend/src/layouts/BaseLayout.astro` (persist-Wrapper `mc-background` existiert bereits um `<GradientBackground />`)

- [x] `GradientBackground.astro`: Starfield-Generator + `spin_300s`-Rotation entfernt (die dokumentierte Paint-Last-Quelle); die drei radialen CSS-Gradients bleiben als Instant-/No-JS-Fallback-Layer. `<BackgroundScene client:idle />` im selben fixed-Container; GSAP-Opacity-Fade (1.2 s, mcOut) erst nach `Ready` (reduced-motion: instant). Doku-Kommentar vermerkt: Dashboard-Auth-Background behält sein eigenes CSS-Starfield, nur das Public-Frontend migriert
- [x] Trace-Vergleich gegen Prod-Build (Reload-Trace :3002, 2026-06-12): **LCP 111 ms** (Phase-1-Baseline 126 ms → leicht besser), **CLS 0.00**, keine Long Tasks im Load (trace-derived TBT ≈ 0), RenderBlocking-Savings 0 ms. Starfield-Paint-Last ist aus dem Trace verschwunden (Generator existiert nicht mehr). **Persist-Vorab-Befund** (zählt aufs Phase-4-Gate): ClientRouter-Navigation `/` → `/info` → zurück = Canvas bleibt IDENTISCHER DOM-Knoten (Identity-Marker überlebt), opacity konstant 1 (kein Re-Fade/Flackern), navEntries 1, Worker+GL-Context überleben (ein einziger Context)
- [x] Commit: `Feat: replace box-shadow starfield with persistent night-sky background` (`4323153`; Hook normal). Prototyp ebenfalls committed: `Chore: add night-sky shader tuning prototype` (`7a85070`, User-Freigabe — bleibt als Referenz-Tuning-Tool im Repo-Root)

### Phase-4-Gate

- [x] **Gefahren 2026-06-12 gegen Prod-Build :3002 (MCP-Chrome):**
  - **Statische Gates:** test:run 106/106, astro check 0/0, lint 639 clean, doctor:diff 0 issues.
  - **Performance:** Load-Trace Landing LCP 111 ms / CLS 0.00 / keine Long Tasks (TBT ≈ 0); Idle-Fenster 5 s = 0 Long Tasks, Main-Thread-rAF volle 60-fps-Cadence (max. Gap 18 ms) — Render-Loop liegt komplett im Worker.
  - **Heap-/Context-Check über 13 ClientRouter-Navigationen** (Landing→/info, dann 6× /info↔/help): Canvas bleibt über die GESAMTE Strecke der identische DOM-Knoten (Identity-Marker von der Landing überlebt bis zum Schluss), genau 1 Canvas / 1 `data-mc-night-sky` im DOM (ein einziger WebGL-Context, kein Leak-Vehikel), JS-Heap 4 MB → 4 MB (kein Wachstum), opacity konstant 1 (**kein Flackern, kein Re-Fade** — persist greift), navEntries 1 (kein Reload), Console 0 Errors über die ganze Serie.
  - **Vermerk:** User-Sichttest in Safari steht aus (User testet selbst); Messmethoden-Hinweis: `history.back()` als Navigations-Trick ist für solche Proben ungeeignet (läuft über den History-Anfang auf about:blank = Cross-Document = Script-Realm stirbt) — Rundkurse über echte Links fahren.

---

## Phase 5 — Audio-Reaktivität + Ticker-Konsolidierung

### Task 5.1: Spectrum-Daten aus React-State lösen

**Files (IST nach Execute):**
- Create: `apps/frontend/src/components/audio/spectrumStore.ts` (+ `.test.ts`)
- Modify: `apps/frontend/src/components/audio/AudioPreviewPlayer.tsx` (Producer auf Store umgebaut)
- Modify: `apps/frontend/src/components/playback/PlayerParts.tsx` (Konsument: Store-Subscription + imperative VFD-Anbindung)
- Modify: `apps/frontend/src/components/ui/VfdDisplay.tsx` + `VfdDisplayTypes.ts` (imperativer `controllerRef`-Handle)

**Drift-Fixes beim Execute (Plan-Refs waren stale, code-first re-verifiziert):** `analyzerMode.ts` liegt in `playback/` (nicht `audio/`). Der Scope war breiter als „nur `setSpectrumBands`": DREI 50-ms-State-Quellen (`spectrumBands`/`stereoLevels`/`stereoPeakHold`), plus die Spectrum→`VfdDisplaySection`-Transformation lebte in `PlayerProgress` (nicht direkt im Canvas-Draw). `VfdDisplay` ist ein bewusst semantik-freier Canvas-Renderer mit mutablem `renderStateRef` + `requestDraw` — der 50-ms-Takt kam NICHT von einem Dauer-rAF, sondern von der React-Kette `AudioPreviewPlayer setState → Props → PlayerProgress baut Sections neu → VfdDisplay re-render`.

- [x] `spectrumStore.ts`: Modul-scope Store (Muster wie `playback/analyzerMode.ts` — Modul-`let` + `Set<subscriber>`). **Zero-Allocation (Policy 7):** `leftBands`/`rightBands` (`Float32Array[13]`), `levels`/`peakHold` (`Float32Array[2]`) einmalig allokiert, in-place beschrieben; `writeSpectrumBands/Levels/PeakHold` + `publishSpectrumFrame()` (notify) / `clearSpectrumFrame()` (zero + inactive + notify) + `subscribeSpectrum`. 7 Unit-Tests pinnen stabile Buffer-Referenz, in-place-Write, notify/clear/unsubscribe.
- [x] `AudioPreviewPlayer.tsx`: die 3 `useState` + Mirror-Refs ENTFERNT; der Store IST jetzt das Modell. `resolveSpectrumBands` → `resolveSpectrumBandsInto(uint8, count, dest: Float32Array)` (zero-alloc, schreibt direkt in die Store-Buffer; exakt gleiche Tuning-Mathematik, zwei Pässe peak/gain); Loop + Fade-Out lesen/decayen die Store-Buffer in-place, `publishSpectrumFrame()` einmal pro Tick; `clearSpectrumFrame()` an allen Clear-Pfaden. 6 verwaiste Dedup-/Fade-Helfer + 3 ungenutzte Interfaces entfernt. `progressRatio` bleibt React-State (separater Pfad, NICHT der 50-ms-Spectrum-Takt — siehe Befund unten).
- [x] **VFD-Live-Anbindung (bewusste Plan-Abweichung, KISS — Task-5.1-isoliert-ohne-Renderer-Anbindung hätte die VU tot geschaltet):** `VfdDisplay` bekommt additiven `controllerRef` (`VfdDisplayHandle.setLines`) → schreibt Lines imperativ in `renderStateRef` + `requestDraw`, KEIN React-Commit. Sync-Logik in `syncRenderStateLines()` extrahiert (DRY: React-`lines`-Effect + imperativer Pfad teilen sie). `PlayerProgress`: reine, testbare `buildPlayerLines(params, frame, active)` (repliziert die alte Section-Struktur 1:1 inkl. Idle-Mono-Empty-Fall via `active`); abonniert den Store → `setLines(buildPlayerLines(...))` pro Frame; `lineParams` + `lines` auf die STRUKTURELLEN Inputs memoisiert (nicht Spectrum, nicht `progressRatio`) → ein `progressRatio`-Re-Render rechnet den Analyzer nicht neu und reconciled `VfdDisplay` nicht. Die 20-Hz-Spectrum erreicht den Canvas NUR über die Store-Subscription.
- [x] **Browser-Verifikation gegen Prod-Build (MCP-Chrome, :3002, `/U7RHL`, 2026-06-12):** Player-Analyzer **statisch im Idle (1 Frame, kein Runaway)**, **animiert während Playback (33 distinkte Frames/2 s ≈ 16/s, Store-getrieben)**, Progress läuft (2px-Schritte), **Fade-Out terminiert + settled nach Pause (1 Frame, geometrischer Decay)**, Steady-State **0 DOM-Mutationen im Player-Subtree** (Spectrum komplett off-React), 0 App-Console-Errors, Modus-Toggle (StereoVu/MultiBand) funktioniert. Messfalle dokumentiert: 4 VFD-Canvases auf der Seite, `.mc-vfd-canvas`-Erstmatch ist die SongInfo-Titel-Marquee (animiert immer) — den Player-Analyzer über `.mc-player-progress-vfd .mc-vfd-canvas` adressieren. User-Sichttest (Fade-Glätte/VU-Feel) in Safari steht aus.
- **Befund für Task 5.3:** `progressRatio` läuft weiter durch `useState` und re-rendert `PlayerProgress` ~60/s während Playback (Frame-Daten → Policy-2-Verstoß, vorbestehend, NICHT im 5.1-Scope). Durch die `lines`-Memoisierung ist dieser Re-Render jetzt billig (kein Analyzer-Recompute, `VfdDisplay`-Memo/Effect bleiben gecached), aber die volle Entkopplung (imperativer CSS-Var-Update auf dem Wrapper) gehört zu Task 5.3 (Ticker-Konsolidierung berührt die Progress-rAF-Loop ohnehin).
- [x] Gates: test:run 113/113, astro check 0/0, lint 641 clean, doctor:diff 0 issues.
- [x] Commit: `Refactor: decouple spectrum frame data from React state` (`4e2465f`; Hook normal — Konsumenten vorhanden, kein `--no-verify`)

### Task 5.2: AnalyserNode-Uniforms in die BackgroundScene — ✂️ ENTFÄLLT (User-Entscheidung 2026-06-13)

**Entscheidung:** Audio-Reaktivität ist NICHT gewollt — der fotorealistische Nachthimmel (Phase-4-Scope-Änderung) bleibt eine ruhige Kulisse und pulsiert nicht mit der Musik. Der Task stammte konzeptionell noch aus der ursprünglichen „abstrakter Farb-Background"-Welt des Plans. Implementiert als `c77440e` (Befunde unten als Historie), vollständig revertiert als **`5530836`** (alle 8 Files; Gates nach Revert 113/113, lint/check/doctor grün). **Der `spectrumStore` aus Task 5.1 bleibt** — sein Konsument ist der VFD-Player-Analyzer. Falls Audio-Reaktivität je wieder gewünscht wird: `c77440e` enthält die komplette, getestete Implementierung (Bridge-Message, Driver-Boost, Shader-Uniform).

<details>
<summary>Historie der revertierten Implementierung (c77440e)</summary>

**Files (IST nach Execute — der Plan-Text stammte aus der three.js-Welt, auf die Phase-4-Architektur übersetzt):**
- Modify: `apps/frontend/src/components/background/BackgroundScene.tsx` (Store-Subscription + Forwarding)
- Modify: `nightSky/protocol.ts` (`SetAudioLevel {level, active}`), `nightSky/loop.ts` (Driver-Audio-State), `nightSky/scene.ts` (`u_audioLevel`-Uniform + Modulation), `nightSky/worker.ts` (Message-Case), `nightSky/settings.ts` (`AUDIO_BOOST_FPS`)

- [x] BackgroundScene abonniert `spectrumStore` (Subscription im Idle-Boot, Cleanup im Teardown); RMS beider Kanäle geht als `SetAudioLevel {level, active}` an Worker bzw. Fallback-Driver. **Drosselung = der Store-Takt selbst** (Producer-seitiges 50-ms-Gate, 20 Hz max; Stille kostet nichts — ohne Preview publiziert der Store nicht). Driver: EMA-Glättung (`AUDIO_LEVEL_SMOOTHING 0.25` ≈ 200 ms Zeitkonstante, zweite Stufe über dem VU-Smoothing — kein Stroboskop), Level als zweiter Parameter an `scene.draw(simTime, audioLevel)`.
- [x] Shader-Modulation subtil + additiv-only: Fill- UND Katalog-Sterne `× (1 + level·0.35)` (`AUDIO_STAR_GAIN`), Sky-Gradient `× (1 + level·0.05)` (`AUDIO_SKY_GAIN`); Wolken bewusst unmoduliert (pulsierende Bänke = unnatürlich). Konstanten in die Shader eingebacken, KEINE neuen Settings-Knobs (42/42-Vertrag unberührt).
- [x] **„On-demand → Loop"-Übersetzung:** `AUDIO_BOOST_FPS = 30` — solange der Store aktiv ist (Preview spielt/fade-out), hebt der Driver den Cap analog zum Fade-Boost (kontinuierliche Modulation bei 10 fps läse sich als 100-ms-Stufen); danach sofort zurück auf `fpsCap` 10 + ein Settle-Frame ohne Glow.
- [x] Reduced Motion: Bridge forwarded nicht + Driver silenced sich selbst (doppelt); `animate: 0` (User-Standbild) ignoriert Audio komplett, `setAnimate(false)` friert glow-frei ein.
- [x] Tests (118/118): 3 neue Driver-Verträge (Boost-Takt + Level-Durchreichung + Settle-0, animate-off ignoriert, reduced-motion silenced) + 2 Bridge-Verträge (Publish → RMS-Message ≈ 0.7071 + Clear → `{0, false}`; reduced-motion → keine Messages).
- [x] Browser-Verifikation gegen Prod-Build (:3002, `/U7RHL`, 2026-06-13): voller Preview-Durchlauf inkl. Ended-Pfad ohne Errors; **während Playback (Audio + 30-fps-Worker + VFD + 20 Hz Messages): 0 Long Tasks, Main-Thread volle 60-fps-Cadence (240 rAF/4 s)**. Visueller Modulations-Eindruck (Sterne atmen mit) = User-Sichttest in Safari (Screenshot-Diffs sind bei der bewusst subtilen Modulation + Twinkle-Rauschen nicht beweiskräftig; die Mathematik pinnen die Unit-Tests).
- [x] Commit: `Feat: audio-reactive background driven by shared spectrum store` (`c77440e`; Hook normal)

</details>

### Task 5.3: gsap.ticker als einzige Frame-Quelle

**Files:**
- Modify: `apps/frontend/src/components/ui/VfdDisplay.tsx` (Canvas-Draw-rAF)
- Modify: `apps/frontend/src/components/audio/AudioPreviewPlayer.tsx` (Spectrum-/Progress-/Rewind-rAF-Loops)
- ~~Modify: `BackgroundScene.tsx`~~ (entfällt — der Nachthimmel rendert im Worker mit eigenem rAF [Policy 6, korrekt so], der Main-Thread-Fallback läuft BEREITS auf `gsap.ticker`; Task 5.2 ist revertiert)

- [x] **5.3a — VfdDisplay-Draw-Loop → `gsap.ticker` + Farb-Cache (verifiziert 2026-06-13):** der private `window.requestAnimationFrame`-Loop läuft jetzt auf dem geteilten `gsap.ticker` (on-demand `add`, Self-`remove` sobald ein Frame keine aktive Animation meldet; Marquee/Line-Swap halten ihn registriert). **`resolveCanvasColors` aus dem Per-Frame-Pfad gecacht** (`colorsRef`, Auflösung nur bei Mount/`phosphorColor`) — das war der dokumentierte ~60-layouts/s-Marquee-Stream (alter Code hängte 4 Probe-Spans/Frame ins DOM). Neuer `VfdDisplay.test.tsx` (4 Verträge: ticker-getrieben statt rAF, Farben NICHT pro Frame, Self-deregister, Unmount-Cleanup). **Browser-Beweis (:3002, MutationObserver):** 0 Probe-Span-Mutationen über 4 s — sowohl im Idle (4 VFD-Canvases) als auch **während Playback mit 20-Hz-Spectrum-VFD** (alter Code: ~640 in 4 s).
- [x] **5.3b — Player-rAF-Loops → `gsap.ticker` (verifiziert 2026-06-13):** alle vier Loops (`startSpectrumLoop`, `startSpectrumFadeOut`, `startProgressLoop`, `startProgressRewind`) + die drei Stops von `requestAnimationFrame`/`cancelAnimationFrame` auf `gsap.ticker.add/remove`. `*FrameRef` (number) → `*TickRef` (Callback-Handle, dient als Lauf-Flag + Remove-Handle); `performance.now()` im Callback (Zeit-Basis der Gates/Rewind unverändert). **AudioContext-Gesture-Timing UNBERÜHRT** (nur Scheduling getauscht, nicht die Pipeline-Logik). `setupMotion()` im Mount-Effect. **Browser-Beweis:** Preview spielt, Progress läuft (0:29→0:19), Pause→Fade-Out→Rewind sauber, **0 Long Tasks, 60-fps-Cadence (240 rAF/4 s), 0 Console-Errors**. Code-Audit: keine parallelen kontinuierlichen Main-Thread-rAF-Loops mehr (verbliebene rAF = One-Shots: Resize-Coalescing, Scroll, Staging-Commits + Worker-rAF anderer Thread) → Policy 3 erfüllt.
- [x] **5.3c — `progressRatio` aus React-State lösen — BEWUSST WEGGELASSEN (User-Entscheidung 2026-06-13):** der Progress-Loop setzt `progressRatio` ~60/s via `useState` → `PlayerProgress`-Re-Render. Strikt nach **Policy 2** (Frame-Daten nie durch `useState`) gehörte das entkoppelt. **Dokumentierte Policy-2-Ausnahme:** der 5.3b-Trace zeigt während Playback 0 Long Tasks / 60 fps — der Re-Render ist seit Task 5.1 billig (memoisierte `lines`, kein Analyzer-Recompute, kein Layout-Stream). YAGNI: der Trace rechtfertigt die Entkopplung nicht, und der CSS-Var-Write würde Layout-Wissen (`progressWidthPx` = Quantisierung × `displayCells`) vom Konsumenten in den Producer verschieben. Spectrum (die eigentliche 50-ms-Churn-Quelle) ist seit 5.1 off-React; `progressRatio` ist der verbleibende, billige Rest und bleibt React-State.
- [x] Commit (5.3a): `Refactor: drive the VfdDisplay frame loop off gsap.ticker with cached colors` (`244243c`; Hook normal)
- [x] Commit (5.3b): `Refactor: consolidate the audio player frame loops onto gsap.ticker` (`90740e6`; Hook normal)

### Phase-5-Gate

- [x] **Gefahren 2026-06-13 gegen Prod-Build :3002 (MCP-Chrome):**
  - **Statische Gates:** test:run 117/117, astro check 0/0, lint 642 clean, doctor:diff 0 issues.
  - **Worst-Case-Trace (Audio + Spectrum-VFD + Page-Transition + Player-Teardown gleichzeitig):** Preview auf `/U7RHL` gestartet, dann mid-playback per Logo-Klick zur Landing navigiert (ClientRouter + GSAP-Page-Transition + Player-Unmount/Teardown). **CLS 0.00, keine Long-Task-/ForcedReflow-Insight im ganzen Trace.**
  - **Playback isoliert (4-s-Fenster):** 0 Long Tasks, 60-fps-Cadence (240 rAF/4 s), Progress läuft (0:29→0:19), Pause→Fade-Out→Rewind sauber, 0 Console-Errors.
  - **Teardown-Korrektheit:** nach dem Wegnavigieren mid-playback ist der Main-Thread ruhig — 0 Long Tasks über 4 s, 241 Frames (max. rAF-Gap 18 ms), **keine verwaisten `gsap.ticker`-Callbacks** (ein Geister-Loop nach Unmount hätte Aktivität oder null-Ref-Errors erzeugt; beides nicht). Nachthimmel-Canvas läuft unbeeinflusst weiter (opacity 1, Worker-Thread).
  - **Marquee-Layout-Stream (5.3a-Kern):** 0 Probe-Span-DOM-Mutationen über 4 s, Idle wie Playback (alter Per-Frame-`resolveCanvasColors`: ~640 in 4 s während Playback).
  - **Policy 3 erfüllt:** Code-Audit — keine parallelen kontinuierlichen Main-Thread-rAF-Loops mehr; `gsap.ticker` ist die einzige Frame-Quelle, verbliebene `requestAnimationFrame` sind One-Shots (Resize-Coalescing, Scroll, Staging-Commits) + der Nachthimmel-Worker-rAF (anderer Thread, Policy 6).
  - **Nebenbefund (pre-existing, geflaggt):** Hero-Input-a11y-Hinweis „form field should have an id or name" auf der Landing — nicht durch Phase 5 verursacht, kein Error.
  - Kein Code-Change im Gate (reine Verifikation).

---

## Abschluss

- [x] **Clean-State-Check (2026-06-13):** ALLE `node_modules` (Root + Apps + Packages) entfernt → `pnpm install` frisch (5.8 s) → `pnpm build` (shared + alle Workspaces erfolgreich) → `pnpm test:run` rekursiv: Backend 980 passed/27 skipped (vorbestehend), Frontend **117/117**. Kein Build-Step zwischen install und test nötig.
- [x] **Lighthouse final (2026-06-13, Prod :3002):** MCP-Lighthouse liefert weiterhin keine Performance-Kategorie (wie Phase 1 dokumentiert) — **A11y 100 / Best Practices 100 / SEO 100**; Performance trace-basiert:
  - **Landing:** LCP **118 ms** (IST-Stand 126 ms → besser), CLS **0.00**, keine Long-Task-Insight (TBT ≈ 0), RenderBlocking-Savings 0 ms.
  - **Share `/U7RHL`:** CLS 0.05–0.08 = die dokumentierte vorbestehende Artist-Card-Klasse (Task 1.4/2.6), TBT ≈ 0 (keine Long-Task-Insight über 3 Traces). **LCP 1035–1215 ms, aber beweisbar KEINE Frontend-Regression:** LCP-Element ist der Artist-Bio-Absatz, der direkt nach dem client-side `/api/artist-info`-Fetch rendert; der Endpoint braucht lokal konstant **610–930 ms** (Trace-Kette + 3× curl-Gegenprobe). Die Kette (ShareLayout `fetchArtistInfo` → Bio ersetzt Skeleton) ist seit Task 1.4 als vorbestehend dokumentiert und wurde von MC-029 an keiner Stelle berührt — mit identischer Backend-Latenz wäre der LCP auf dem Vor-Migrations-Stand gleich. (Der Phase-1-Wert „Share 149 ms" entstand mit damals schnellerer artist-info-Antwort; der Endpoint-Latenz-Anteil ist Backend-Scope.)
- [x] Plan nach `.claude/plans/done/` verschoben, `## Completed`-Sektion ergänzt (Plan ist gitignored — plain `mv`, kein `git mv`)

---

## Verified facts (2026-06-10 beim Plan-Schreiben, Branch `gsap`)

- `apps/frontend/astro.config.mjs` — `output: "server"`, `adapter: node({ mode: "standalone" })`, KEIN `prefetch` (Read ✓)
- `apps/frontend/package.json` — astro 5.17.3, react ^19.2.4, tailwindcss ^4.2.1, KEIN gsap/three/framer-motion (Read ✓)
- npm-Versionen: gsap 3.15.0, @gsap/react 2.1.2, three 0.184.0 (`npm info` ✓)
- `BaseLayout.astro` — kein `ClientRouter`/`ViewTransitions` (grep ✓); `GradientBackground`:61, `PageHeaderIsland client:idle`:62 (grep ✓)
- `apps/frontend/src/context/OverlayContext.tsx:138,143` — `window.location.href` Full-Load-Fallback (grep ✓); :67-99 History-Handling via `pushState` (grep ✓)
- `apps/frontend/src/components/share/SharePageShell.tsx:25` — `window.location.assign("/")` (grep ✓)
- `apps/frontend/src/components/ui/ErrorBoundary.tsx:97` — `window.location.reload()` (grep ✓)
- `apps/frontend/src/components/ui/SmoothSwap.tsx:61-81` — `height`-Messung + `transition: height …` + `heightResetTimer` (grep ✓)
- `apps/frontend/src/components/platform/AnimatedPlatformGrid.tsx` — `GRID_ANIMATION_MS = 620`:11, `height`-Transition:43-54, manuelles FLIP `translate3d`:74-78 (grep ✓)
- `apps/frontend/src/hooks/useFlipAnimation.ts:41-53` — manuelles FLIP, `transform 0.62s cubic-bezier(0.16, 1, 0.3, 1)`:47 (grep ✓)
- `apps/frontend/src/components/audio/AudioPreviewPlayer.tsx` — `SPECTRUM_UPDATE_MS = 50`:139, `useState` Spectrum:469, `setSpectrumBands`:616,693, rAF-Loop:667-710 (grep ✓)
- `apps/frontend/src/components/background/GradientBackground.astro` — `generateStarfield()`:17, `starfieldShadow`:33, `animate-[spin_300s_linear_infinite]`:38, `box-shadow`-Sterne:41, CSS-Gradients:43-47 (grep/Read ✓)
- `apps/frontend/src/styles/animations.css` — 11 `@keyframes` (Zeilen 4,16,26,33,42,63,72,216,228,240,252), reduced-motion-Block:263-272 (grep ✓)
- `apps/frontend/src/components/ui/VfdDisplay.tsx:173` — eigener rAF-Loop (grep ✓); einziger Konsument von `usePrefersReducedMotion` (grep ✓)
- `apps/frontend/src/pages/index.astro` — `LandingPage client:idle`:67, `PageOverlayIsland client:load`:73 (grep ✓)
- `apps/frontend/src/pages/[shortId].astro` — `PageOverlayIsland client:load`:164, `DeferredShareContent server:defer`:192, `DeferredFooter server:defer`:214 (grep ✓)
- `apps/frontend/src/lib/` — kein `motion/`-Verzeichnis vorhanden (ls ✓ → Create korrekt)
- Höchste vergebene Plan-Nr.: MC-028 (grep ✓ → dieser Plan ist MC-029)
- pnpm ist der Package-Manager (`packageManager: "pnpm@10.33.1"`, Root-package.json ✓); Install-Kommando: `pnpm --filter @musiccloud/frontend add …`
- GSAP-Lizenz: seit 3.13 inkl. aller Plugins (Flip, CustomEase, SplitText, …) kostenlos (Webflow-Übernahme) — Stand Knowledge-Cutoff 01/2026
- `OffscreenCanvas` mit WebGL im Worker: Chrome 69+, Firefox 105+, Safari 17+ (Wissens-Fakt, Stand 01/2026; Safari < 17 erhält den Main-Thread-Fallback aus Task 4.1)
- DOM-Schreibzugriffe sind prinzipbedingt Main-Thread-only (Web-Platform-Constraint) — deshalb ist GSAP-Tween-Mathematik + DOM-Write die einzige nicht verlagerbare Frame-Arbeit (Policy 6)

## Open questions

- **Audio-Player-Persistenz über Landing ↔ Share:** `transition:persist` matcht Islands über Namen; Player lebt aber in unterschiedlichen Island-Strukturen (LandingPage-Island vs. `DeferredShareContent` → `ShareLayout`). Unterbrechungsfreie Wiedergabe über diese Navigation ist Stretch-Goal, kein Phase-1-Scope — Design separat klären, falls gewünscht.
- **`server:defer` + ClientRouter:** Kompatibilität von Server Islands mit View-Transition-Navigation wird in Task 1.1 explizit verifiziert; falls Astro 5.17.3 hier Bugs zeigt, Befund dokumentieren und Lösung abstimmen.
- **Keyframe-Konsumenten-Liste (Task 2.5):** vollständige Konsumenten-Map wird beim Execute per grep erstellt (Klassennamen sind Tailwind-generiert, statische Liste würde beim Plan-Schreiben veralten).

## Checklist

- [x] All code references verified (functions, scripts, paths, env vars, package-manager commands) — Phase-1-Refs am Execute-Start re-gegrept, Zeilen-Drift (BaseLayout :64/:65, HeroInput :45) korrigiert
- [x] Phase 1 abgeschlossen (Gates grün; CLS → Task 2.6 verschoben, kein Phase-1-Regress)
- [x] Phase 2 abgeschlossen (Gates grün 2026-06-12; Befunde + Genre-Grid-Fix `4818bbf` im Phase-2-Gate-Block)
- [x] Phase 3 abgeschlossen (Task 3.1 `c73ee6d`; Phase-3-Gate grün 2026-06-12 — Out+In = NULL Long Tasks, Interrupt-Kill live verifiziert, Befunde im Gate-Block)
- [x] Phase 4 abgeschlossen (Task 4.1 `e1795df`, Task 4.2 `4323153`, Prototyp `7a85070`; Gate grün 2026-06-12 — Worker-Beweis, persist-Identity über 13 Navigationen, Heap stabil, LCP 111 ms; User-Sichttest in Safari ausstehend)
- [x] Phase 5 abgeschlossen (Task 5.1 `4e2465f`, 5.2 entfällt/revertiert `5530836`, 5.3a `244243c`, 5.3b `90740e6`; Phase-5-Gate grün 2026-06-13 — Worst-Case-Trace 0 Long Tasks, Teardown leak-frei, Policy 3 erfüllt)
- [x] Abschluss-Block erledigt (2026-06-13: Clean-State grün, Lighthouse/Traces final, Befunde im Abschluss-Block)

---

## Completed

**Abgeschlossen am 2026-06-13** (Branch `gsap`, HEAD `90740e6`). Alle 5 Phasen + Abschluss-Block, alle Gates grün.

**Was erreicht wurde:**
- **Phase 1** — Reload-freie Navigation: ClientRouter + Prefetch, `navigate()` statt Full-Loads, persistente Background-/Header-Islands (`5961308`, `682cbbd`, `1e345a7`).
- **Phase 2** — GSAP-Fundament: zentrales `lib/motion/`-Modul (Constants/Setup/Flip/Swap/Entrances/Collapse/CoverSwap), alle handgebauten FLIP-/Height-/Keyframe-Animationen migriert, compositor-only (`476c663`, `e3cbaca`, `c23584e`, `885c3e6`+`fac4c9d`, `57bec8a`, `f3c1042`; Gate-Fix `4818bbf`).
- **Phase 3** — GSAP-Page-Transitions auf dem ClientRouter-Lifecycle, Out parallel zum Load, Interrupt-sicher (`c73ee6d`).
- **Phase 4** — Fotorealistischer Nachthimmel statt box-shadow-Starfield: raw WebGL2 (KEIN three.js, ~150 KB gz gespart), 67 echte Nordhimmel-Sterne um Polaris, fbm-Wolken, OffscreenCanvas-Worker + gsap.ticker-Fallback, 10-fps-Cap, persist über Navigationen (`e1795df`, `4323153`; Prototyp `7a85070`). User-getunte Production-Settings in `settings.ts` gepinnt.
- **Phase 5** — Spectrum off-React in Zero-Alloc-Store (`4e2465f`); Audio-Reaktivität implementiert (`c77440e`) und auf User-Entscheidung vollständig revertiert (`5530836`); gsap.ticker als einzige Main-Thread-Frame-Quelle: VfdDisplay-Loop + Farb-Cache (behebt den ~60-layouts/s-Marquee-Stream, `244243c`), Player-Loops (`90740e6`). `progressRatio` bleibt als dokumentierte Policy-2-Ausnahme React-State.

**Finale Messwerte (Prod-Build, 2026-06-13):** Landing LCP 118 ms (vorher 126 ms) / CLS 0.00 / TBT ≈ 0; Share CLS 0.05–0.08 (vorbestehende Artist-Card-Klasse) / TBT ≈ 0 / LCP backend-dominiert (`/api/artist-info` 610–930 ms, von der Migration unberührt); A11y/BP/SEO je 100. Worst-Case (Audio+VFD+Navigation+Teardown): 0 Long Tasks, Teardown leak-frei. Clean-State: install→build→test ohne Zwischen-Build grün (Backend 980, Frontend 117).

**Bewusste Abweichungen/Ausnahmen (alle im Plan dokumentiert):** three.js entfällt (raw WebGL2 reicht); Audio-Reaktivität entfällt (User: Nachthimmel bleibt ruhige Kulisse); GenreBrowse-Tile-Entrance bleibt CSS (Performance-Ausnahme, 250-Targets-Reflow); Artist-Card-CLS ≈ 0 via Flip unerreichbar (bräuchte Space-Reservation, out-of-scope); `progressRatio` bleibt useState (Trace rechtfertigt Entkopplung nicht); VFD-Marquee-Layout-Stream behoben via Farb-Cache statt Marquee-Umbau.

**Offen außerhalb des Plans:** User-Sichttest in Safari; Post-Deploy-Umami-Pageview-Check (lokal nicht testbar); pre-existing Befunde geflaggt (Hero-Input id/name-a11y-Hinweis, apple-meta-Deprecation, Overlay-History-UX-Follow-up).
