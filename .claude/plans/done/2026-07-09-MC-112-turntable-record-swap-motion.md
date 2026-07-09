# Plattenspieler: Bogen-Swap Motion-Baustein + Doppelpuffer

Plan-Nr.: MC-112

> **Für agentische Worker:** Umsetzung Task-für-Task via superpowers:subagent-driven-development oder superpowers:executing-plans. Schritte nutzen Checkbox-Syntax (`- [ ]`).

**Ziel:** Die visuelle Mechanik des Plattenwechsels bauen und testbar machen: eine Web-Animations-API-Factory (Heben, Bogen-Slide raus/rein, Absetzen) plus einen Platten-Doppelpuffer, der zwei `VinylRecord` entlang des bestätigten Kreisbogens bewegt. Noch ohne Anbindung an den echten Resolve-Flow (das ist MC-113).

**Architektur:** Die Bewegung läuft über die **Web Animations API** (`element.animate`), genau die Mechanik, die der Platten-Rotor in `VinylRecord.tsx` schon nutzt: transform-only, off-main-thread im Compositor, GPU-stabil über den `translateZ`-Trick (erzwingt `matrix3d`). Das ist bewusst **kein GSAP**: der Swap feuert während des main-thread-schweren Hub-Remounts, wo eine off-main-thread-Animation robuster ist als ein Main-Thread-Ticker; und GSAP war nur für die FLIP-Counter-Scale-Swaps nötig, die es hier nicht gibt. Der Bogen wird über Prozent-`translate`-Keyframes entlang des Kreises gefahren (Prozent skaliert mit dem responsiven Deck). Ein `RecordSwapStage`-Doppelpuffer mit Generation-Keying (Muster wie `SongInfo`) hält outgoing + incoming. Deck-Rahmen und Spindel bleiben statisch, nur die Platte(n) bewegen sich; das Rausgleiten wird an der Deck-Kante geclippt (`overflow-hidden`).

**Tech-Stack:** Web Animations API (`element.animate`), TypeScript, vitest + Testing Library, Biome, pnpm. Kein GSAP, kein `@gsap/react`.

**Voraussetzungen / Reihenfolge:** Keine harte Abhängigkeit zu MC-111. Blockiert MC-113 (die Orchestrierung verdrahtet die hier gebaute Factory und Stage).

---

## Preface

Reiner Visual-/Motion-Teil. Am Ende existiert die Animation als getestete Factory plus eine Stage-Komponente, die sich über einen kontrollierten Trigger vorführen lässt. Die Verdrahtung in `resolveTrack` samt Daten-Gate, Coast-Kopplung, Auto-Play und Härtung gegen überlappende Interaktionen ist MC-113.

## Warum Web Animations API statt GSAP

- GSAP-Transform-Tweens sind zwar GPU-kompositiert (`force3D`), aktualisieren den Wert aber **pro Frame im Main-Thread** (Ticker). Die Web Animations API und CSS interpolieren **off-main-thread** im Compositor.
- Der Plattenwechsel läuft zeitgleich mit dem Hub-Remount (`MediaCardHead`), also einem main-thread-schweren Moment. Off-main-thread ist dort merklich robuster gegen Jank.
- Prozent-`translate`-Keyframes skalieren mit dem fluid dimensionierten Deck; CSS `offset-path` fällt aus, weil dessen `path()`-Koordinaten absolute px sind und nicht mitskalieren.
- Die WAAPI ist bereits die Mechanik des Rotors im selben Component, das hält das Vinyl-Modul konsistent.

## Verifizierte Fakten

- `components/vinyl/VinylRecord.tsx:406-442` `startRotorAnimation` nutzt `element.animate([{ transform }, { transform }], options)` mit ms-Dauer, `easing`-String und `iterations`/`fill`. Muster für WAAPI-Transform-Animationen im Projekt.
- `components/vinyl/VinylRecord.tsx:199-211` `rotateZ(deg)` hängt `translateZ(0.01px)` an, damit der Transform als echtes `matrix3d` auf einen stabilen GPU-Layer geht (Safari/Firefox promoten `matrix` sonst nicht zuverlässig). Denselben Trick für die Slide-/Lift-Transforms nutzen.
- `components/vinyl/VinylRecord.tsx:367-393` `preserveRotorRotationAndCancel`: `commitStyles()` **vor** `cancel()` (sonst springt Firefox für einen Frame auf den Basis-Transform); zusätzlich `element.getAnimations()?.` blanket-cancel, weil fertige `fill: "forwards"`-Animationen im Effect-Stack hängenbleiben. Dieselbe Interrupt-Hygiene für den Record-Swap übernehmen.
- `components/vinyl/VinylRecord.tsx:480-489` `useEffect(..., [spinState])` startet/übergibt die Animation und canceled im Cleanup. Muster für den Stage-Effekt (statt `useGSAP`).
- `components/vinyl/VinylRecord.tsx:32-59` lokale ms-Timing-Konstanten (`LP_ROTATION_DURATION_MS = 1800`, `LP_COAST_TIMING`). Etabliertes Muster: WAAPI-Timing als benannte lokale ms-Konstanten, nicht in der GSAP-`MotionDuration` (die ist in Sekunden).
- `lib/motion/setup.ts:129-135` `prefersReducedMotion()` (SSR-safe, `false` ohne `window`). Direkt nutzbar, unabhängig von GSAP.
- `lib/motion/setup.ts:13` `MC_OUT_BEZIER = "0.16, 1, 0.3, 1"` (die app-weite Ease hinter `MotionEase.McOut`). Für die WAAPI dieselbe Kurve als `easing: "cubic-bezier(0.16, 1, 0.3, 1)"` verwenden, mit Kommentar-Verweis, damit der Feel konsistent bleibt.
- `components/cards/SongInfo.tsx:78-144` Doppelpuffer-Muster: State `{ current, previous, generation }`, zwei Puffer mit `key={...generation}`, Effekt keyed auf `generation`, `onSettle` unmountet den outgoing Puffer via Generation-Guard, Interrupt vor Neubau; reduced-motion → sofort `settle`. Struktur übernehmen, nur mit WAAPI statt GSAP.
- `components/vinyl/VinylRecord.tsx:444-453` `VinylRecordProps`: `className`, `labelArtworkUrl?`, `labelTitle?`, `labelSubtitle?`, `labelYear?`, `labelCatalogText?`, `labelRightsText?`, `spinState?`. Figure ist `overflow-visible`, `transform-gpu`.
- `components/vinyl/VinylRecord.types.ts` `VinylSpinState { Idle, Playing, Coasting }`, `LP_COAST_DURATION_MS`.
- `components/turntable/TurntablePlayerParts.tsx:394-405` `TurntablePlayerSurface` = `<figure ... overflow-hidden>` (Clip-Grenze). `:132-164` `TurntablePlayerPlatter` rendert `VinylRecord` in einem z-20-`<span>` bei 86% Breite, zentriert (`left-1/2 top-1/2 -translate-*`); Spindel z-50 liegt darüber.
- jsdom implementiert `element.animate` nur teilweise: `getAnimations` ist mit `?.()` zu guarden (siehe `VinylRecord.tsx:389`); Tests dürfen sich nicht auf echte Frame-Interpolation verlassen, sondern auf die aufgerufene API (`animate`-Aufruf, `cancel`, `onfinish`/`finished`) und die geschriebenen Start-/End-Transforms.

## Geometrie (bestätigt, deck-normalisiert 0..1)

- Deck-Quadrat 0..1, Spindel/Zentrum `(0.5, 0.5)`.
- Kanten-Durchgänge: oben ⅓ `(0.333, 0)`, rechts ⅔ `(1, 0.667)`.
- Kreis durch `(0.333,0)`, `(0.5,0.5)`, `(1,0.667)`: **Mittelpunkt `(0.9167, 0.0833)`, Radius `0.5892`** (deck-normalisiert).
- Die Plattenmitte fährt auf diesem Kreis. Der Bogen wird als Folge von Prozent-`translate`-Keyframes gesampelt (z. B. 8-12 Stützpunkte); die WAAPI interpoliert linear zwischen eng gesetzten Punkten, das approximiert den Kreis glatt. Prozent bezieht sich auf die Scheibengröße, skaliert also responsive.
- "Komplett rein/raus": Startpunkt des incoming so weit oberhalb des ⅓-Durchgangs, dass die ganze Scheibe oberhalb der Deck-Oberkante liegt; Endpunkt des outgoing so weit hinter dem ⅔-Durchgang, dass die ganze Scheibe rechts der Deck-Kante liegt. Der Clip (`overflow-hidden`) verdeckt die Reste. Exakte Start-/Endpunkte als benannte Konstanten in `recordSwap.ts`, im Test gegen die Scheibengröße (86% Deck) abgesichert.

## Tasks

### Task 1: WAAPI-Timing- und Easing-Konstanten für den Record-Swap

**Files:**
- Create: `apps/frontend/src/lib/motion/recordSwap.ts` (Konstanten-Kopf)

- [x] `recordSwap.ts` definiert lokale ms-/Skalar-Konstanten (`RECORD_SWAP_DURATION_MS`, `LIFT_SCALE`) plus den Easing-`cubic-bezier`-String `MC_OUT_EASING` (= `MC_OUT_BEZIER`-Kurve), Muster wie `VinylRecord.tsx:32-59`. Kein Eintrag in der Sekunden-`MotionDuration`. Heben/Absetzen sind über die Scale-Rampe innerhalb der Gesamtdauer kodiert (statt separater ms-Phasen), feinjustierbar. TSDoc vorhanden.
- [x] Biome clean. (Commit gemeinsam mit Task 2.)

### Task 2: `buildRecordSwapTimeline` Factory (Web Animations API, reduced-motion)

**Files:**
- Modify: `apps/frontend/src/lib/motion/recordSwap.ts`
- Test: `apps/frontend/src/lib/motion/recordSwap.test.ts`

- [x] Failing Test (`recordSwap.test.ts`): reduced-motion → `null` ohne `animate`; sonst zwei `animate`-Aufrufe + Handle mit `cancel()`; `onSettle` genau einmal bei natürlicher `onfinish`, nicht bei `cancel()`.
- [x] Test rot.
- [x] Factory implementiert mit `element.animate`: `prefersReducedMotion()`/kein `animate` → `null`. Outgoing Bogen Zentrum→Austritt mit Scale 1→1.05 (Heben), incoming Bogen Eintritt→Zentrum mit Scale 1.05→1 (Absetzen). Bogen als 12 gesampelte Prozent-`translate`-Keyframes (Geometrie oben), jeder Transform mit `translateZ(0.01px)`. Easing `cubic-bezier(0.16, 1, 0.3, 1)`, `fill: "forwards"`. `cancel()` macht `commitStyles()` vor `cancel()`; `onfinish` des incoming ruft `onSettle` mit `cancelled`-Guard.
- [x] Test grün (4/4, inkl. reduced-motion und "cancel settlet nicht"). Biome. Commit.

### Task 3: `RecordSwapStage` Doppelpuffer-Komponente

**Files:**
- Create: `apps/frontend/src/components/turntable/RecordSwapStage.tsx`
- Test: `apps/frontend/src/components/turntable/RecordSwapStage.test.tsx`

- [x] Failing Test (`RecordSwapStage.test.tsx`, `buildRecordSwapTimeline` gemockt): initial 1 `VinylRecord`; `swapKey`-Wechsel → 2 `VinylRecord` + Factory-Aufruf; `onSettle` unmountet den outgoing; überlappender Wechsel canceled den Vorgänger und startet neu; Factory-`null` (reduced motion) → sofort 1 Record.
- [x] Test rot.
- [x] Implementiert analog `SongInfo`-Doppelpuffer, mit WAAPI: State `{ previous, generation }` (das `current`-Record wird direkt aus der Prop gerendert, nicht in State kopiert); `swapKey`-getriggerter Swap in einem Effekt mit `cancelled`-Guard + Cleanup (spiegelt SongInfo, damit react-doctors `no-derived-state` nicht feuert); Animations-Effekt keyed auf `[generation, previous]` baut `buildRecordSwapTimeline`, canceled den Vorgänger vorher und im Cleanup, `onSettle` unmountet outgoing via Generation-Guard. Beide Puffer `absolute inset-0 transform-gpu` über der Plattenposition; outgoing `Coasting`, incoming `Idle` bis settle. `RecordLabel`-Typ exportiert. TSDoc vorhanden.
- [x] Test grün (4/4). **Full-Scan** `pnpm doctor` 0 issues (nicht nur `doctor:diff`, der untracked Neu-Dateien überspringt und `no-derived-state` zunächst übersah). Biome. Commit.

## Offene Punkte

- Genaue Ein-/Austrittspunkte und Hebe-/Absetz-Amplitude werden in Task 2/3 gegen die Scheibengröße (86% Deck) feinjustiert; Startwerte aus der Geometrie oben.
- Ob die Stage als Ersatz des `VinylRecord` in `TurntablePlayerPlatter` oder als Layer oberhalb des Hubs sitzt, entscheidet MC-113 (dort liegt die Remount-Grenze). MC-112 baut die Stage so, dass sie an beiden Stellen einsetzbar ist (rein prop-getrieben, kein Hub-Zugriff).

## Checkliste

- [x] Task 1: WAAPI-Timing-/Easing-Konstanten
- [x] Task 2: `buildRecordSwapTimeline` (Web Animations API) + Tests (inkl. reduced-motion, cancel-settlet-nicht)
- [x] Task 3: `RecordSwapStage` Doppelpuffer + Tests (inkl. Interrupt)
- [x] Alle Code-Referenzen verifiziert (Funktionen, Skripte, Pfade, Env-Vars, Package-Manager-Kommandos)
- [x] Gates grün: astro check (Typecheck) 0 errors, Biome, `doctor:diff` 0 issues, `test:run` 338/338

## Completed

Umgesetzt 2026-07-09. `buildRecordSwapTimeline` (`lib/motion/recordSwap.ts`, Web Animations API, Kreisbogen-Keyframes, reduced-motion/interrupt) plus `RecordSwapStage` (`components/turntable/RecordSwapStage.tsx`, Doppelpuffer mit Generation-Guard und Interrupt). Rein prop-getrieben (kein Hub-Zugriff), einsetzbar an der von MC-113 gewählten Stelle. Gates grün, doctor-sauber. Feinabstimmung von Ein-/Austrittswinkeln und Hebe-/Absetz-Amplitude erfolgt beim UI-Smoke in MC-113. Lektion: `doctor:diff` überspringt noch-untracked Neu-Dateien; für neue Dateien vor dem Commit den Full-Scan `pnpm doctor` fahren. Der `no-derived-state`-Flag am Doppelpuffer wurde per SongInfo-Muster gelöst (Swap-Effekt mit Cleanup/`cancelled`-Guard, `current` aus der Prop abgeleitet statt in State kopiert), ohne Inline-Disable.
