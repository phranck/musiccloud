# TurntablePlayer-Hub-Inversion (Compound + Knob)

Plan-Nr.: MC-071

> **Für agentische Worker:** ERFORDERLICHE SUB-SKILL: `superpowers:subagent-driven-development` (empfohlen) bzw. `superpowers:executing-plans`. Schritte nutzen Checkbox-Syntax (`- [ ]`). Jeder TS-Code-Block ist Biome-konform (2-Space-Indent, doppelte Anführungszeichen, `organizeImports`); vor jedem Commit `biome check --write` laufen lassen. Jeder neue Export bekommt TSDoc.

**Goal:** Die in `architecture/player-architecture.html` (Abschnitt 04 „Das Hub-Modell" + 05 „Compound") spezifizierte Inversion umsetzen. Der `TurntablePlayer` wird zum **Hub**: er hält die Audio-Engine (`useAudioController`) und den Play-/Speed-/Power-Zustand und stellt beides als React-Context bereit. Der **Knob** wird die interaktive Hauptsteuerung (STANDBY → 33 → 45), der **Playbutton** wird zur Fernbedienung (sendet `play`/`pause` an den Hub), die **Displays** (`VfdInfoDisplay`, `VfdAnalyzerDisplay`) und der **Platter** (`VinylRecord`) docken als Peripherie an. **Es bleibt EIN gemeinsamer Player für kommerzielle Tracks und CC** (siehe [[project_player_c_cc_divergence]] — bewusster Entscheid, kein versehentliches Auseinanderbauen).

**Architecture:** Heute lebt der Player-Zustand verteilt: die Audio-Engine im `AudioPlayer` (eigener `useReducer`), der visuelle Spin-Zustand im `shareUiReducer` von `ShareLayout` (abgeleitet aus `previewStatus` + `vinylSpinState`, über fünf Ebenen top-down gereicht). Die Inversion zentralisiert beides in einem `TurntablePlayer`-Provider auf **MediaCardHead-Ebene** (der code-verifizierte gemeinsame Vorfahr von Player + SongInfo + ShareButton, einmal pro Anzeige, sowohl Landing als auch Share). Der Hub hält die Engine, leitet `power` (ON bei 33/45, STANDBY sonst) und `spinState` ab und exponiert `togglePlay`/`setSpeed`/`seek*`. Knob, Playbutton, LED, Displays und Platter konsumieren denselben Context.

**Tech Stack:** React 19 (`createContext`/`use`, `useReducer`, `useEffectEvent`), TypeScript, Astro-SSR-Islands, Canvas-2D-VFD-Engine, gsap.ticker (Spektrum 20 Hz), Web Animations API (Vinyl-Rotor), vitest, Biome, React-Doctor (+ Custom-Plugin `domain-literals`).

**Prerequisites:** Baut auf **MC-069** (Rename `AudioPlayer`/`AudioStatus`/`useAudioController`/`audioRegistry`/`AudioKeyboardHandle`/`ShareResult` — im Code bereits umgesetzt) und **MC-070** (`VfdInfoDisplay` + `VfdAnalyzerDisplay` als eigenständige Sonderformen — im Code bereits umgesetzt) auf. Beide Plan-Files liegen noch in `.claude/plans/open/` (warten auf User-Abnahme), der Code trägt aber bereits die Zielnamen. **Vor Execute-Start re-greppen** (siehe „Verified Facts"), dass `AudioPlayer.tsx`, `AudioStatus.ts`, `VfdInfoDisplay.tsx`, `VfdAnalyzerDisplay.tsx` existieren.

---

## Kontext (Preface)

### IST-Zustand (code-verifiziert)

- **Engine** (`apps/frontend/src/components/audio/AudioPlayer.tsx`, 1341 Z): `useAudioController(props)` hält den Player-`useReducer` (Phasen `Loading`/`Idle`/`Playing`/`Paused`/`Error`/`Unavailable`), das `<audio>`-Element (`audioRef`), den WebAudio-Spektrum-Graphen, `togglePlay`, `seekBy`/`seekToStart`/`seekToNearEnd` (MC-067), die `AudioKeyboardHandle`-Registry (`audioRegistry`, Spacebar + Pfeiltasten), MediaSession. `useAudioController` gibt ein View-Model zurück (`isPlaying`, `isDisabled`, `timeText`, `progressRatio`, `ariaLabel`, `togglePlay`, …). Die Komponente `AudioPlayer` rendert das `Player`-Compound (`@/components/playback/Player`).
- **Status-Callbacks** nach oben: `onStatusChange(AudioStatus)`, `onPlaybackIntent()`, `onSeekHint(direction)`. `AudioStatus` ist `{ Loading, Ready, Playing, Paused, Ended, Unavailable }` (`AudioStatus.ts`).
- **State-Owner heute** ist `ShareLayout` (`apps/frontend/src/components/share/ShareLayout.tsx`): `shareUiReducer` hält `previewStatus: AudioStatus | null` und `vinylSpinState: VinylSpinState`. `nextVinylSpinStateFromPreviewStatus` leitet den Spin ab (Playing → `Playing`, null/Unavailable → `Idle`, sonst → `Coasting`). `PlaybackIntentStarted` setzt sofort `Playing` (vor `audio.play()`-Resolve). `vinylSpinState`/`previewStatus` werden top-down gereicht: `ShareLayout` → `DesktopShareLayout`/`MobileShareLayout` → `MediaSummaryCard`/`SharePageCard`→`MediaCard` → `MediaCardHead` → `SongInfo` → `Turntable` → `VinylRecord`.
- **Gemeinsamer Vorfahr** ist `MediaCardHead` (`apps/frontend/src/components/cards/MediaCardHead.tsx`): rendert `SongInfo` (Cover/Turntable + VFD-Info), den `AudioPlayer` (per `key` remountet) und den `ShareButton`. Beide Card-Wrapper (`MediaCard` Landing/Mobile, `MediaSummaryCard` Desktop-Share) sind dünne Pässe darauf.
- **Visual-Stage** (`SongInfo.tsx`): rendert je `shareMediaView` (`cover`/`turntable`) entweder die Cover-Buffer oder `<Turntable record={{ …, spinState: vinylSpinState }} />`. **Wichtig:** Außerhalb von ShareLayout (`shareMediaView === undefined`) wird **keine** Turntable-Stage gerendert (`showTurntableStage = shareMediaView !== undefined`). Die Landing-Suche ohne Share rendert nur das Cover.
- **Turntable** (`apps/frontend/src/components/vinyl/Turntable.tsx`): Deck-Chrome (Brand, Platter, Speed-Labels „33/45/ON/STANDBY", **dekorativer** Speed-Knob `data-turntable-speed-knob` mit statischem `rotate(-150deg)`-Indikator, dekorative LED `data-turntable-led`, Spindel) plus `<VinylRecord {...record} />`. **Der Knob ist heute reine Optik, ohne Interaktion.**
- **VinylRecord** (`apps/frontend/src/components/vinyl/VinylRecord.tsx`): Rotor via Web Animations API. Konstante **`LP_ROTATION_DURATION_MS = 1800`** (eine Umdrehung playing), `LP_COAST_DURATION_MS = 2000`, `LP_COAST_DEGREES = 200`. Spin-Zustand kommt per `spinState` (`VinylSpinState`: `Idle`/`Playing`/`Coasting`). **Eine** Rotationsdauer (kein Speed-Konzept).
- **VinylSpinState** (`VinylRecord.types.ts`): `{ Idle, Playing, Coasting }`.
- **Displays** (MC-070): `VfdInfoDisplay` (Props `title`/`artist`/`detailLine`/`metaLine`/`statusLine`/`seekHint`) in `SongInfo`; `VfdAnalyzerDisplay` (Props `isPlaying`/`isDisabled`/`timeText`/`progressRatio`/`phosphorColor`/`ariaLabel`/`className`) in `PlayerProgress` (`PlayerParts.tsx`). `VfdAnalyzerDisplay` nimmt die Werte bewusst als **Props** (entkoppelt vom Context, „re-hosted under a different player context" — Doc-Kommentar), damit es an den Hub andockbar ist.
- **Compound `Player`** (`@/components/playback/Player.ts` = `Object.assign(PlayerRoot, { Button, Progress, Time })`, Parts in `PlayerParts.tsx`): eigener `PlayerContext` (View-Model `isPlaying`/`isDisabled`/`timeText`/`progressRatio`/`onTogglePlay`/…). `PlayerButton` ist der Play/Pause-Button, `PlayerProgress` rendert im Default-Fall `VfdAnalyzerDisplay`.

### Nicht anfassen (Hub-fremde VinylRecord-Nutzungen)

`VinylRecord` rendert auch **außerhalb** des Player-Hub-Pfads, mit fixem `spinState={VinylSpinState.Playing}`:
- `apps/frontend/src/components/landing/HeroSubmitSlot.tsx:81,138`
- `apps/frontend/src/components/ui/SlideArtwork.tsx:117`

Diese sind reine Deko-Spinner ohne Audio. Sie bekommen **keinen** Hub-Context, **keinen** `speed`-Input mit Pflichtcharakter — `VinylRecord`s neuer `speed`-Prop ist **optional** mit Default `33`, damit diese Aufrufer unverändert bleiben.

### Kernprinzip der Inversion

Heute „besitzt" `ShareLayout` den Spin-Zustand und der Player meldet nur nach oben. Nach der Inversion **besitzt der `TurntablePlayer`-Hub** Engine + Play/Speed/Power und leitet den Spin selbst ab. `ShareLayout` bleibt zuständig für die **VFD-Status-Zeile** (`vfdStatusLine` aus Artist-Fetch-Zustand + Resolve-Fehler + Playback) und den **Media-View-Toggle** (`cover`/`turntable`), denn diese Signale leben in anderen Subtrees (Artist-Spalte) und sind nicht Player-intern. Der Hub und `ShareLayout` **koexistieren** (siehe Einheit 4): Der Hub meldet seinen Play-Status weiterhin per `onStatusChange` nach oben, damit `ShareLayout` die Status-Zeile bauen kann; aber die **Spin-Ableitung** wandert in den Hub.

---

## Zielarchitektur

### Hub-Context (neu)

`apps/frontend/src/components/turntable/TurntablePlayerContext.ts` (reine Context-Definition + Hook, **keine** Komponente in derselben Datei, siehe [[feedback_separate_logic_from_components]]):

```ts
TurntableSpeed = { Standby: "standby", Rpm33: "rpm33", Rpm45: "rpm45" } as const   // PascalCase.PascalCase (domain-literals)
TurntablePower = { On: "on", Standby: "standby" } as const

interface TurntablePlayerContextValue {
  // Play-Engine (aus useAudioController)
  isPlaying: boolean;
  isDisabled: boolean;
  isLoading: boolean;
  isUnavailable: boolean;
  timeText: string;
  progressRatio: number;
  ariaLabel: string;
  title?: string;
  mediaLabel: string;
  trackTitle: string;
  // Hub-Steuerung
  speed: TurntableSpeed;          // standby | rpm33 | rpm45
  power: TurntablePower;          // abgeleitet: on bei rpm33/rpm45, sonst standby
  spinState: VinylSpinState;      // abgeleitet aus play-phase (+ coast)
  // Transport
  togglePlay: () => void;
  setSpeed: (speed: TurntableSpeed) => void;
  cycleSpeed: () => void;         // STANDBY → 33 → 45 → (zurück, s. offene Frage)
  seekBy: (deltaSeconds: number) => void;
  seekToStart: () => void;
  seekToNearEnd: () => void;
}
```

Hook `useTurntablePlayer()` wirft, wenn außerhalb des Providers genutzt (Pattern aus `PlayerParts.usePlayerContext`).

### Provider (neu)

`apps/frontend/src/components/turntable/TurntablePlayerProvider.tsx` — die Komponente, die `useAudioController(audioProps)` aufruft, den `speed`-State (`useReducer` oder `useState`) hält, `power`/`spinState` ableitet und den Context bereitstellt. Nimmt die heutigen `AudioPlayer`-Props (`previewUrl`/`refreshShortId`/`mediaKind`/`trackTitle`/`onPlaybackIntent`/`onStatusChange`/`onSeekHint`) plus die Spin-Coast-Steuerung. **Engine wird gehalten, nicht weggeworfen.**

**Speed↔Play-Synchronisierung (gespiegelt):**
- Play-Start (Knob auf 33/45, Klick auf Playbutton, Leertaste, Media-Key) → `togglePlay()` der Engine + Speed auf den Zielwert (Default-Speed s. offene Frage).
- Pause/Stop (Knob auf STANDBY, erneuter Playbutton-Klick/Leertaste) → `togglePlay()` (pausiert) + Speed `standby`.
- Engine meldet `Playing`/`Paused`/`Ended`/`Unavailable` → Provider hält `speed`/`power` konsistent (z.B. `Ended`/`Unavailable` → `standby`).
- `spinState` wird wie heute abgeleitet, aber im Hub: `Playing` während Wiedergabe, `Coasting` beim Pausieren/Enden (mit dem 2s-Timer, der heute in `ShareLayout` sitzt — wandert in den Provider), `Idle` sonst.

### Compound (neu)

`apps/frontend/src/components/turntable/TurntablePlayer.tsx` + Parts, exponiert als Namespace (Pattern `Object.assign`, wie `Player.ts`):

```
TurntablePlayer            (Root: rendert Provider + Default-Layout oder children)
  .LED                     (Power-Status; konsumiert power)
  .Platter                 (enthält VinylRecord; konsumiert speed + spinState)
  .Control                 (Steuerungs-Cluster; Layout-Container)
  .Control.Knob            (interaktiver Drehschalter STANDBY→33→45; konsumiert speed, ruft cycleSpeed/setSpeed)
  .Control.KnobLabels      (statische Labels 33 / 45 / ON / STANDBY)
VinylRecord                (bleibt eigenständig, liegt im Platter)
```

`VinylRecord` bleibt eigenständig (kein Context-Konsum) und bekommt `speed`/`spinState` als Props vom `.Platter` durchgereicht.

### Knob interaktiv (neu)

Der heute dekorative Speed-Knob (`Turntable.tsx`, `data-turntable-speed-knob`) wird ein echtes Bedienelement (`<button>` oder `role="slider"` — s. offene Frage A11y). Klick rotiert durch STANDBY → 33 → 45 (Default-Interaktion; Drag s. offene Frage). Der Indikator-Strich (`data-turntable-speed-indicator`) rotiert je `speed` auf die zur jeweiligen Beschriftung passende Winkelposition (STANDBY/33/45). LED leuchtet bei `power === on`.

### Speed → reales Dreh-Tempo

`VinylRecord` bekommt einen **optionalen** `speed`-Prop (Default `TurntableSpeed.Rpm33`). Zwei Rotationsdauern statt einer:
- `LP_ROTATION_DURATION_33_MS = 1800` (= heutige `LP_ROTATION_DURATION_MS`, umbenannt).
- `LP_ROTATION_DURATION_45_MS = 1800 * 33.333 / 45 ≈ 1333` (45 RPM dreht ~1,35× schneller; exakter Wert in der Implementierung als gerundete Konstante festschreiben und kommentieren).
- Bei `Playing` wählt `startRotorAnimation` die Dauer nach `speed`. Coast bleibt unverändert. **Das ist visuelles Tempo — `audio.playbackRate` wird NICHT verändert** (kein Tonhöhen-Shift).

### Displays als Peripherie

- `VfdInfoDisplay` bleibt prop-getrieben in `SongInfo` (es lebt im Cover/Turntable-Block, nicht im Player-Compound). **Keine** Context-Anbindung nötig — die Status-Zeile kommt weiter von `ShareLayout`. So bleibt es auch außerhalb von ShareLayout (Landing ohne Share) funktionsfähig, wo es **keinen** Hub-Provider gibt.
- `VfdAnalyzerDisplay` ist heute schon prop-getrieben in `PlayerProgress`. Es wird Teil der Fernbedienung (Playbutton + Analyzer-Zeile) und bekommt die Werte aus dem Hub-Context **über eine dünne Konsumenten-Wrapper-Komponente** (statt aus dem alten `PlayerContext`). Begründung Props statt direktem Context-Hook: testbar in Isolation (Doc-Kommentar in `VfdAnalyzerDisplay.tsx` sagt das ausdrücklich), und der Wrapper liest den Hub einmal und reicht Props durch.

### C / CC / Landing / Share

Die Inversion gilt für **alle** Kontexte, weil alle durch denselben `MediaCardHead` laufen:
- **Share (Landing-Treffer + /[shortId], C + CC):** `MediaCardHead` ist unter `ShareLayout`. Hub-Provider wrappt Player + SongInfo. `shareUiReducer` behält Media-View-Toggle + VFD-Status-Zeile; Spin-Ableitung zieht in den Hub. `previewStatus` fließt weiter per `onStatusChange` nach oben für die Status-Zeile.
- **Landing-Suche ohne Share:** Hier rendert `SongInfo` nur das Cover (kein `shareMediaView`), also keine sichtbare Turntable, aber der Player läuft. Der Hub-Provider wrappt trotzdem — Knob/Platter sind dann nicht sichtbar, Playbutton + Analyzer funktionieren wie heute. **Kein Sonderpfad.**

---

## File Structure

**Neu:**
- `apps/frontend/src/components/turntable/TurntablePlayerContext.ts` — Context + `useTurntablePlayer`-Hook + `TurntableSpeed`/`TurntablePower`-Namespaces + Value-Interface.
- `apps/frontend/src/components/turntable/turntableState.ts` — reine Helfer (kein React): `derivePower(speed)`, `deriveSpinState(...)`, `nextSpeedInCycle(speed)`, `speedKnobAngle(speed)`, `rotationDurationForSpeed(speed)`, plus Konstanten. Domain-Literal-konform.
- `apps/frontend/src/components/turntable/turntableState.test.ts` — Unit-Tests der reinen Helfer (TDD).
- `apps/frontend/src/components/turntable/TurntablePlayerProvider.tsx` — hält `useAudioController` + Speed-State, leitet Power/Spin ab, stellt Context bereit.
- `apps/frontend/src/components/turntable/TurntablePlayerProvider.test.tsx` — Provider-Verhalten (Play-Start setzt Speed, STANDBY pausiert, Coast-Timer).
- `apps/frontend/src/components/turntable/TurntablePlayer.tsx` — Compound-Root + Parts (`LED`, `Platter`, `Control`, `Control.Knob`, `Control.KnobLabels`).
- `apps/frontend/src/components/turntable/TurntablePlayer.test.tsx` — Compound-Render + Knob-Interaktion (Klick rotiert Speed, LED-Power, gespiegeltes Play/Pause).
- `apps/frontend/src/components/turntable/TurntableKnob.tsx` — der interaktive Knob (eigene Datei wegen A11y/Event-Logik; konsumiert Hub).
- `apps/frontend/src/components/turntable/TurntableAnalyzerSlot.tsx` — dünner Hub-Konsument, reicht Hub-Werte als Props an `VfdAnalyzerDisplay` (Fernbedienungs-Analyzer).

**Geändert:**
- `apps/frontend/src/components/vinyl/VinylRecord.tsx` — neuer optionaler `speed`-Prop (Default `Rpm33`); `LP_ROTATION_DURATION_MS` → `LP_ROTATION_DURATION_33_MS` + neue `LP_ROTATION_DURATION_45_MS`; `startRotorAnimation` wählt Dauer nach `speed`.
- `apps/frontend/src/components/vinyl/VinylRecord.types.ts` — ggf. Re-Export von `TurntableSpeed` für den Prop-Typ (oder Import aus turntable/).
- `apps/frontend/src/components/vinyl/Turntable.tsx` — der dekorative Knob wird durch `TurntableKnob` ersetzt (oder Turntable wird zur reinen Optik-Hülle und `.Platter`/`.Control` übernehmen Knob/Platter — finale Aufteilung in Einheit 2/3 entscheiden, mit Blick auf die abgenommene Optik). Indikator-Winkel + LED an `speed`/`power` koppeln.
- `apps/frontend/src/components/cards/MediaCardHead.tsx` — wrappt `SongInfo` + Player in `TurntablePlayerProvider`; der heutige `AudioPlayer` wird durch die Fernbedienungs-Komposition (Hub-konsumierender Playbutton + Analyzer) ersetzt; `onSeekHint`/`onPlaybackIntent`/`onStatusChange` laufen über den Provider.
- `apps/frontend/src/components/cards/SongInfo.tsx` — die Turntable-Stage rendert `TurntablePlayer.Platter` (oder konsumiert `speed`/`spinState` aus dem Hub statt aus dem `vinylSpinState`-Prop). Übergangs-Koexistenz s. Einheit 4.
- `apps/frontend/src/components/share/ShareLayout.tsx` — `shareUiReducer` gibt die Spin-Ableitung (`vinylSpinState`, `nextVinylSpinStateFromPreviewStatus`, `PlaybackIntentStarted` → Playing, `VinylCoastFinished`-Timer) an den Hub ab; behält Media-View + VFD-Status-Zeile + `previewStatus` (für die Status-Zeile). Die `vinylSpinState`-Prop-Kette nach unten wird gekappt.
- `apps/frontend/src/components/playback/PlayerParts.tsx` — `PlayerProgress`/`PlayerButton` ggf. auf Hub umstellen oder als Fernbedienungs-Bausteine wiederverwenden (finale Entscheidung in Einheit 3, ohne den `children`-Custom-Progress-Pfad zu brechen).
- Prop-Ketten-Bereinigung in `DesktopShareLayout.tsx`, `MobileShareLayout.tsx`, `SharePageCard.tsx`, `MediaCard.tsx`, `MediaSummaryCard.tsx` (Entfernen von `vinylSpinState`, sobald der Hub den Spin hält — nur soweit gefahrlos; `previewStatus` bleibt für die Status-Zeile).

**Bewusst NICHT geändert:** `HeroSubmitSlot.tsx`, `SlideArtwork.tsx` (Hub-fremde Deko-Spinner — `VinylRecord`-`speed` ist optional mit Default).

---

## Einheiten (Reihenfolge + Testbarkeit)

Wegen Größe und Risiko in vier separat testbare Einheiten geschnitten. Jede Einheit endet mit grünen Gates und einem Commit. Reihenfolge ist bindend (jede baut auf der vorigen):

1. **Einheit 1 — Reine Hub-Logik + Context-Gerüst (keine Optik-Änderung).** Context, Namespaces, reine Helfer (`derivePower`, `deriveSpinState`, `nextSpeedInCycle`, `speedKnobAngle`, `rotationDurationForSpeed`) inkl. Unit-Tests. `VinylRecord` bekommt den optionalen `speed`-Prop + zweite Rotationsdauer (rückwärtskompatibel, Default = heutiges Verhalten). **Nichts im Render-Baum umgehängt.** Voll testbar isoliert.
2. **Einheit 2 — Provider + Engine-Einbettung (Verhalten konstant).** `TurntablePlayerProvider` kapselt `useAudioController` + Speed-State, leitet Power/Spin ab, hält den Coast-Timer. `MediaCardHead` wrappt damit, der Playbutton + Analyzer konsumieren den Hub statt der direkten `AudioPlayer`-Props. **Optik unverändert** (Knob noch dekorativ, Speed folgt nur dem Play-Status). Spin-Ableitung von `ShareLayout` in den Hub gezogen; `ShareLayout` behält Status-Zeile. Verifikation: Play/Pause/Seek/Spin identisch zu heute.
3. **Einheit 3 — Compound-Teile sichtbar (`LED`/`Platter`/`Control`/`KnobLabels`).** Die Turntable-Stage wird als `TurntablePlayer.Platter` + `.Control` aufgebaut, `VinylRecord` liegt im Platter und bekommt `speed`/`spinState` aus dem Hub. LED zeigt `power`. **Knob noch nicht interaktiv** (zeigt nur den Zustand). Optik gegen die abgenommene `Turntable.tsx` per Screenshot abgleichen (1:1 erhalten).
4. **Einheit 4 — Knob interaktiv + Speed 33/45 reales Tempo + Synchronisierung.** `TurntableKnob` wird klickbar (STANDBY → 33 → 45, gespiegelt mit Play/Pause). Speed 33/45 ändert die reale Rotationsdauer. Leertaste/Media-Key/Playbutton und Knob steuern denselben Zustand. Voll regressionsgetestet + Cross-Browser.

> **Hinweis für den ausführenden Worker:** Die endgültige Detail-Aufteilung der Tasks innerhalb jeder Einheit (insb. wie `Turntable.tsx` zwischen `.Platter`/`.Control` aufgeteilt wird und ob `PlayerParts` wiederverwendet oder ersetzt wird) wird **nach** dem Lesen der abgenommenen `architecture/player-architecture.html` und der dann aktuellen Code-Stände festgelegt. Dieser Plan legt Architektur, Reihenfolge, Verträge und Gates fest; die Optik bleibt verbindlich an der Architektur-Seite (siehe [[feedback_mockups_are_binding]]).

---

## Tasks

### Einheit 1 — Reine Hub-Logik + Context-Gerüst

**Files:**
- Create: `apps/frontend/src/components/turntable/TurntablePlayerContext.ts`
- Create: `apps/frontend/src/components/turntable/turntableState.ts`
- Create: `apps/frontend/src/components/turntable/turntableState.test.ts`
- Modify: `apps/frontend/src/components/vinyl/VinylRecord.tsx`
- Modify: `apps/frontend/src/components/vinyl/VinylRecord.types.ts`

- [ ] **Step 1.1 — `TurntableSpeed`/`TurntablePower`-Namespaces + Context-Definition.** In `TurntablePlayerContext.ts`: die zwei `as const`-Namespaces (`TurntableSpeed = { Standby, Rpm33, Rpm45 }`, `TurntablePower = { On, Standby }`) in **PascalCase.PascalCase** (Doctor-Regel `domain-literals/prefer-pascal-case-literal-namespaces`), das `TurntablePlayerContextValue`-Interface (s. Zielarchitektur), `const TurntablePlayerContext = createContext<TurntablePlayerContextValue | null>(null)` und `useTurntablePlayer()` (wirft außerhalb Provider, Pattern aus `PlayerParts.usePlayerContext`). TSDoc auf Interface, jeden Namespace, den Hook. **Keine** React-Komponente in dieser Datei (Logik/Component-Trennung, [[feedback_separate_logic_from_components]]).
- [ ] **Step 1.2 — Reine Helfer in `turntableState.ts`.** Funktionen (alle pur, modul-scope, TSDoc):
  - `derivePower(speed: TurntableSpeed): TurntablePower` — `On` bei `Rpm33`/`Rpm45`, sonst `Standby`.
  - `nextSpeedInCycle(speed: TurntableSpeed): TurntableSpeed` — `Standby → Rpm33 → Rpm45 → Standby` (Default-Zyklus; finale Richtung s. offene Frage).
  - `speedKnobAngle(speed: TurntableSpeed): number` — Grad-Winkel für den Indikator je Speed (aus der Label-Geometrie in `Turntable.tsx` ableiten: STANDBY unten-links, 33/45 oben). Konstanten benannt.
  - `rotationDurationForSpeed(speed: TurntableSpeed): number` — `LP_ROTATION_DURATION_45_MS` bei `Rpm45`, sonst `LP_ROTATION_DURATION_33_MS`.
  - `deriveSpinState(params)` — kapselt die heutige `nextVinylSpinStateFromPreviewStatus`-Logik (Playing → `Playing`, gestoppt aus Playing/Coasting → `Coasting`, sonst `Idle`), entkoppelt von `AudioStatus`-Namespace-Import wo möglich. Konstanten `LP_ROTATION_DURATION_33_MS = 1800`, `LP_ROTATION_DURATION_45_MS = 1333` (kommentiert: `≈ 1800 × 33⅓ / 45`).
- [ ] **Step 1.3 — TDD `turntableState.test.ts`.** Tests vor/parallel zur Implementierung: `derivePower` für alle drei Speeds; `nextSpeedInCycle` durchläuft Standby→33→45→Standby; `rotationDurationForSpeed` gibt 1333 für 45, 1800 sonst; `deriveSpinState` für Playing/Pause/Ended/Idle. Reine Funktions-Tests (kein Render).
- [ ] **Step 1.4 — `VinylRecord` Speed-Prop (rückwärtskompatibel).** In `VinylRecord.types.ts` den `VinylRecordProps`-Typ um `speed?: TurntableSpeed` erweitern (Import aus `turntable/TurntablePlayerContext`). In `VinylRecord.tsx`: `LP_ROTATION_DURATION_MS` → `LP_ROTATION_DURATION_33_MS` umbenennen, `LP_ROTATION_DURATION_45_MS` ergänzen, `LP_PLAYING_TIMING` aus einer `playingTimingForSpeed(speed)`-Hilfe ableiten (Dauer je Speed), `startRotorAnimation` und der `useEffect` nehmen `speed` (Default `TurntableSpeed.Rpm33`) entgegen. **Default = heutiges Verhalten** (1800 ms), damit `HeroSubmitSlot`/`SlideArtwork`/aktuelle Aufrufer unverändert laufen.
- [ ] **Step 1.5 — Bestehende Tests grün halten.** `VinylRecord.test.tsx` und `Turntable.test.tsx` müssen ohne Änderung passen (Default-Speed). Bei Bedarf einen Test ergänzen: `VinylRecord` mit `speed={Rpm45}` setzt eine kürzere Rotationsdauer (über die WAA-Timing-Auswahl oder einen exponierten Helfer prüfbar).
- [ ] **Step 1.6 — Gates.** `biome check --write apps/frontend/src/components/turntable apps/frontend/src/components/vinyl`, dann aus Repo-Root: `pnpm --filter @musiccloud/frontend exec tsc --noEmit` (bzw. `pnpm --filter @musiccloud/frontend check`), `pnpm run doctor:diff`, `pnpm --filter @musiccloud/frontend test:run`.
- [ ] **Step 1.7 — Commit.** `Refactor: add TurntablePlayer hub context + VinylRecord speed prop (MC-071)`

### Einheit 2 — Provider + Engine-Einbettung (Verhalten konstant)

**Files:**
- Create: `apps/frontend/src/components/turntable/TurntablePlayerProvider.tsx`
- Create: `apps/frontend/src/components/turntable/TurntablePlayerProvider.test.tsx`
- Create: `apps/frontend/src/components/turntable/TurntableAnalyzerSlot.tsx`
- Modify: `apps/frontend/src/components/cards/MediaCardHead.tsx`
- Modify: `apps/frontend/src/components/share/ShareLayout.tsx`

- [ ] **Step 2.1 — `TurntablePlayerProvider`.** Komponente, die die heutigen `AudioPlayer`-Props entgegennimmt (`previewUrl`/`refreshShortId`/`mediaKind`/`trackTitle`/`onPlaybackIntent`/`onStatusChange`/`onSeekHint`), `useAudioController(props)` aufruft (**Engine bleibt, wird nur hierher gehoben**), den `speed`-State hält (`useReducer` mit Actions `PlayToggled`/`SpeedSet`/`SpeedCycled`/`EngineStatus`), `power = derivePower(speed)` und `spinState = deriveSpinState(...)` ableitet, den Coast-Timer hält (2s, der heute in `ShareLayout` sitzt) und den Context-Value zusammensetzt. **Synchronisierung:** `togglePlay` ruft `engine.togglePlay()` und setzt Speed konsistent (Start → Default-Speed; Pause/Ended/Unavailable → `Standby`). `setSpeed`/`cycleSpeed` (Knob) starten/pausieren die Engine passend (33/45 → play, Standby → pause). TSDoc.
- [ ] **Step 2.2 — Status-Brücke nach `ShareLayout`.** Der Provider reicht `onStatusChange(status)` weiter (für die VFD-Status-Zeile in `ShareLayout`). Die `onPlaybackIntent`-Semantik (sofortiger Spin vor `play()`-Resolve) wird im Hub über den `spinState` realisiert; nach außen meldet der Provider Intent weiterhin (für Analytics in `ShareLayout`, das heute `PlaybackIntentStarted` dispatcht — diese Action verliert ihre Spin-Wirkung, behält aber ggf. andere). **Prüfen**, ob `ShareLayout.PlaybackIntentStarted` nach dem Hub-Umbau noch etwas tut; falls nur Spin → entfernen.
- [ ] **Step 2.3 — `TurntableAnalyzerSlot`.** Dünne Komponente: `const hub = useTurntablePlayer()` und rendert die **Fernbedienung** = Playbutton (Hub-konsumierend) + `<VfdAnalyzerDisplay isPlaying={hub.isPlaying} isDisabled={hub.isDisabled} timeText={hub.timeText} progressRatio={hub.progressRatio} ariaLabel=… />`. Der Playbutton ruft `hub.togglePlay`. Wiederverwendung von `PlayerButton`/`Player`-Optik soweit möglich (gleicher Look), aber Daten aus dem Hub. (Finale Entscheidung Wiederverwendung vs. neuer Button in diesem Step.)
- [ ] **Step 2.4 — `MediaCardHead` umstellen.** `SongInfo` + Player-Bereich in `<TurntablePlayerProvider …>` wrappen. Den heutigen `<AudioPlayer key={…} … />` durch `<TurntableAnalyzerSlot />` ersetzen (Provider hält die Engine, Slot rendert Fernbedienung). Der `key`-Remount (content-identity) wandert auf den **Provider** (Engine-Reset bei Track-Wechsel). `onSeekHint`/`handleSeekHint`/`seekHint`-Verdrahtung an SongInfo bleibt — aber `onSeekHint` kommt jetzt aus dem Provider/Hub. TSDoc/Kommentare mitziehen ([[feedback_keep_code_docs_current]]).
- [ ] **Step 2.5 — `ShareLayout` Spin-Ableitung abgeben.** Aus `shareUiReducer` entfernen: `vinylSpinState`, `nextVinylSpinStateFromPreviewStatus`, `PlaybackIntentStarted`→Playing-Wirkung, `VinylCoastFinished`-Timer-Effekt, die `vinylSpinState`-Props an Desktop/Mobile-Layout. **Behalten:** `previewStatus` (für `vfdStatusLine`), `shareMediaView`-Toggle, `handlePreviewStatusChange`. `handlePlaybackIntent` nur behalten, wenn es außer Spin noch etwas tut (s. Step 2.2). Die nachgelagerten Layouts (`DesktopShareLayout`/`MobileShareLayout`/`SharePageCard`/`MediaCard`/`MediaSummaryCard`) verlieren die `vinylSpinState`-Prop.
- [ ] **Step 2.6 — `TurntablePlayerProvider.test.tsx` (TDD).** Play-Start setzt `speed` auf den Default-Play-Speed + `power=On`; `setSpeed(Standby)` pausiert die Engine + `power=Standby`; Engine-`Ended` setzt `speed=Standby`; `spinState` folgt (Playing während Wiedergabe). Engine über `HTMLMediaElement.prototype.play/pause`-Mocks wie in `AudioPlayer.test.tsx`.
- [ ] **Step 2.7 — Verifikation Verhalten konstant.** Manuell/Test: Play/Pause/Seek (Pfeiltasten + cmd), Spin-Verhalten (Playing/Coasting/Idle), VFD-Status-Zeile, Media-View-Toggle (`p`-Taste) identisch zu vor dem Umbau. `ShareLayout.test.tsx` + `LandingPage.test.tsx` grün.
- [ ] **Step 2.8 — Gates** (wie Step 1.6, plus `pnpm run doctor:diff` auf 0 Issues).
- [ ] **Step 2.9 — Commit.** `Refactor: move audio engine + spin derivation into TurntablePlayer hub (MC-071)`

### Einheit 3 — Compound-Teile sichtbar (LED / Platter / Control / KnobLabels)

**Files:**
- Create: `apps/frontend/src/components/turntable/TurntablePlayer.tsx`
- Create: `apps/frontend/src/components/turntable/TurntablePlayer.test.tsx`
- Modify: `apps/frontend/src/components/vinyl/Turntable.tsx`
- Modify: `apps/frontend/src/components/cards/SongInfo.tsx`

- [ ] **Step 3.1 — Compound-Root + Parts.** `TurntablePlayer.tsx`: `TurntablePlayerRoot` plus `LED`, `Platter`, `Control`, `KnobLabels`, exponiert als Namespace (`Object.assign(Root, { LED, Platter, Control })`, `Control` selbst `Object.assign(ControlRoot, { Knob, KnobLabels })`). `LED` konsumiert `power` (an/aus-Optik aus `Turntable.tsx`-`LED_STYLE`/`LED_GLOW_STYLE` portiert). `Platter` konsumiert `speed`/`spinState` und rendert `<VinylRecord speed={…} spinState={…} {...recordProps} />`. `KnobLabels` = statische 33/45/ON/STANDBY-Beschriftung. TSDoc auf jeden Part.
- [ ] **Step 3.2 — `Turntable.tsx` neu aufteilen.** Die Deck-Chrome (Brand, Platter-Schatten, Spindel, Speed-Labels, LED) zwischen `TurntablePlayer.Platter`/`.Control`/`.LED`/`.KnobLabels` aufteilen, **ohne die Optik zu ändern** (Styles 1:1 portieren). Der Knob bleibt in diesem Step **dekorativ** (zeigt `speedKnobAngle(speed)`), Interaktion folgt in Einheit 4. `data-turntable-*`-Attribute beibehalten (Tests + Selektoren hängen dran).
- [ ] **Step 3.3 — `SongInfo` Turntable-Stage auf Compound.** Den `<Turntable record={{ …, spinState: vinylSpinState }} />`-Block durch den Hub-konsumierenden `<TurntablePlayer.Platter />` (+ `.Control`/`.LED`) ersetzen bzw. `speed`/`spinState` aus dem Hub ziehen statt aus dem `vinylSpinState`-Prop. **Wichtig:** `showTurntableStage` bleibt an `shareMediaView !== undefined` gekoppelt (Landing-ohne-Share zeigt weiter nur Cover). Der `vinylSpinState`-Prop an `SongInfo` entfällt.
- [ ] **Step 3.4 — Optik-Abgleich.** Screenshot der Turntable-Stage (Share-Seite, `turntable`-View) gegen den Stand vor Einheit 3 und gegen `architecture/player-architecture.html` (Deck-Motiv). Pixel-/Layout-identisch ([[feedback_mockups_are_binding]], [[feedback_verify_real_state_before_building]]). Visuelle Prüfung macht der User; hier nur ein gezielter Vorher/Nachher-Screenshot zur Vorlage.
- [ ] **Step 3.5 — `TurntablePlayer.test.tsx`.** Compound rendert LED/Platter/Control/KnobLabels; LED-Zustand folgt `power`; Platter reicht `speed`/`spinState` an `VinylRecord` (per `data-spin-state` + Rotationsdauer prüfbar); Labels 33/45/ON/STANDBY vorhanden (analog `Turntable.test.tsx`).
- [ ] **Step 3.6 — Gates** (wie Step 1.6).
- [ ] **Step 3.7 — Commit.** `Refactor: build TurntablePlayer compound (LED/Platter/Control) (MC-071)`

### Einheit 4 — Knob interaktiv + Speed-Tempo + Synchronisierung

**Files:**
- Create: `apps/frontend/src/components/turntable/TurntableKnob.tsx`
- Modify: `apps/frontend/src/components/turntable/TurntablePlayer.tsx`
- Modify: `apps/frontend/src/components/turntable/TurntablePlayer.test.tsx`

- [ ] **Step 4.1 — `TurntableKnob` interaktiv.** Der Knob wird ein echtes Bedienelement: `const hub = useTurntablePlayer()`, Klick ruft `hub.cycleSpeed()` (STANDBY → 33 → 45 → … s. offene Frage A). Der Indikator-Strich rotiert auf `speedKnobAngle(hub.speed)`. A11y: `<button>` mit `aria-label` (z.B. „Turntable speed: 33 RPM") + `aria-pressed`/`title`, oder `role="slider"` mit `aria-valuetext` (finale A11y-Form s. offene Frage A). Keyboard-Aktivierung (Enter/Space auf dem fokussierten Knob) berücksichtigen, ohne die globale Leertasten-Play-Registry zu stören (der Knob ist ein `<button>`, die Registry ignoriert Buttons via `shouldIgnoreSpacebarTarget`). Icon-Regel: falls ein Icon nötig, Phosphor ([[icons]]).
- [ ] **Step 4.2 — Speed 33/45 reales Tempo verdrahtet.** Über den Hub fließt `speed` an `VinylRecord` (Platter), Rotationsdauer schaltet 1800↔1333 ms. Beim Speed-Wechsel **während** der Wiedergabe darf der Rotor nicht springen (die `preserveRotorRotationAndCancel`-Handoff-Logik in `VinylRecord` greift bereits bei `spinState`-Wechseln; sicherstellen, dass ein reiner Speed-Wechsel bei gleichbleibendem `Playing`-Spin ebenfalls einen sauberen Re-Start mit neuer Dauer macht — ggf. `useEffect`-Dep um `speed` erweitern).
- [ ] **Step 4.3 — Gespiegelte Steuerung End-to-End.** Verifizieren, dass Knob, Playbutton (Fernbedienung), Leertaste und Media-Key **denselben** Zustand steuern: Leertaste-Play → Knob springt auf Default-Play-Speed + LED an; Knob auf STANDBY → Pause + Playbutton zeigt Play-Icon; Playbutton-Pause → Knob auf STANDBY + LED aus. Das Default-Play-Speed-Verhalten (33 oder 45 bei Leertaste/Playbutton) gemäß offener Frage B.
- [ ] **Step 4.4 — `TurntablePlayer.test.tsx` erweitern.** Knob-Klick rotiert Speed (Standby→33→45); Knob-auf-33 startet Play (Engine-`play`-Mock aufgerufen); Knob-auf-Standby pausiert; LED-Power folgt; Playbutton-Klick und Knob steuern denselben Hub (gemeinsamer State). **Kein** unbeaufsichtigtes Audio in Tests (Mocks, [[feedback_no_unattended_audio_playback]]).
- [ ] **Step 4.5 — Regression + Cross-Browser.** Volle Frontend-Suite grün. Manuelle Gegenprüfung der Player-kritischen Pfade auf Safari/Firefox/Chrome (Spin-Handoff, kein Stutter beim Speed-Wechsel, kein Audio-Click) — visuelle Prüfung macht der User, hier nur die technische Checkliste vorbereiten ([[feedback_browser_verification]]).
- [ ] **Step 4.6 — Gates** (wie Step 1.6, zusätzlich voller `pnpm run doctor` ohne `:diff` einmal, weil der Pre-Commit-Hook Full-Scan macht und Dinge wie unused-export fängt, die `doctor:diff` nicht sieht — siehe Memory `project_doctor_command_pitfalls`).
- [ ] **Step 4.7 — Commit.** `Feat: interactive turntable knob with 33/45 speed control (MC-071)`

---

## Offene Design-Fragen (User-Entscheid)

Diese UI-/Verhaltens-Entscheidungen sind **nicht** technisch ableitbar und müssen vor (oder spätestens zu Beginn von) Einheit 4 vom User beantwortet werden ([[feedback_no_technical_detail_questions]]: Produkt-/Verhaltens-Unklarheiten vorab fragen):

- **A — Knob-Interaktion (Hauptfrage).**
  - Wie schaltet der Knob? **Klick rotiert durch** STANDBY → 33 → 45 → (zurück auf STANDBY? oder 45 → 33 → STANDBY rückwärts? oder 45-Klick = no-op und nur explizit auf STANDBY?). Default-Annahme im Plan: zyklisch STANDBY → 33 → 45 → STANDBY.
  - **Drag/Drehung statt Klick?** Soll der Knob per Maus-Drag (oder Touch-Drag) gedreht werden wie ein echter Schalter, oder reicht Klick-zum-Weiterschalten? Drag ist deutlich mehr Aufwand (Pointer-Events, Winkel-Mapping, A11y).
  - **Drehanimation:** Soll der Indikator-Strich **animiert** von Position zu Position drehen (sanfter Übergang), oder hart umspringen? Falls animiert: über welche Dauer/Easing (GPU-only, transform/rotate, [[feedback_animations_always_gpu]]).
  - **A11y-Form:** `<button>` mit `aria-label`-Toggle, oder `role="slider"` mit `aria-valuetext` (STANDBY/33/45)?
- **B — Standardverhalten bei Play über Leertaste / Playbutton / Media-Key.** Wenn der User **nicht** den Knob, sondern Leertaste/Playbutton/Media-Key zum Starten nutzt: Auf welchen Speed springt der Knob — **33** (klassische LP-Default-Geschwindigkeit) oder **45**? Plan-Default-Annahme: **33**.
- **C — Pause-/Stopp-Semantik des Knobs.** Bedeutet „Knob auf STANDBY" = **Pause** (Position bleibt erhalten, Resume möglich) oder **Stopp** (zurück auf Anfang)? Heute ist die zweite Taste/Klick = Pause (Position bleibt). Plan-Default-Annahme: STANDBY = Pause (konsistent mit heute).
- **D — `VfdWaveFormDisplay` ist NICHT Teil von MC-071.** Laut `architecture/player-architecture.html` (Hub-Sektion, `<span class="tag new">geplant</span>`, „Kommt später dazu") ist die Wellenform-Anzeige ein späterer Schritt. **Annahme: außerhalb des Scopes von MC-071** — kein Code dafür in diesem Plan. Bestätigung einholen, falls der User sie doch mitnehmen will (dann eigener Plan).
- **E — Speed sichtbar bei Cover-View / Landing-ohne-Share?** Der Knob/Platter ist nur in der `turntable`-View sichtbar. Soll der Hub-Speed-Zustand auch dann „real" geführt werden, wenn gar keine Turntable sichtbar ist (Cover-View, Landing-ohne-Share)? Plan-Default: Ja, der Hub führt den Zustand immer, sichtbar wird er nur in der Turntable-View — kein Sonderpfad.

---

## Risiken & Mitigation

- **Player-Stack ist heikel** ([[project_player_c_cc_divergence]]): EIN gemeinsamer Player für C + CC darf nicht versehentlich auseinanderfallen. Mitigation: Einheit 1+2 ändern **kein** sichtbares Verhalten (reiner Strukturumbau mit Verhaltens-Verifikation), erst Einheit 3+4 fügen Optik/Interaktion hinzu. Jede Einheit für sich testbar + Commit.
- **SSR-Islands ohne LocaleProvider** ([[project_ssr_islands_no_locale_provider]]): `useT`/`useLocale` nur in Komponenten, deren **alle** Render-Kontexte einen Provider haben. Der Hub-Context selbst braucht kein `useT`. Falls ein neuer Knob-`aria-label` übersetzt werden soll, prüfen, dass der Knob nur innerhalb des `LocaleProvider`-Baums rendert (ShareLayout wrappt; Landing auch). Nach jedem `useT`-Zusatz Server-Log + curl-SSR prüfen.
- **WebAudio-Gesten-Timing** (`AudioPlayer.tsx`, `ensureSpectrumAnalyzer`-Doc): Der Knob-Klick muss `togglePlay` **synchron** im Klick-Stack auslösen (wie der heutige Playbutton), sonst geht die User-Activation für `AudioContext.resume()` verloren (dunkles Spektrum). Mitigation: Knob ruft `hub.togglePlay`/`hub.setSpeed` synchron; keine `await`-Kette davor.
- **Rotor-Stutter beim Speed-Wechsel** (Safari/Firefox, [[project_safari_paint_race]], `VinylRecord`-Handoff-Kommentare): Ein Speed-Wechsel während `Playing` muss durch `preserveRotorRotationAndCancel` laufen, sonst springt der Winkel. Mitigation: `useEffect`-Dep um `speed` erweitern, sodass ein sauberer Re-Start mit neuer Dauer beim aktuellen Winkel ansetzt.
- **Doctor `domain-literals`-Plugin**: Die neuen Speed/Power-Literale müssen `as const`-Namespaces in PascalCase.PascalCase sein, sonst feuert die Regel. Mitigation: in Step 1.1 verankert.
- **Prop-Ketten-Bereinigung**: Das Entfernen von `vinylSpinState` durch fünf Komponenten birgt Bruchrisiko. Mitigation: in Einheit 2/3 schrittweise, mit `tsc --noEmit` als Gate nach jeder Datei.

---

## Verified Facts (grep/Read-Belege, Stand 2026-06-29)

| Referenz | Beleg |
|---|---|
| `~/.local/bin/plans next` → `MC-071` | ausgeführt; `plans check` = „OK: every plan has a unique Plan-Nr." |
| `apps/frontend/src/components/audio/AudioPlayer.tsx` existiert, `useAudioController`, `togglePlay`, `seekBy`/`seekToStart`/`seekToNearEnd`, `audioRef`, `audioRegistry`, `AudioKeyboardHandle` | `Read` (1341 Z): Z.471 `useAudioController`, Z.1039 `togglePlay`, Z.1163 `seekBy`, Z.1180 `seekToStart`, Z.1192 `seekToNearEnd`, Z.247 `AudioKeyboardHandle`, Z.260 `audioRegistry`, Z.489 `audioRef`, Z.1325 `export function AudioPlayer` |
| `AudioPlayer`-Props: `previewUrl`/`refreshShortId`/`mediaKind`/`trackTitle`/`onPlaybackIntent`/`onStatusChange`/`onSeekHint` | `Read` `AudioPlayer.tsx` Z.21-37 (`AudioPlayerProps`) |
| `AudioStatus` = `{ Loading, Ready, Playing, Paused, Ended, Unavailable }` | `Read` `apps/frontend/src/components/audio/AudioStatus.ts` (10 Z) |
| `MediaCardHead` rendert `SongInfo` + `AudioPlayer` (per `key`) + `ShareButton`, gemeinsamer Vorfahr | `Read` `apps/frontend/src/components/cards/MediaCardHead.tsx` Z.113 (SongInfo), Z.136 (`<AudioPlayer key={audioPlayerKey} …>`), Z.153 (ShareButton); `audioPlayerKey` Z.83 |
| `SongInfo` rendert `VfdInfoDisplay` + Turntable-Stage (nur bei `shareMediaView !== undefined`) | `Read` `SongInfo.tsx` Z.81 (`showTurntableStage`), Z.199 (`<Turntable record={{…, spinState: vinylSpinState}} />`), Z.223 (`<VfdInfoDisplay …>`) |
| `VfdInfoDisplay` Props (`title`/`artist`/`detailLine`/`metaLine`/`statusLine`/`seekHint`) | `Read` `apps/frontend/src/components/ui/VfdInfoDisplay.tsx` Z.40-60 |
| `VfdAnalyzerDisplay` Props (`isPlaying`/`isDisabled`/`timeText`/`progressRatio`/`phosphorColor`/`ariaLabel`/`className`), bewusst prop-getrieben „re-hosted under a different player context" | `Read` `apps/frontend/src/components/ui/VfdAnalyzerDisplay.tsx` Z.30-45 (Props), Z.28-29 (Doc-Kommentar) |
| `PlayerParts.tsx`: `PlayerContext`, `PlayerButton`, `PlayerProgress` (Default → `VfdAnalyzerDisplay`, `children` → `PlayerCustomProgress`) | `Read` `apps/frontend/src/components/playback/PlayerParts.tsx` Z.47 (`PlayerContext`), Z.92 (`PlayerButton`), Z.131 (`PlayerProgress`), Z.138-150 (Analyzer-Default), Z.174 (`PlayerCustomProgress`) |
| `Player` = `Object.assign(PlayerRoot, { Button, Progress, Time })` | `Read` `apps/frontend/src/components/playback/Player.ts` (8 Z) |
| `ShareLayout` `shareUiReducer` hält `previewStatus`/`vinylSpinState`; `nextVinylSpinStateFromPreviewStatus`; `PlaybackIntentStarted`→Playing; `VinylCoastFinished`-Timer 2000ms | `Read` `apps/frontend/src/components/share/ShareLayout.tsx` Z.72 (reducer), Z.86-93 (Intent/PreviewStatus), Z.228-238 (`nextVinylSpinStateFromPreviewStatus`), Z.409-413 (Coast-Timer), Z.433-450 (`vfdStatusLine`) |
| Spin-Prop-Kette: ShareLayout → Desktop/Mobile → MediaSummaryCard/SharePageCard→MediaCard → MediaCardHead → SongInfo | `Read` `DesktopShareLayout.tsx` Z.80-88, `MobileShareLayout.tsx` Z.57-65, `SharePageCard.tsx` Z.48-57, `MediaSummaryCard.tsx` Z.35-45, `MediaCard.tsx` Z.48-58 |
| `Turntable.tsx`: dekorativer Speed-Knob (`data-turntable-speed-knob`, statisch `rotate(-150deg)`), LED (`data-turntable-led`), Labels 33/45/ON/STANDBY, rendert `VinylRecord` | `Read` `apps/frontend/src/components/vinyl/Turntable.tsx` Z.102-119 (Labels+Knob), Z.27-31 (`SPEED_MARK_STYLE` statisch), Z.123-134 (LED), Z.136-138 (`<VinylRecord {...record} />`) |
| `VinylRecord` `LP_ROTATION_DURATION_MS = 1800`, eine Rotationsdauer, `spinState`-Prop, `startRotorAnimation`, Web-Animations-Handoff | `Read` `apps/frontend/src/components/vinyl/VinylRecord.tsx` Z.28 (`LP_ROTATION_DURATION_MS = 1800`), Z.31-35 (`LP_PLAYING_TIMING`), Z.360 (`startRotorAnimation`), Z.340 (`preserveRotorRotationAndCancel`), Z.430-439 (`useEffect` auf `spinState`) |
| `VinylSpinState` = `{ Idle, Playing, Coasting }` | `Read` `apps/frontend/src/components/vinyl/VinylRecord.types.ts` (8 Z) |
| `VinylRecord` Hub-fremde Nutzungen (fix `Playing`): HeroSubmitSlot, SlideArtwork | `grep`: `HeroSubmitSlot.tsx:81,138`, `SlideArtwork.tsx:117` (alle `spinState={VinylSpinState.Playing}`) |
| `ShareMediaView` = `{ Cover, Turntable }` | `Read` `apps/frontend/src/components/share/ShareMediaView.types.ts` (7 Z) |
| `MediaKindValue` = `{ Preview, Song }` (`mediaKind?` optional) | `Read`/`grep` `apps/frontend/src/lib/types/media-card.ts` Z.24-29, Z.66 |
| `analyzerMode.ts`: globaler Modul-State + `useAnalyzerMode`/`toggleAnalyzerMode`, „D"-Keybinding | `Read` `apps/frontend/src/components/playback/analyzerMode.ts` (135 Z) |
| `createContext`-Pattern im Repo (Context + werfender Hook) | `Read` `PlayerParts.tsx` Z.47-53; `grep` weitere: `RecessedCardParts.tsx`, `ToastContext.tsx`, `DialogContext.tsx` |
| `TurntablePlayer` existiert noch NICHT | `grep -rn "TurntablePlayer" apps/frontend/src` → 0 Treffer |
| Gate-Scripts: Root `lint`=`biome check .`, `doctor:diff`, `test:run`=`pnpm -r --if-present test:run`; Frontend `check`=`astro check`, `test:run`=`vitest run` | `grep` Root `package.json` + `apps/frontend/package.json` scripts |
| `doctor:staged`=`pnpm doctor` (Full-Scan), Custom-Plugin `domain-literals` (no-inline-discriminant-literals + prefer-pascal-case-literal-namespaces) | `grep` Root `package.json`; CLAUDE.md react-doctor-prevention; Memory `project_doctor_command_pitfalls` |
| Sibling-Pläne MC-069 (rename) + MC-070 (VFD-Sonderformen) in `.claude/plans/open/`, Code bereits umgesetzt | `Read` `2026-06-29-rename-audioplayer-shareresult.md` (Plan-Nr. MC-069), `2026-06-29-vfd-display-sonderformen.md` (Plan-Nr. MC-070, Checkboxen `[x]`) |

---

## Checkliste

- [ ] Alle Code-Referenzen verifiziert (Funktionen, Pfade, Konstanten, Scripts) — siehe Verified-Facts-Block; **vor Execute re-greppen** (Plans altern).
- [ ] Offene Design-Fragen A–E vom User beantwortet (insb. Knob-Interaktion A + Default-Play-Speed B), bevor Einheit 4 startet.
- [ ] Einheit 1: Context + Namespaces + reine Helfer + `turntableState.test.ts` grün; `VinylRecord` `speed`-Prop rückwärtskompatibel (Default = heutiges Verhalten); bestehende Vinyl/Turntable-Tests grün. Commit.
- [ ] Einheit 2: `TurntablePlayerProvider` hält Engine + Speed/Power/Spin; `MediaCardHead` wrappt; `ShareLayout` gibt Spin-Ableitung ab, behält Status-Zeile; Verhalten verifiziert identisch; `ShareLayout.test.tsx`/`LandingPage.test.tsx` grün. Commit.
- [ ] Einheit 3: Compound `LED`/`Platter`/`Control`/`KnobLabels` sichtbar; `Turntable.tsx` aufgeteilt **ohne Optik-Änderung** (Screenshot-Abgleich gegen abgenommene Optik + Architektur-Seite); `TurntablePlayer.test.tsx` grün. Commit.
- [ ] Einheit 4: Knob interaktiv (gemäß Frage A), Speed 33/45 reales Tempo (1800↔1333 ms, kein `playbackRate`), gespiegelte Steuerung (Knob ↔ Playbutton ↔ Leertaste ↔ Media-Key), kein Rotor-Stutter beim Speed-Wechsel; Regression + Cross-Browser-Checkliste. Commit.
- [ ] EIN gemeinsamer Player für C + CC erhalten (kein Sonderpfad, [[project_player_c_cc_divergence]]).
- [ ] `VfdWaveFormDisplay` NICHT umgesetzt (Frage D: außerhalb Scope, bestätigt).
- [ ] Hub-fremde `VinylRecord`-Nutzungen (HeroSubmitSlot, SlideArtwork) unverändert.
- [ ] Pro Einheit: `biome check --write` → `tsc --noEmit`/`astro check` → `pnpm run doctor:diff` (Einheit 4 zusätzlich voller `pnpm run doctor`) → `pnpm --filter @musiccloud/frontend test:run`, alle grün.
- [ ] TSDoc auf jedem neuen Export; Kommentare/Docs bei jeder Änderung mitgezogen ([[feedback_keep_code_docs_current]]).
- [ ] Abschluss-Verschiebung nach `done/` nur nach expliziter User-Abnahme ([[feedback_plan_hygiene]]).
