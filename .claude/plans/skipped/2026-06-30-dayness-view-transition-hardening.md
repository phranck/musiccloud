# Day/Night-Härtung: diskreter Switch + View-Transitions-Crossfade

Plan-Nr.: MC-075

**Preface:** Der Day/Night-Wechsel rampt `--g-dayness` (vererbte `:root`-Variable, ~250 CSS-`color-mix`/`calc`-Deps) pro Frame über `dayTransition` Sekunden. Das erzwingt einen Whole-Document-Style-Recalc pro Frame, der mit der DOM-Größe skaliert — auf der Share-Page kippte Safari darüber. Die DOM-Reduktion (MC-074 + Folge-Refactors) war eine **Mitigation**, die den Multiplikator senkte; der **Mechanismus** ist unverändert und bleibt fragil (jedes DOM-Wachstum kann Safari erneut kippen). Dieser Plan behebt die **Ursache**: der CSS-Pfad wird diskret geschaltet und der sichtbare Übergang als GPU-Snapshot-Crossfade via `document.startViewTransition` gefahren — ein Recalc statt ~60, und die Node-Anzahl wird für die Day/Night-Glätte irrelevant. Siehe Memory `project_dayness_recalc_landmine`.

## Skip-Grund (2026-06-30)

Implementiert (G1–G6, Gates grün) und dann **revertet** — NICHT auf `main` umgesetzt. Grund: Der `document.startViewTransition`-Crossfade legt zwei Whole-Page-Snapshots übereinander; die EmbossedCards sind halbtransparentes `backdrop-filter: saturate(...)`-Glas (`glass.css` `--_sa` aus `--g-dayness`), und der Crossfade über-kompositet die Sättigung im Übergang kurz → sichtbares **Aufblitzen der Cards** beim Day/Night-Wechsel (User-Report). `backdrop-filter` + View Transitions ist ein bekanntes Flacker-Problemfeld; ein flash-freier Crossfade wäre nur fragil (gescopetes Custom-CSS, evtl. per-Card-`view-transition-name`) und nicht verlässlich ohne visuelle Iteration erreichbar.

**Wichtig:** Der eigentliche Safari-Share-Page-Jank war bereits durch die DOM-Reduktion (MC-074 Cover-Single-Mode + nur die passende Layout-Variante rendern + List/Grid-Entfernung) behoben (User bestätigt „wieder flüssig"). Diese Härtung war spekulativ (Robustheit gegen künftiges DOM-Wachstum) und wog die Regression nicht auf → YAGNI.

**Revisit-Bedingung:** Falls die Share-Page wieder so wächst, dass der Per-Frame-`--g-dayness`-Recalc Safari über Budget kippt (siehe Memory `project_dayness_recalc_landmine`). Dann ZUERST das backdrop-filter-Flacker-Problem lösen, BEVOR ein Crossfade gebaut wird. Die Code-Referenzen unten sind der Stand 2026-06-30 und altern.

## Ziel / Spec

- Beim Day↔Night-Wechsel wird `--g-dayness` in **einem** Schritt auf den Zielwert gesetzt (ein Recalc), und der Browser blendet den Whole-Page-Snapshot per GPU-Compositor über (kein Per-Frame-Recalc).
- Der Canvas-Nachthimmel (`settings.dayness`, GPU) rampt **unverändert** smooth weiter — nur der CSS-Pfad wird diskret.
- Robust gegen DOM-Wachstum: die Glätte hängt nicht mehr an der Node-Anzahl.
- Sauberer Fallback ohne View-Transition-Support und bei `prefers-reduced-motion` (diskreter Sprung ohne Crossfade — immer noch besser als der ruckelnde Ramp).

## Hintergrund / Root Cause (verifiziert)

- `publishGlassDayness(d)` setzt `--g-dayness` auf `document.documentElement` (`glassDayness.ts:43`).
- Der `NightSkyDriver` rampt `settings.dayness` pro Frame (`tickFade`, `loop.ts:208-218`, über `dayTransition`=**1 s** default `settings.ts:123`) und publiziert jeden Schritt: `tick` → `publishDayness()` (`loop.ts:91`, `:239-247`) → `onDayness` = `publishGlassDayness`.
- Zwei Render-Pfade, beide publizieren CSS pro Frame: **Worker** postet `NightSkyWorkerEvent.Dayness` zurück, konsumiert in `BackgroundScene.tsx:288` → `publishGlassDayness`; **Fallback** bekommt `publishGlassDayness` als `onDayness`-Callback in den Driver (`BackgroundScene.tsx:311`).
- `glass.css` liest `--g-dayness` in ~137 Ausdrücken (projektweit ~250). Das ist der Per-Frame-Recalc.

## Design-Entscheidung

**CSS-`--g-dayness`-Autorschaft vom Per-Frame-Driver entkoppeln und nach `BackgroundScene` verlagern; dort diskret schreiben, gewrappt in `document.startViewTransition`.** Der Driver/Worker rendert nur noch den Canvas (interne `settings.dayness` für den GL-Sky), publiziert aber **kein** CSS mehr.

**Warum so (nicht den Per-Frame-Publish „unterdrücken"):** Eine einzige CSS-Autoritätsquelle (`BackgroundScene`) ist sauberer als ein Driver, der ViewTransitions kennen und seine Per-Frame-Writes situativ gaten müsste. Entkopplung = „nichts Altes übrig", der Worker-`Dayness`-Postback entfällt komplett.

**Verworfene Alternative:** Per-Frame-Publish im Driver behalten und nur „während des Fast-Fade" unterdrücken plus einen einzelnen ViewTransition-Write am Fade-Start. Hackig (Driver-Kopplung an ViewTransitions, Gating-Logik), gegen KISS/„nichts Altes übrig".

## Verhalten / Trade-offs

- Während des Crossfades (Zieldauer ~400–600 ms) friert der Whole-Page-Snapshot Live-Animationen (Analyzer, Vinyl-Rotation) als Standbild ein. Bewusster, dokumentierter Trade-off; bei seltenem, gewolltem Toggle unauffällig. (Vorher ruckelte während des Ramps ohnehin alles.)
- `prefers-reduced-motion` ODER kein `document.startViewTransition` → diskreter Sprung ohne Crossfade.
- **Automatic-Mode** (kontinuierlicher Uhr-Drift): Da der Per-Frame-Postback wegfällt, treibt ein grober Timer (alle 60 s) den CSS-Tint diskret nach — imperceptibel (Tageszeit-Drift bewegt `dayness` um Bruchteile pro Minute). Der Canvas driftet unberührt smooth.
- Day/Night/System sind ohnehin diskrete Ziele (1 / 0 / `prefersDark?0:1`).

## Implementation (Gruppen, je ein logischer Commit)

### G1 — Driver entkoppeln (`nightSky/loop.ts` + `loop.test.ts`)
- `NightSkyDriver`: `onDayness` (`:59`), `lastPublishedDayness` (`:61`), `DAYNESS_EPSILON` (`:63`), Constructor-Param (`:74/:77`) und `publishDayness()` (`:239-247`) entfernen; den `this.publishDayness()`-Call in `tick` (`:91`) streichen. Der Driver rendert nur noch (interne `settings.dayness`).
- `loop.test.ts`: die publish/onDayness-Coverage entfernen/anpassen (kein `onDayness`-Sink mehr).

### G2 — Worker-`Dayness`-Protokoll entfernen (`nightSky/protocol.ts`, `nightSky/worker.ts`, `BackgroundScene.tsx`)
- `protocol.ts`: `NightSkyWorkerEvent.Dayness` (`:40`), `NightSkyDaynessMessage` (`:108-109`) und den Union-Eintrag in `NightSkyWorkerEventMessage` (`:114-117`) entfernen.
- `worker.ts`: den Dayness-Postback entfernen (Worker rendert nur; `setReducedMotion` etc. bleiben).
- `BackgroundScene.tsx`: den `else if (data.type === Dayness) publishGlassDayness(...)`-Zweig (`:288`) entfernen; Fallback-Driver ohne `publishGlassDayness` konstruieren (`:311`).

### G3 — Diskreter CSS-Commit + ViewTransition-Gate (`BackgroundScene.tsx`)
- Helper `commitDayness(target: number, opts: { animated: boolean })`:
  - `opts.animated && !reducedMotion && typeof document.startViewTransition === "function"` → `document.startViewTransition(() => publishGlassDayness(target))`.
  - sonst → `publishGlassDayness(target)`.
- Verdrahten: `applyMode` (fixe Modes — der Toggle), `handleSchemeChange` (System-OS-Flip), `handleApiEvent` (API mit `animated`) rufen NACH dem `setDayness` am Driver (Canvas-Ramp bleibt) zusätzlich `commitDayness(target, { animated: true })`. Boot: `commitDayness(initialDayness, { animated: false })`.
- `reducedMotion` wird in `BackgroundScene` bereits geführt (`reducedMotionQuery`); `commitDayness` liest denselben Wert.

### G4 — Automatic-Drift + Initial-Commit (`BackgroundScene.tsx`)
- Bei Automatic: groben Timer (60 s) starten, der `daynessForMode(Automatic, { prefersDark, date: new Date() })` recomputed und `commitDayness(target, { animated: false })` ruft. Timer bei Mode-Wechsel weg von Automatic stoppen; im Cleanup clearen.
- Initial-Boot: einmal `commitDayness(initialDayness, { animated: false })` nach dem Boot, damit der erste Paint korrekt ist (ersetzt den weggefallenen ersten Per-Frame-Publish).

### G5 — CSS-Feinschliff (`styles/animations.css`)
- `::view-transition-group(root)` (bzw. `-old/-new(root)`): `animation-duration` auf die Crossfade-Zieldauer (~500 ms) setzen; Default-UA-Crossfade ist Opacity (GPU).
- `@media (prefers-reduced-motion: reduce) { ::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) { animation: none !important; } }` als CSS-seitiger Gürtel-und-Hosenträger (JS-Gate in G3 ist die primäre Absicherung).

### G6 — Tests (`BackgroundScene.test.tsx`, ggf. `loop.test.ts`, Worker/Protocol-Tests)
- `BackgroundScene.test.tsx`: `document.startViewTransition` mocken; assert: ein Mode-Toggle ruft `commitDayness` → genau **ein** `--g-dayness`-Set (nicht ~60); ohne `startViewTransition`-Support greift der diskrete Fallback-Set; reduced-motion → diskret.
- `loop.test.ts`: onDayness/publishDayness-Coverage raus.
- Worker/Protocol-Tests: `Dayness`-Message-Referenzen entfernen, falls vorhanden.

## Checkliste

- [x] G1 Driver entkoppelt (onDayness/publishDayness/Epsilon raus, `tick` ohne publish; loop.test nutzte den Sink nie → unverändert grün)
- [x] G2 Worker-`Dayness`-Protokoll entfernt (protocol/worker/BackgroundScene-Consumer + Fallback-Konstruktor)
- [x] G3 `commitDayness` + startViewTransition-Gate; applyMode/scheme/api/boot verdrahtet
- [x] G4 Automatic + Boot: diskreter `commitDayness` bei Eintritt/Boot — Coarse-Timer VERWORFEN (siehe Execute-Notizen)
- [x] G5 kein `::view-transition`-CSS nötig — UA-Default-Crossfade, reduced-motion im JS-Gate, Astro-Nav-Konflikt vermieden (siehe Execute-Notizen)
- [x] G6 Tests (startViewTransition-Mock: Crossfade-Pfad + API-unavailable-Fallback; BackgroundScene 45 Tests grün)
- [ ] Cross-Browser verifiziert (USER): Safari (Crossfade glatt, Share-Page offen), Chrome, Firefox/kein Support (diskreter Sprung), reduced-motion
- [x] Canvas-Nachthimmel-Ramp unberührt (Code/Tests grün); visuelle Bestätigung Teil des Cross-Browser-Checks
- [x] Alle Code-Referenzen verifiziert (Funktionen, Pfade, Zeilen, Protokoll-Typen)
- [x] Gates grün: Frontend `astro check` 0, Biome (870), React-Doctor 0, Vitest 314 frontend
- [ ] Commit (logischer Split, nur auf ausdrückliche User-Ansage)

## Verified facts

- `~/.local/bin/plans next` → `MC-075` (2026-06-30).
- `publishGlassDayness` setzt `--g-dayness` auf `document.documentElement` — `glassDayness.ts:43-47`.
- Per-Frame-Ramp + Publish: `NightSkyDriver.tickFade` `loop.ts:208-218` (über `settings.dayTransition`), `tick` ruft `publishDayness()` `loop.ts:91`, `publishDayness` `loop.ts:239-247`. Zu entfernende Kopplung: `onDayness` `:59`, `lastPublishedDayness` `:61`, `DAYNESS_EPSILON` `:63`, Constructor `:74/:77`.
- `dayTransition` default `1` (`settings.ts:123`), Range `0.2–10` (`settings.ts:183`).
- Worker-Pfad CSS-Publish: `BackgroundScene.tsx:288` (`NightSkyWorkerEvent.Dayness` → `publishGlassDayness`). Fallback: `new NightSkyDriver(scene, settings, publishGlassDayness)` `BackgroundScene.tsx:311`.
- Worker-Protokoll: `NightSkyWorkerEvent.Dayness` `protocol.ts:40`, `NightSkyDaynessMessage` `:108-109`, Union `:114-117`.
- Mode-Trigger: UI-Toggle `DayNightSwitcher.tsx` → `setDayNightMode` → Store → `subscribeDayNightMode(applyMode)` `BackgroundScene.tsx:340`; `applyMode` `:224-241`, `handleSchemeChange` `:244-252`, `handleApiEvent` `:254-279`, Boot `initialModeSettings` `:147-154`.
- Store-API: `getDayNightMode`/`setDayNightMode`/`subscribeDayNightMode`/`DayNightMode` (`dayNightMode.ts:41/48/54/15`).
- `daynessForMode(mode, ctx)` → Day=1, Night=0, System=`prefersDark?0:1`, Automatic=`daynessForLocalTime(date)` (`dayNightPolicy.ts:33-44`).
- Kein `::view-transition`-CSS vorhanden; Astro-Nav-Animation via `transition:animate="none"` auf `<body>` deaktiviert + GSAP-getrieben (`pageTransitions.ts`) → kein Konflikt mit dem manuell getriggerten Day/Night-`startViewTransition`.
- View-Transitions same-document: Chrome 111+, Safari 18+, Firefox noch nicht universell → Feature-Detect + diskreter Fallback (G3) Pflicht.

## Execute-Notizen (2026-06-30)

- **Worker-Postback (offener Punkt → erledigt):** lag in `worker.ts` als `daynessMessage`-Closure (`type: NightSkyWorkerEvent.Dayness`) + Driver-Konstruktor-Arg; entfernt, Driver wird `new NightSkyDriver(scene, settings)` konstruiert. `loop.test.ts` referenzierte den Sink nie (konstruierte den Driver schon ohne 3. Arg) → keine Test-Anpassung nötig.
- **G4 Coarse-Timer VERWORFEN:** Ein `setInterval`-CSS-Follower für Automatic ließ den Test-Boot-Helper (`vi.runAllTimers()`) endlos laufen („Aborting after 10000 timers") und war für einen sub-perzeptiblen Tint-Drift Over-Engineering (YAGNI). Stattdessen: `commitDayness(autoClockDayness(), { animated: true })` einmal bei Automatic-Eintritt + diskreter Boot-Commit. Verhalten: unter Automatic spiegelt der Glass-Tint den Uhr-Wert bei Eintritt/Load; der Canvas-Himmel driftet live weiter (Niche-Mode, akzeptabel).
- **G5 CSS VERWORFEN:** Kein eigenes `::view-transition`-CSS — der UA-Default-Root-Crossfade (~0,25 s, GPU-Opacity) reicht und vermeidet jeden Konflikt mit Astros Page-Nav-View-Transitions (ein globales `::view-transition(root)`-Regelwerk hätte die GSAP-getriebene Nav, deren Default via `transition:animate="none"` deaktiviert ist, re-aktiviert). Reduced-motion ist im JS-Gate (`commitDayness`) abgesichert.
- **Canvas/Sky-Charakteristik (für den Cross-Browser-Check):** View Transitions snapshotten die GANZE Seite inkl. Canvas; der Live-Ramp des Himmels kann während des ~Crossfades nicht durchscheinen. Das Glas (dominanter Effekt) crossfadet sauber; der Himmel ramt darunter/danach live (max. ein kleiner Versatz beim Snapshot-Handback). Falls der Himmel-Übergang stört, wäre ein synchronisierter Ganzseiten-Crossfade nötig (Canvas-Snap + Worker-Render-Ack) — bewusst NICHT gebaut (Komplexität; Himmel ist subtil).
- **Gate-Lücke gefunden:** `pnpm -r --if-present typecheck` überspringt das Frontend (dessen Typecheck-Script heißt `check` = `astro check`, nicht `typecheck`). Frontend-Typecheck explizit via `pnpm --filter @musiccloud/frontend run check`. In Memory `feedback_pre_push_gates` festgehalten.
