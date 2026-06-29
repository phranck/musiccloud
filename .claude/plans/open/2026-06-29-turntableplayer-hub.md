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

- [x] **Step 1.1 — `TurntableSpeed`/`TurntablePower`-Namespaces + Context-Definition.** In `TurntablePlayerContext.ts`: die zwei `as const`-Namespaces (`TurntableSpeed = { Standby, Rpm33, Rpm45 }`, `TurntablePower = { On, Standby }`) in **PascalCase.PascalCase** (Doctor-Regel `domain-literals/prefer-pascal-case-literal-namespaces`), das `TurntablePlayerContextValue`-Interface (s. Zielarchitektur), `const TurntablePlayerContext = createContext<TurntablePlayerContextValue | null>(null)` und `useTurntablePlayer()` (wirft außerhalb Provider, Pattern aus `PlayerParts.usePlayerContext`). TSDoc auf Interface, jeden Namespace, den Hook. **Keine** React-Komponente in dieser Datei (Logik/Component-Trennung, [[feedback_separate_logic_from_components]]).
- [x] **Step 1.2 — Reine Helfer in `turntableState.ts`.** Funktionen (alle pur, modul-scope, TSDoc):
  - `derivePower(speed: TurntableSpeed): TurntablePower` — `On` bei `Rpm33`/`Rpm45`, sonst `Standby`.
  - `nextSpeedInCycle(speed: TurntableSpeed): TurntableSpeed` — `Standby → Rpm33 → Rpm45 → Standby` (Default-Zyklus; finale Richtung s. offene Frage).
  - `speedKnobAngle(speed: TurntableSpeed): number` — Grad-Winkel für den Indikator je Speed (aus der Label-Geometrie in `Turntable.tsx` ableiten: STANDBY unten-links, 33/45 oben). Konstanten benannt.
  - `rotationDurationForSpeed(speed: TurntableSpeed): number` — `LP_ROTATION_DURATION_45_MS` bei `Rpm45`, sonst `LP_ROTATION_DURATION_33_MS`.
  - `deriveSpinState(params)` — kapselt die heutige `nextVinylSpinStateFromPreviewStatus`-Logik (Playing → `Playing`, gestoppt aus Playing/Coasting → `Coasting`, sonst `Idle`), entkoppelt von `AudioStatus`-Namespace-Import wo möglich. Konstanten `LP_ROTATION_DURATION_33_MS = 1800`, `LP_ROTATION_DURATION_45_MS = 1333` (kommentiert: `≈ 1800 × 33⅓ / 45`).
- [x] **Step 1.3 — TDD `turntableState.test.ts`.** Tests vor/parallel zur Implementierung: `derivePower` für alle drei Speeds; `nextSpeedInCycle` durchläuft Standby→33→45→Standby; `rotationDurationForSpeed` gibt 1333 für 45, 1800 sonst; `deriveSpinState` für Playing/Pause/Ended/Idle. Reine Funktions-Tests (kein Render).
- [x] **Step 1.4 — `VinylRecord` Speed-Prop (rückwärtskompatibel).** In `VinylRecord.types.ts` den `VinylRecordProps`-Typ um `speed?: TurntableSpeed` erweitern (Import aus `turntable/TurntablePlayerContext`). In `VinylRecord.tsx`: `LP_ROTATION_DURATION_MS` → `LP_ROTATION_DURATION_33_MS` umbenennen, `LP_ROTATION_DURATION_45_MS` ergänzen, `LP_PLAYING_TIMING` aus einer `playingTimingForSpeed(speed)`-Hilfe ableiten (Dauer je Speed), `startRotorAnimation` und der `useEffect` nehmen `speed` (Default `TurntableSpeed.Rpm33`) entgegen. **Default = heutiges Verhalten** (1800 ms), damit `HeroSubmitSlot`/`SlideArtwork`/aktuelle Aufrufer unverändert laufen.
- [x] **Step 1.5 — Bestehende Tests grün halten.** `VinylRecord.test.tsx` und `Turntable.test.tsx` müssen ohne Änderung passen (Default-Speed). Bei Bedarf einen Test ergänzen: `VinylRecord` mit `speed={Rpm45}` setzt eine kürzere Rotationsdauer (über die WAA-Timing-Auswahl oder einen exponierten Helfer prüfbar).
- [x] **Step 1.6 — Gates.** `biome check --write apps/frontend/src/components/turntable apps/frontend/src/components/vinyl`, dann aus Repo-Root: `pnpm --filter @musiccloud/frontend exec tsc --noEmit` (bzw. `pnpm --filter @musiccloud/frontend check`), `pnpm run doctor:diff`, `pnpm --filter @musiccloud/frontend test:run`.
- [x] **Step 1.7 — Commit.** `Refactor: add TurntablePlayer hub context + VinylRecord speed prop (MC-071)` *(Commit `dff7d6c7`.)*

### Einheit 2 — Provider + Engine-Einbettung (Verhalten konstant)

**Files:**
- Create: `apps/frontend/src/components/turntable/TurntablePlayerProvider.tsx`
- Create: `apps/frontend/src/components/turntable/TurntablePlayerProvider.test.tsx`
- Create: `apps/frontend/src/components/turntable/TurntableAnalyzerSlot.tsx`
- Modify: `apps/frontend/src/components/cards/MediaCardHead.tsx`
- Modify: `apps/frontend/src/components/share/ShareLayout.tsx`

- [x] **Step 2.1 — `TurntablePlayerProvider`.** Komponente, die die heutigen `AudioPlayer`-Props entgegennimmt (`previewUrl`/`refreshShortId`/`mediaKind`/`trackTitle`/`onPlaybackIntent`/`onStatusChange`/`onSeekHint`), `useAudioController(props)` aufruft (**Engine bleibt, wird nur hierher gehoben**), den `speed`-State hält (`useReducer` mit Actions `PlayToggled`/`SpeedSet`/`SpeedCycled`/`EngineStatus`), `power = derivePower(speed)` und `spinState = deriveSpinState(...)` ableitet, den Coast-Timer hält (2s, der heute in `ShareLayout` sitzt) und den Context-Value zusammensetzt. **Synchronisierung:** `togglePlay` ruft `engine.togglePlay()` und setzt Speed konsistent (Start → Default-Speed; Pause/Ended/Unavailable → `Standby`). `setSpeed`/`cycleSpeed` (Knob) starten/pausieren die Engine passend (33/45 → play, Standby → pause). TSDoc. *(Umgesetzt: `useAudioController` wird in `AudioPlayer.tsx` exportiert + um `seekBy`/`seekToStart`/`seekToNearEnd` im View-Model erweitert. Reducer-Actions: `PlaybackIntentStarted`/`EngineStatus`/`CoastFinished`/`SpeedSet`. Engine-`onPlaybackIntent` setzt sofort `Rpm33`+spin Playing; `onStatusChange` leitet Speed/Spin ab. `setSpeed(Standby)` = STOPP per `engine.togglePlay()` (falls spielend) + `engine.seekToStart()`.)*
- [x] **Step 2.2 — Status-Brücke nach `ShareLayout`.** Der Provider reicht `onStatusChange(status)` weiter (für die VFD-Status-Zeile in `ShareLayout`). Die `onPlaybackIntent`-Semantik (sofortiger Spin vor `play()`-Resolve) wird im Hub über den `spinState` realisiert; nach außen meldet der Provider Intent weiterhin (für Analytics in `ShareLayout`, das heute `PlaybackIntentStarted` dispatcht — diese Action verliert ihre Spin-Wirkung, behält aber ggf. andere). **Prüfen**, ob `ShareLayout.PlaybackIntentStarted` nach dem Hub-Umbau noch etwas tut; falls nur Spin → entfernen. *(Geprüft: `PlaybackIntentStarted` setzte ausschließlich `vinylSpinState: Playing`, keine Analytics → komplett entfernt. `handlePlaybackIntent` + die `onPlaybackIntent`-Prop-Kette ShareLayout→Desktop/Mobile→Cards→MediaCardHead entfernt, da kein Konsument mehr. Der Provider behält die optionale `onPlaybackIntent`-Prop (Teil von `AudioPlayerProps`), MediaCardHead reicht sie aber nicht mehr.)*
- [x] **Step 2.3 — `TurntableAnalyzerSlot`.** Dünne Komponente: `const hub = useTurntablePlayer()` und rendert die **Fernbedienung** = Playbutton (Hub-konsumierend) + `<VfdAnalyzerDisplay isPlaying={hub.isPlaying} isDisabled={hub.isDisabled} timeText={hub.timeText} progressRatio={hub.progressRatio} ariaLabel=… />`. Der Playbutton ruft `hub.togglePlay`. Wiederverwendung von `PlayerButton`/`Player`-Optik soweit möglich (gleicher Look), aber Daten aus dem Hub. (Finale Entscheidung Wiederverwendung vs. neuer Button in diesem Step.) *(Umgesetzt: Slot rendert das bestehende `Player`-Compound (`PlayerButton` + `PlayerProgress`→`VfdAnalyzerDisplay`) in derselben `<section aria-label>`-Hülle wie der frühere `AudioPlayer` — Optik 1:1, Daten aus dem Hub. Kein neuer Button.)*
- [x] **Step 2.4 — `MediaCardHead` umstellen.** `SongInfo` + Player-Bereich in `<TurntablePlayerProvider …>` wrappen. Den heutigen `<AudioPlayer key={…} … />` durch `<TurntableAnalyzerSlot />` ersetzen (Provider hält die Engine, Slot rendert Fernbedienung). Der `key`-Remount (content-identity) wandert auf den **Provider** (Engine-Reset bei Track-Wechsel). `onSeekHint`/`handleSeekHint`/`seekHint`-Verdrahtung an SongInfo bleibt — aber `onSeekHint` kommt jetzt aus dem Provider/Hub. TSDoc/Kommentare mitziehen ([[feedback_keep_code_docs_current]]). *(Umgesetzt: `key={turntableHubKey}` auf dem Provider. `SongInfo` bleibt unverändert (Einheit-3-Territorium); der Hub-Spin erreicht es über eine interne Brücke `MediaCardHeadHubStage`→`MediaCardHeadStage`→`SongInfo.vinylSpinState`. No-Preview-Pfad rendert die Stage ohne Provider (kein Engine-Mount, spin Idle) — verhaltensgleich zum alten Zustand.)*
- [x] **Step 2.5 — `ShareLayout` Spin-Ableitung abgeben.** Aus `shareUiReducer` entfernen: `vinylSpinState`, `nextVinylSpinStateFromPreviewStatus`, `PlaybackIntentStarted`→Playing-Wirkung, `VinylCoastFinished`-Timer-Effekt, die `vinylSpinState`-Props an Desktop/Mobile-Layout. **Behalten:** `previewStatus` (für `vfdStatusLine`), `shareMediaView`-Toggle, `handlePreviewStatusChange`. `handlePlaybackIntent` nur behalten, wenn es außer Spin noch etwas tut (s. Step 2.2). Die nachgelagerten Layouts (`DesktopShareLayout`/`MobileShareLayout`/`SharePageCard`/`MediaCard`/`MediaSummaryCard`) verlieren die `vinylSpinState`-Prop. *(Umgesetzt: alle genannten Reducer-Teile + Coast-Effekt + `handlePlaybackIntent` entfernt; `previewStatus`/`vfdStatusLine`/`shareMediaView`/`handlePreviewStatusChange` behalten. `vinylSpinState` + `onPlaybackIntent` aus der gesamten Prop-Kette gestrichen.)*
- [x] **Step 2.6 — `TurntablePlayerProvider.test.tsx` (TDD).** Play-Start setzt `speed` auf den Default-Play-Speed + `power=On`; `setSpeed(Standby)` pausiert die Engine + `power=Standby`; Engine-`Ended` setzt `speed=Standby`; `spinState` folgt (Playing während Wiedergabe). Engine über `HTMLMediaElement.prototype.play/pause`-Mocks wie in `AudioPlayer.test.tsx`. *(Umgesetzt: 4 Tests. `setSpeed(Standby)` verifiziert zusätzlich `seekToStart` (currentTime=0) für die STOPP-Semantik. Engine-`ended`-Event über das via `play()`-`this` eingefangene Audio-Element dispatcht.)*
- [x] **Step 2.7 — Verifikation Verhalten konstant.** Manuell/Test: Play/Pause/Seek (Pfeiltasten + cmd), Spin-Verhalten (Playing/Coasting/Idle), VFD-Status-Zeile, Media-View-Toggle (`p`-Taste) identisch zu vor dem Umbau. `ShareLayout.test.tsx` + `LandingPage.test.tsx` grün. *(Bestätigt: Keyboard-Registry + Seek + togglePlay bleiben die unveränderten Engine-Methoden (nur in den Provider gehoben); STANDBY=stop ist nur über `setSpeed` erreichbar, das in Einheit 2 noch nicht an UI verdrahtet ist. `ShareLayout.test.tsx`/`LandingPage.test.tsx` grün; die Spin-Coverage wanderte in `TurntablePlayerProvider.test.tsx`.)*
- [x] **Step 2.8 — Gates** (wie Step 1.6, plus `pnpm run doctor:diff` auf 0 Issues). *(Biome: 0 Fixes; tsc --noEmit: 0 Fehler; react-doctor Full-Scan: 0 Issues @musiccloud/frontend; Frontend-Suite: 51 Files / 305 Tests grün.)*
- [x] **Step 2.9 — Commit.** `Refactor: move audio engine + spin derivation into TurntablePlayer hub (MC-071)`

### Einheit 3 — Compound-Teile sichtbar (LED / Platter / Control / KnobLabels)

**Files:**
- Create: `apps/frontend/src/components/turntable/TurntablePlayer.tsx`
- Create: `apps/frontend/src/components/turntable/TurntablePlayer.test.tsx`
- Modify: `apps/frontend/src/components/vinyl/Turntable.tsx`
- Modify: `apps/frontend/src/components/cards/SongInfo.tsx`

- [x] **Step 3.1 — Compound-Root + Parts.** `TurntablePlayer.tsx`: `TurntablePlayerRoot` plus `LED`, `Platter`, `Control`, `KnobLabels`, exponiert als Namespace (`Object.assign(Root, { LED, Platter, Control })`, `Control` selbst `Object.assign(ControlRoot, { Knob, KnobLabels })`). `LED` konsumiert `power` (an/aus-Optik aus `Turntable.tsx`-`LED_STYLE`/`LED_GLOW_STYLE` portiert). `Platter` konsumiert `speed`/`spinState` und rendert `<VinylRecord speed={…} spinState={…} {...recordProps} />`. `KnobLabels` = statische 33/45/ON/STANDBY-Beschriftung. TSDoc auf jeden Part. *(Umgesetzt mit Split in zwei Files: `TurntablePlayerParts.tsx` hält alle Part-Komponenten — präsentationale `TurntablePlayerLed`/`Platter`/`Control`/`Knob`/`KnobLabels`/`Surface` (prop-getrieben) plus Hub-Wrapper `HubLed`/`HubPlatter`/`HubControl`/`TurntablePlayerRoot`; `TurntablePlayer.ts` hält nur die `Object.assign`-Namespace-Montage (Pattern wie `Player.ts`/`RecessedCard.ts`, sonst feuert Doctor `Maintainability: Non-component export in component file`). LED: ON-Optik 1:1, `power` als `data-turntable-led-power` exponiert, keine sichtbare Änderung im ON-Zustand (dimmed-Standby bewusst auf Einheit 4 vertagt, OBERSTES GEBOT 100% Optik). Knob dekorativ: Indikator-Transform = `translateY(-50%) rotate(speedKnobAngle(speed))`, Rpm33 reproduziert exakt das alte statische `rotate(-150deg)`.)*
- [x] **Step 3.2 — `Turntable.tsx` neu aufteilen.** Die Deck-Chrome (Brand, Platter-Schatten, Spindel, Speed-Labels, LED) zwischen `TurntablePlayer.Platter`/`.Control`/`.LED`/`.KnobLabels` aufteilen, **ohne die Optik zu ändern** (Styles 1:1 portieren). Der Knob bleibt in diesem Step **dekorativ** (zeigt `speedKnobAngle(speed)`), Interaktion folgt in Einheit 4. `data-turntable-*`-Attribute beibehalten (Tests + Selektoren hängen dran). *(Umgesetzt: `Turntable.tsx` ist eine dünne prop-getriebene Hülle, die die präsentationalen Parts arrangiert — `TurntablePlayerSurface` + `Platter`/`Control`/`Led`, Spin/Speed aus `record` statt Hub, kein Provider nötig. Alle 7 `data-turntable-*` erhalten (+ additives `data-turntable-led-power`); alle Style-Konstanten byte-identisch zur alten Datei verifiziert; `Turntable.test.tsx` unverändert grün.)*
- [x] **Step 3.3 — `SongInfo` Turntable-Stage auf Compound.** Den `<Turntable record={{ …, spinState: vinylSpinState }} />`-Block durch den Hub-konsumierenden `<TurntablePlayer.Platter />` (+ `.Control`/`.LED`) ersetzen bzw. `speed`/`spinState` aus dem Hub ziehen statt aus dem `vinylSpinState`-Prop. **Wichtig:** `showTurntableStage` bleibt an `shareMediaView !== undefined` gekoppelt (Landing-ohne-Share zeigt weiter nur Cover). Der `vinylSpinState`-Prop an `SongInfo` entfällt. *(Umgesetzt mit Deck-Injektion: `SongInfo` bekommt `turntableStage?: ReactNode` statt `vinylSpinState` (plus die nur noch fürs Deck genutzten Label-Props `labelAlbumTitle`/`labelCatalogText`/`labelRightsText`/`labelReleaseYear` entfernt). `MediaCardHead` baut das Deck via `buildVinylLabelRecord(content)` und reicht im Preview-Pfad das Hub-getriebene `<TurntablePlayer record={…} />`, im No-Preview-Pfad das statische `<Turntable record={…} />` — so konsumiert der Hub-Hook NUR unter Provider (SSR/No-Provider-sicher: `shareMediaView` kann ohne Provider gesetzt sein, da ShareLayout es immer durchreicht). Die Unit-2-Brücke `MediaCardHeadHubStage` entfällt; `MediaCardHeadStage` nimmt jetzt `turntableStage`. `showTurntableStage = shareMediaView !== undefined` unverändert.)*
- [x] **Step 3.4 — Optik-Abgleich.** Screenshot der Turntable-Stage (Share-Seite, `turntable`-View) gegen den Stand vor Einheit 3 und gegen `architecture/player-architecture.html` (Deck-Motiv). Pixel-/Layout-identisch ([[feedback_mockups_are_binding]], [[feedback_verify_real_state_before_building]]). Visuelle Prüfung macht der User; hier nur ein gezielter Vorher/Nachher-Screenshot zur Vorlage. *(Code-seitig verifiziert: alle 7 `data-turntable-*` erhalten, alle Style-Konstanten byte-identisch (PLATTER/SPEED_KNOB/LED/LED_GLOW/SPINDLE/SPINDLE_SHADOW/SURFACE), Record-Label-Mapping identisch zum alten SongInfo-Block, Knob-Indikator Rpm33 = altes `rotate(-150deg)`. Visuelle Pixel-Bestätigung liegt beim User per [[feedback_browser_verification]].)*
- [x] **Step 3.5 — `TurntablePlayer.test.tsx`.** Compound rendert LED/Platter/Control/KnobLabels; LED-Zustand folgt `power`; Platter reicht `speed`/`spinState` an `VinylRecord` (per `data-spin-state` + Rotationsdauer prüfbar); Labels 33/45/ON/STANDBY vorhanden (analog `Turntable.test.tsx`). *(Umgesetzt: 6 Tests mit `StubHubProvider` (fixer Context-Value via `TurntablePlayerContext.Provider`, isoliert vom Engine): Root rendert LED/Platter/Control/Brand/Spindel + Labels 33/45/ON/STANDBY; LED-`data-turntable-led-power` folgt On/Standby; Indikator-Winkel Rpm33=-150°/Rpm45=-120°; Platter reicht `spinState` (Coasting) durch; Rotationsdauer 1800↔1333 ms per WAAPI-Mock; `Control.Knob`/`Control.KnobLabels` als Compound-Member exponiert.)*
- [x] **Step 3.6 — Gates** (wie Step 1.6). *(Biome `--write apps/frontend/src`: 0 Fixes (325 Files); `tsc --noEmit`: 0 Fehler; react-doctor Full-Scan `--blocking warning`: 0 Issues (alle 4 Workspaces); Frontend-Suite: 52 Files / 311 Tests grün, inkl. `Turntable.test.tsx`/`SongInfo.test.tsx`/`VinylRecord.test.tsx`/neue `TurntablePlayer.test.tsx`.)*
- [x] **Step 3.7 — Commit.** `Refactor: build TurntablePlayer compound (LED/Platter/Control) (MC-071)` *(Commit `c74460e1`.)*

### Einheit 4 — Knob interaktiv + Speed-Tempo + Synchronisierung

**Files:**
- Create: `apps/frontend/src/components/turntable/TurntableKnob.tsx`
- Modify: `apps/frontend/src/components/turntable/TurntablePlayerParts.tsx`
- Modify: `apps/frontend/src/components/turntable/TurntablePlayerProvider.tsx`
- Modify: `apps/frontend/src/components/turntable/TurntablePlayer.ts`
- Modify: `apps/frontend/src/components/turntable/TurntablePlayer.test.tsx`
- Modify: `apps/frontend/src/components/turntable/turntableState.ts` (+ `.test.ts`)
- Modify: `apps/frontend/src/components/vinyl/Turntable.tsx`

- [x] **Step 4.1 — `TurntableKnob` interaktiv.** *(Umgesetzt gemäß Frage A = DRAG, nicht Klick/`cycleSpeed`. `TurntableKnob` ist ein `role="slider"`: Pointer-Down setzt Pointer-Capture, Move zeigt den Indikator live auf dem Pointer-Winkel (`pointerAngleDeg` via `getBoundingClientRect`), Up snappt über `speedFromAngle(finalDeg)` → `hub.setSpeed`. Tap ohne Bewegung (< 3 px) = No-op (reine Drag-Semantik). A11y: `aria-label`/`aria-valuemin`/`max`/`now`/`valuetext` (Standby/33 RPM/45 RPM), `tabIndex=0`; Pfeil hoch/rechts → höher, runter/links → tiefer (`stepSpeed`, geklammert), Home/End. Pfeil-/Space-/Enter-Keys rufen `stopPropagation`, damit der globale Audio-Keyboard-Router (window-keydown) nicht doppelt feuert — `role="slider"` wird von `shouldIgnoreSpacebarTarget` NICHT ignoriert, daher explizit konsumiert. Kein Icon nötig. Dial-Chrome als shared `KnobDial` (von dekorativem `TurntablePlayerKnob` + interaktivem Knob genutzt), `data-turntable-speed-knob`/`-speed-indicator` erhalten. Indikator-Transform GPU-only (`translateZ(0)` nur am interaktiven Knob; dekorativer bleibt byte-identisch ohne).)*
- [x] **Step 4.2 — Speed 33/45 reales Tempo verdrahtet.** *(Bereits in Einheit 1 verdrahtet: `VinylRecord`-`useEffect`-Dep enthält `speed`, Re-Start läuft durch `preserveRotorRotationAndCancel` (commitStyles + Winkel-Read) → kein Sprung. Verifiziert per Test „drives the rotor revolution duration from the hub speed": Rerender Rpm33→Rpm45 bei `Playing` schaltet `animate`-Dauer 1800↔1333 ms.)*
- [x] **Step 4.3 — Gespiegelte Steuerung End-to-End.** *(Knob-Drag 33/45 startet Play (Engine `play`), Knob auf STANDBY stoppt (pause + `seekToStart`), Playbutton + Leertaste + Media-Key steuern denselben Hub; LED + Indikator folgen. **Provider-Fix**: `speedForEngineStatus(status, currentSpeed)` behält eine bereits gewählte Spielgeschwindigkeit (Drag auf 45 bleibt 45, statt nach `play()`-Resolve auf 33 zu fallen); Default 33 nur aus Standby (Leertaste/Playbutton, Frage B). LED dimmt bei `power=Standby` (opacity-only, GPU), ON-Optik unverändert.)*
- [x] **Step 4.4 — `TurntablePlayer.test.tsx` erweitert.** *(6 Interaktions-Tests mit echtem `TurntablePlayerProvider` + gemockter Engine (`play`/`pause`/`currentTime`): Slider-Rolle + Standby-Rest; Drag→45 startet Play + LED On + Indikator -120°; Drag→Standby stoppt + `seekToStart` + LED Standby; Tap=No-op; Pfeiltasten steppen ohne globalen Router; Playbutton + Knob teilen State. Plus 3 `stepSpeed`-Unit-Tests. Drag via gestubbtem `getBoundingClientRect` + Pointer-Capture-Stubs; kein unbeaufsichtigtes Audio.)*
- [x] **Step 4.5 — Regression.** *(Volle Frontend-Suite grün: 52 Files / 320 Tests. Cross-Browser-Checkliste für den User: Spin-Handoff beim Speed-Wechsel (kein Winkel-Sprung), keine Audio-Clicks beim Drag-Start (gesture-sync `setSpeed`→`togglePlay`), Snap-Transition GPU-only.)*
- [x] **Step 4.6 — Gates.** *(Biome `--write apps/frontend/src`: 0 Fixes (327 Files); `tsc --noEmit`: 0 Fehler; voller `pnpm run doctor` (Full-Scan): 0 Issues (alle 4 Workspaces, nach Fix eines `deslop/unused-export` auf `knobIndicatorTransform`); Frontend-Suite: 320 Tests grün.)*
- [x] **Step 4.7 — Commit.** `Feat: interactive turntable knob with 33/45 speed control (MC-071)` *(Commit `bce8f84f`.)*

### Einheit 5 — Knob-Detents + Label-Beleuchtung (User-Feedback, 2026-06-29)

**Files:**
- Modify: `apps/frontend/src/components/turntable/TurntableKnob.tsx`
- Modify: `apps/frontend/src/components/turntable/TurntablePlayerParts.tsx`
- Modify: `apps/frontend/src/components/turntable/turntableState.ts` (+ `.test.ts`)
- Modify: `apps/frontend/src/components/vinyl/Turntable.tsx`
- Modify: `apps/frontend/src/components/turntable/TurntablePlayer.test.tsx`

- [x] **Step 5.1 — Knob per vertikalem Ziehen, rastet an den Detents ein.** Bedienung über vertikale Drag-Distanz (hoch = schneller, runter = Richtung Standby): je `KNOB_STEP_PX` (22) Weg vom Druckpunkt eine Stufe weiter (`speedAtOffset`), auf die Leiter STANDBY/33/45 geklemmt. Der Indikator ruht immer auf einer Stufe, nie zwischen den Captions; beim Loslassen wird die Stufe per `setSpeed` angewandt. **Distanz statt Zeigerwinkel**, weil die drei Captions auf dem kleinen Knob eng beieinander liegen und ein absoluter Winkel dort wild zwischen den Stufen springt (das winkelbasierte `speedFromAngle` und `pointerAngleDeg` sind entfernt). `animateIndicator` immer an (sanftes Gleiten zwischen Detents). **Zwei Folge-Fixes nach erneutem User-Bugreport (Zeiger sprang weiter):** (1) `SPEED_KNOB_ANGLE_DEG` monoton (150/210/240 statt 150/-150/-120, visuell identisch), damit die CSS-`rotate`-Transition den kurzen Bogen nimmt statt 300° durch 0° zu spinnen (das wirkte wie Umherspringen). (2) Seitentext-Selektion beim Ziehen über eine `body`-`user-select: none`-Sperre während des Drags unterbunden, bewusst **ohne `preventDefault`** im PointerDown: `preventDefault` hob die transiente User-Activation auf, die `AudioContext.resume()` (synchron in `togglePlay`) braucht, und liess Knob-gestartete Wiedergabe stumm bis zu einem Playbutton-Neustart (dritter Bugreport).
- [x] **Step 5.2 — Label-Beleuchtung.** `TurntablePlayerKnobLabels` bekommt einen optionalen `speed`-Prop (Default `Standby`): "33"/"45" leuchten weiss (+ Glow), wenn ihre Stufe gewählt ist; "ON" leuchtet dezent orange, solange `power===On` (33 oder 45); "STANDBY" ohne Leucht-Zustand. `TurntablePlayerControl`/`HubControl` reichen den Speed durch (Hub bzw. Prop), `Turntable.tsx` ebenso. Reine `color`/`text-shadow`-Styles mit kurzer Transition (GPU-freundlich).
- [x] **Step 5.3 — Tests.** Label-Beleuchtung (33/45 weiss bei Auswahl, ON orange bei power on, Standby unlit), vertikales Detent-Stepping (eine Stufe pro `KNOB_STEP_PX`, Klemmung an den Leiter-Enden) und `speedAtOffset`-Unit-Tests.
- [x] **Step 5.4 — Gates.** Biome 0 Fixes; `tsc --noEmit` 0 Fehler; react-doctor Full-Scan 0 Issues (alle 4 Workspaces); Frontend-Suite 52 Files / 321 Tests grün.
- [x] **Step 5.5 — Commit.** `Feat: knob detents + lit speed captions on the turntable (MC-071)`; Drag-Mechanik-Fix nach User-Bugreport: `Fix: drive the turntable knob by vertical drag distance (MC-071)`

### Einheit 6 — Kleine Folge-Anpassungen (User, 2026-06-29)

- [x] **Control +5px.** `TurntablePlayerControl` von `left-[3.1%]` auf `left-[calc(3.1%_+_5px)]` (Knob-/Label-Cluster 5px nach rechts).
- [x] **`TurntablePlayer.Brand`.** `TurntablePlayerBrand` exportiert und als hub-freies Compound-Member `TurntablePlayer.Brand` im Namespace ergänzt (zeigt das "music / cloud"-Wortzeichen links oben, rendert ohne Provider). Test ergänzt.
- [x] **Gates + Commit.** Biome/tsc/Tests grün (35 Turntable-Tests). `Feat: expose TurntablePlayer.Brand and nudge the control 5px right (MC-071)`
- [x] **Cover-Schranktür beim Media-View-Toggle (User, 2026-06-30).** Der Turntable bleibt fix an seiner finalen Position; beim „P"-Toggle schiebt nur noch das Cover wie eine Schranktür zur Seite (Cover höherer z-index, `cover-active` ↔ `cover-exit` = 0/-100%), der Turntable-Layer (niedrigerer z-index) steht fix dahinter. Die `turntable-active`/`turntable-enter`-Slide-Klassen entfernt; `animations.css` + `SongInfo.tsx` + `SongInfo.test.tsx` angepasst. Commit `Feat: keep the turntable fixed, slide only the cover on view toggle (MC-071)`. **Folge-Fix (User):** Die LCD-Overlay-Layer (Dot-Matrix-Grid, Tint, Sheen, Inset-Shadow) lagen als TftScreen-Geschwister über dem ganzen Screen und schnappten beim Cover-View schlagartig über den noch sichtbaren Turntable. Sie liegen jetzt IM Cover-Stage und schieben mit dem Cover wie eine LCD-Tür (`showEffects={false}` auf `TftScreen`, Layer im Cover-`div`, `display:none`-Turntable-Override entfernt).
- [x] **TftScreen-Compound (User, 2026-06-30).** `TftScreen` zur zusammensetzbaren Compound umgebaut: `TftScreen` + `.Cover` (children-fähig, optionaler `image`-Shortcut) + `.Tint` + `.Grid` (CSS-Klasse `matrix`) + `.Sheen` + `.Shadow`; Namespace in `TftScreen.ts`, Parts in `TftScreenParts.tsx`, alte `TftScreen.tsx` und die `showEffects`/`showMatrix`/`insetShadow`-Booleans entfernt. SongInfo: der schiebende Cover-Stage IST die Compound (Doppel-Buffer + GSAP-Cover-Swap erhalten), der Turntable ein separater fixer Layer dahinter im `mc-share-media-screen`-Container. ArtistProfileSection: TFT-Effekt entfernt, nur `.Cover image` + `.Shadow`. Finale Slide-Dauer 800ms (statt 3000ms-Debug). `TftScreen.test.tsx` neu (Compound-Render + Cover image/children). Commit `a439fd83`.
- [x] **45 RPM spielt auch das Audio schneller (User, 2026-06-30, kehrt die ursprüngliche Entscheidung um).** Ursprünglich war 33/45 bewusst nur visuelles Dreh-Tempo (kein `audio.playbackRate`, kein Pitch-Shift). Auf User-Wunsch spielt 45 jetzt das Audio real 1.35x schneller (45 ÷ 33⅓), mit `preservesPitch=false`, sodass die Tonhöhe mitsteigt (authentischer Vinyl-auf-45-Klang); 33 und Standby bleiben bei 1.0. `playbackRateForSpeed(speed)` im Hub-State, über einen `playbackRate`-Prop in `useAudioController` aufs `<audio>` angewandt (`defaultPlaybackRate` überlebt einen Source-Swap). `playbackRateForSpeed`-Unit-Tests + Knob-Verdrahtungs-Tests (Drag→45 = 1.35, →33 = 1).

---

## Entschiedene Design-Fragen (User, 2026-06-29)

- **A — Knob-Interaktion: DRAG/DREHEN.** Der Knob wird per Maus- und Touch-Drag gedreht (Pointer-Events, Winkel-Mapping), nicht per Klick weitergeschaltet. Der gedraggte Winkel rastet auf die nächste Speed-Stufe (STANDBY → 33 → 45, abgeleitet aus der Label-Geometrie in `Turntable.tsx`). Der Indikator-Strich folgt dem Drag live und schnappt beim Loslassen auf die Stufenposition (GPU-only-Transform, [[feedback_animations_always_gpu]]). A11y: `role="slider"` mit `aria-valuetext` (STANDBY/33/45) und Keyboard-Steuerung (Pfeil hoch/runter ändert die Stufe), ohne die globale Leertasten-Play-Registry zu stören. `cycleSpeed` entfällt; stattdessen `setSpeed(speed)` plus ein reiner Helfer `speedFromAngle(deg): TurntableSpeed` in `turntableState.ts`, der den Drag-Winkel auf die nächstgelegene Stufe mappt (mit Unit-Test in Einheit 1).
- **B — Default-Play-Speed: 33 RPM.** Play über Leertaste, Playbutton oder Media-Key setzt `speed = Rpm33`.
- **C — STANDBY = STOPP (nicht Pause).** Knob auf STANDBY stoppt die Wiedergabe UND setzt die Position auf Anfang zurück (`audio.currentTime = 0`), nicht nur Pause. Der Provider (Einheit 2) ruft beim Übergang nach `Standby`: Engine pausieren falls spielend, plus `seekToStart()` (existiert in der Engine, MC-067) für den Reset auf 0. Beim nächsten ON (33/45) startet die Wiedergabe von vorn. **Das weicht vom heutigen Play/Pause ab** (heute bleibt die Position): in Einheit 2/4 explizit verdrahten und testen.
- **D — `VfdWaveFormDisplay` außerhalb Scope** (bestätigt). Kein Code in MC-071, eigener späterer Plan.
- **E — Hub führt Speed immer** (bestätigt), sichtbar nur in der Turntable-View, kein Sonderpfad.
- **F — Knob-Detents + Label-Beleuchtung (User, 2026-06-29, nach erster Umsetzung).** Der Knob wird per vertikalem Ziehen bedient (hoch = schneller, runter = Richtung Standby) und rastet an genau den drei Stufen STANDBY/33/45 ein, immer auf einer Stufe. **Vertikale Distanz statt Zeigerwinkel**, weil der kleine Knob mit eng beieinanderliegenden Captions bei absolutem Winkel wild zwischen den Stufen springt (vom User als Bug gemeldet, daraufhin umgestellt). **ON ist keine vierte Rast-Position, sondern reine Power-Anzeige:** das "ON"-Label leuchtet dezent orange, solange `power===On` (33 oder 45). Die Labels "33"/"45" leuchten weiss, wenn ihre Stufe gewählt ist; "STANDBY" hat keinen Leucht-Zustand. Umgesetzt in Einheit 5.

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

- [x] Alle Code-Referenzen verifiziert (Funktionen, Pfade, Konstanten, Scripts) — siehe Verified-Facts-Block; vor Execute re-gegrept (alle Refs trugen beim Umbau, Code live + Gates grün).
- [x] Offene Design-Fragen A–E vom User beantwortet (Knob = Drag, Default 33, STANDBY = Stopp, VfdWaveForm außerhalb Scope, Hub führt Speed) — siehe Block „Entschiedene Design-Fragen".
- [x] Einheit 1: Context + Namespaces + reine Helfer + `turntableState.test.ts` grün; `VinylRecord` `speed`-Prop rückwärtskompatibel (Default = heutiges Verhalten); bestehende Vinyl/Turntable-Tests grün. Commit `dff7d6c7`.
- [x] Einheit 2: `TurntablePlayerProvider` hält Engine + Speed/Power/Spin; `MediaCardHead` wrappt; `ShareLayout` gibt Spin-Ableitung ab, behält Status-Zeile; Verhalten verifiziert identisch; `ShareLayout.test.tsx`/`LandingPage.test.tsx` grün. Commit.
- [x] Einheit 3: Compound `LED`/`Platter`/`Control`/`KnobLabels` sichtbar (`TurntablePlayerParts.tsx` Parts + `TurntablePlayer.ts` Namespace); `Turntable.tsx` als dünne Hülle aufgeteilt **ohne Optik-Änderung** (alle Style-Konstanten byte-identisch, alle `data-turntable-*` erhalten, Knob dekorativ via `speedKnobAngle`); `SongInfo` zieht das Deck als `turntableStage`-Node (Hub unter Provider, statisch ohne); `TurntablePlayer.test.tsx` grün. Commit.
- [x] Einheit 4: Knob interaktiv (Frage A = Drag/`role="slider"`, kein Klick/`cycleSpeed`; Tap=No-op; Pfeil/Home/End-Keyboard mit `stopPropagation` gegen den globalen Audio-Router; `KnobDial` shared mit dem dekorativen Knob), Speed 33/45 reales Tempo (1800↔1333 ms, kein `playbackRate`), gespiegelte Steuerung (Knob ↔ Playbutton ↔ Leertaste ↔ Media-Key; `speedForEngineStatus` behält gewählte 45-Geschwindigkeit), LED dimmt bei Standby (opacity-only), kein Rotor-Stutter beim Speed-Wechsel (`preserveRotorRotationAndCancel`, `speed` in `useEffect`-Dep); Regression 320 Tests grün + Cross-Browser-Checkliste. Commit `bce8f84f`.
- [x] Einheit 5: Knob per vertikalem Ziehen bedient, rastet an STANDBY/33/45 ein (Distanz statt Winkel — absoluter Winkel sprang auf dem kleinen Knob wild, User-Bugreport; ON = nur Power-Anzeige, Frage F); monotone Indikator-Winkel 150/210/240 (kein 300°-Spin); `body`-`user-select`-Sperre gegen Text-Selektion ohne `preventDefault` (das brach sonst die Geste für `AudioContext.resume` und liess Knob-Start stumm); "33"/"45" leuchten weiss bei Auswahl, "ON" orange bei power on; `speedAtOffset`-Helfer; Tests + Gates grün (322 Tests). Commit.
- [x] EIN gemeinsamer Player für C + CC erhalten (kein Sonderpfad, [[project_player_c_cc_divergence]]).
- [x] `VfdWaveFormDisplay` NICHT umgesetzt (Frage D: außerhalb Scope, bestätigt).
- [x] Hub-fremde `VinylRecord`-Nutzungen (HeroSubmitSlot, SlideArtwork) unverändert.
- [x] Pro Einheit: `biome check --write` → `tsc --noEmit`/`astro check` → `pnpm run doctor:diff` (Einheit 4 zusätzlich voller `pnpm run doctor`) → `pnpm --filter @musiccloud/frontend test:run`, alle grün.
- [x] TSDoc auf jedem neuen Export; Kommentare/Docs bei jeder Änderung mitgezogen ([[feedback_keep_code_docs_current]]).
- [ ] Abschluss-Verschiebung nach `done/` nur nach expliziter User-Abnahme ([[feedback_plan_hygiene]]).
