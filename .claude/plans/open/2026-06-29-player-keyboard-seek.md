# Player Keyboard-Seek mit VFD-Hinweis

Plan-Nr.: MC-067

> **Für agentische Worker:** Diese Schritte nutzen Checkbox-Syntax (`- [ ]`) zum Abhaken. Zum Ausführen `superpowers:executing-plans` bzw. `superpowers:subagent-driven-development` verwenden. Jeder Code-Block im Plan ist bereits Biome-konform formatiert (2-Space-Indent, doppelte Anführungszeichen) — vor dem Commit trotzdem `biome check --write` laufen lassen.

**Goal:** Pfeiltasten steuern den laufenden/pausierten Song (±10 s, Anfang, 3 s vor Ende), und ±10-s-Sprünge zeigen im VFD-Statusdisplay einen Hinweis, der hinter dem stehenden Status-Text hervorkommt und seitlich herausscrollt.

**Architecture:** Vier Teile. (A) Globaler Tastatur-Router im `AudioPreviewPlayer` analog zum bestehenden Leertasten-Router setzt `audio.currentTime`. (B) Die generische VFD-Canvas-Engine bekommt ein transientes „Scroll-out-Overlay" — ein Text, der hinter dem Zeilen-Content gezeichnet wird (Zeichenreihenfolge = Tiefe) und über eine Zeitachse seitlich herausscrollt, gebaut auf dem vorhandenen Marquee-Spalten-Scrolling. (C) `MediaCardHead` hält den transienten `seekHint`-State (niedrigster gemeinsamer Vorfahr von Player und VFD) und verdrahtet beide. (D) `ShareLayout` zeigt im Pause-Zustand einen neuen Status-Text, hinter dem der Hinweis konsistent hervorkommt.

**Tech Stack:** React 19, TypeScript, Canvas 2D (Dot-Matrix-Emulation), gsap.ticker (geteilte Frame-Loop), vitest, Biome, React-Doctor (custom domain-literals-Plugin).

---

## Kontext (Preface)

Das Feature lebt im Audio-Player-Stack der Share-Page (und gilt damit überall, wo `MediaCardHead` einen Player + `SongInfo`-VFD rendert). Das VFD ist ein Canvas-gerendertes Dot-Matrix-Display: alle Bewegung passiert spaltenweise im Canvas (`drawVfdCanvas`), kein CSS-Transform berührt die Pixel. Die Statuszeile ist die 4. VFD-Zeile (`SongInfo.tsx:263-268`), zentriert, mit Marquee ab 28 Zeichen. Seek existierte bisher nicht — `audio.currentTime` wurde nur gelesen.

Alle Produkt-Entscheidungen wurden im Brainstorming geklärt (siehe Spec). Das Tempo (2,9 s) hat der Nutzer interaktiv festgelegt.

## Spec (Entscheidungen)

| Aspekt | Entscheidung |
|---|---|
| Medien | Previews (30 s) **und** volle Songs (CC/Jamendo) |
| Zustand | Wiedergabe **und** Pause (`Playing`/`Paused`), nicht Idle/Loading/Error |
| `←` / `→` | `currentTime ∓ 10 s`, begrenzt auf `0 … duration` |
| `cmd+←` / `cmd+→` | `0` bzw. `duration − 3 s` — **still**, kein VFD-Hinweis |
| VFD-Hinweis (nur ±10 s) | `<< 10s` (links) / `10s >>` (rechts), kommt hinter dem Status-Text hervor, scrollt seitlich raus, **2900 ms**, jeder Tastendruck startet neu |
| Mehrfach-Sprung | Jeder Druck triggert den Hinweis neu (kein Aufsummieren) |
| Pausiert-Status (neu) | `♫ SONG PAUSIERT` / `♫ VORSCHAU PAUSIERT` (DE), `♫ SONG PAUSED` / `♫ PREVIEW PAUSED` (EN) |
| Schutz | Greift nicht, wenn Fokus in `input`/`textarea`/`select`/`button`/`a`/contentEditable liegt |
| Konflikte | Keine — Leertaste (Play/Pause), `D` (Analyzer), `P` (View-Toggle) bleiben unberührt |

## Design

### Trigger-Fluss (Teil C)

```
[Tastendruck ← →]
  → globaler keydown-Handler (AudioPreviewPlayer, tab-weite Registry)
  → aktiver Player: audio.currentTime setzen
  → onSeekHint(direction)               (nur ±10 s, nicht cmd+Pfeil)
  → MediaCardHead: dispatch SeekHint     (nonce++)
  → SongInfo: scrollOutOverlay auf VFD-Zeile[3]
  → VfdDisplay: syncRenderStateLines armt Overlay → gsap.ticker-Loop animiert
```

`seekHint` wird **nicht** bis `ShareLayout` gehoben: Erzeuger (Player) und Anzeiger (VFD/`SongInfo`) sind beide direkte Kinder von `MediaCardHead`, also gehört der State dorthin. Nur der Pausiert-Status (Teil D) lebt in `ShareLayout`, weil er `previewStatus` braucht und über `content.statusLine` fließt.

### VFD-Overlay-Render (Teil B)

Die Engine bleibt generisch (keine Seek-Semantik). Eine VFD-Zeile bekommt optional ein `scrollOutOverlay`. Im Render einer Zeile mit aktivem Overlay:

1. `foregroundColumns` = normaler Zeilen-Content (volle Breite, Status-Text zentriert mit Blank-Padding).
2. Text-Span im Vordergrund finden: erste/letzte Spalte mit `mask !== 0` → `[textFirst, textLast]`.
3. `overlayColumns` = Overlay-Text als Pixel-Spalten an der zeitabhängigen Start-Spalte (zentriert → seitlich raus).
4. Merge pro Spalte `i`: Vordergrund-Pixel gewinnen; innerhalb `[textFirst, textLast]` ohne Vordergrund-Pixel bleibt blank (Status-Text verdeckt das Overlay solide, kein Durchscheinen zwischen Buchstaben); außerhalb → Overlay sichtbar.

Damit bleibt der Status-Text stehen und das Overlay kommt nur links/rechts daneben hervor und scrollt heraus.

**Offset-Mathematik** (Start-Spalte über `progress ∈ [0,1]`, `direction = Left|Right`):
- `centerStart = round((rowCols − overlayCols) / 2)`
- `Left`:  `start = centerStart − ease(progress) · (centerStart + overlayCols)`  → nach links raus
- `Right`: `start = centerStart + ease(progress) · (rowCols − centerStart)`      → nach rechts raus
- `ease` = easeOutCubic: `1 − (1 − p)³` (matcht das im Mockup bestätigte ease-out-Gefühl).

`progress = clamp((now − startedAt) / durationMs, 0, 1)`. Bei `progress ≥ 1` Overlay löschen. Solange aktiv: `drawVfdCanvas` meldet `hasActiveAnimation = true`, hält die geteilte Loop am Laufen — exakt wie Marquee/Transition.

### File Structure

**Neu:**
- `apps/frontend/src/components/ui/vfdDisplayOverlay.ts` — reine Overlay-Helfer: `armScrollOutOverlay`, `scrollOutStartColumn`, `mergeOverlayColumns`, `easeOutCubic`. Analog zu `vfdDisplayMarquee.ts`. Eine Verantwortung: Overlay-Geometrie/-State.

**Geändert:**
- `apps/frontend/src/components/ui/VfdDisplayTypes.ts` — `VfdScrollOutDirection`, `VfdScrollOutOverlay`, Feld an `VfdDisplayLine`/`NormalizedVfdLine`, `overlays`-Map + `VfdOverlayRuntimeState` an `VfdCanvasRenderState`.
- `apps/frontend/src/components/ui/vfdDisplayNormalize.ts` — `scrollOutOverlay` durch `normalizeLine` reichen.
- `apps/frontend/src/components/ui/VfdDisplay.tsx` — `renderStateRef` initial `overlays`, `syncRenderStateLines` armt Overlays.
- `apps/frontend/src/components/ui/vfdDisplayCanvas.ts` — Overlay-Render in `drawVfdCanvas`.
- `apps/frontend/src/components/audio/AudioPreviewPlayer.tsx` — `onSeekHint`-Prop, Handle + Registry erweitern, Pfeiltasten-Handler, Seek-Funktionen, `notifySeekHint`.
- `apps/frontend/src/components/cards/MediaCardHead.tsx` — `seekHint`-State, an Player/`SongInfo` verdrahten.
- `apps/frontend/src/components/cards/SongInfo.tsx` — `seekHint`-Prop → `scrollOutOverlay` auf Zeile[3].
- `apps/frontend/src/components/share/ShareLayout.tsx` — `vfdStatusLine` um Pause-Fall erweitern.
- `apps/frontend/src/i18n/translations/de.json`, `.../en.json` — `audio.statusPausedSong`, `audio.statusPaused`.

### Konstanten (named, keine Magic Numbers)

| Name | Wert | Ort |
|---|---|---|
| `SEEK_STEP_SECONDS` | `10` | `AudioPreviewPlayer.tsx` |
| `SEEK_END_GUARD_SECONDS` | `3` | `AudioPreviewPlayer.tsx` |
| `VFD_SEEK_HINT_DURATION_MS` | `2900` | `SongInfo.tsx` |
| `SEEK_HINT_TEXT` | `{ Left: "<< 10s", Right: "10s >>" }` | `SongInfo.tsx` |

---

## Tasks

> **Ausführungsreihenfolge (Abhängigkeiten):** `B1 → A1 → A2 → B2 → B3 → C1 → C2 → D1 → D2 → E1`. Die Typen aus **B1** (`VfdScrollOutDirection`, `VfdScrollOutOverlay`) sind Voraussetzung für A2/C1/C2 — daher B1 zuerst ziehen, obwohl es im A/B/C/D-Schema (A=Audio, B=VFD-Engine, C=Verdrahtung, D=Pause) später gruppiert ist.

### Task A1: Seek-Ziel-Berechnung (reine Funktion, TDD)

**Files:**
- Modify: `apps/frontend/src/components/audio/AudioPreviewPlayer.tsx` (Helfer auf Modulebene, vor der Komponente)
- Test: `apps/frontend/src/components/audio/AudioPreviewPlayer.seek.test.ts` (neu)

- [ ] **Step 1: Failing test schreiben**

```ts
import { describe, expect, it } from "vitest";
import { resolveSeekTarget } from "@/components/audio/AudioPreviewPlayer";

describe("resolveSeekTarget", () => {
  it("adds the delta within bounds", () => {
    expect(resolveSeekTarget(10, 10, 30)).toBe(20);
    expect(resolveSeekTarget(10, -10, 30)).toBe(0);
  });
  it("clamps to zero at the start", () => {
    expect(resolveSeekTarget(3, -10, 30)).toBe(0);
  });
  it("clamps to the real end when stepping forward", () => {
    expect(resolveSeekTarget(28, 10, 30)).toBe(30);
  });
});
```

- [ ] **Step 2: Test rot verifizieren** — `pnpm --filter @musiccloud/frontend exec vitest run src/components/audio/AudioPreviewPlayer.seek.test.ts` → FAIL (`resolveSeekTarget is not exported`).

- [ ] **Step 3: Funktion + Konstanten implementieren** (Modulebene, exportiert):

```ts
/** Seconds one arrow-key step skips. */
export const SEEK_STEP_SECONDS = 10;
/** Guard kept before the real end for the "jump near end" shortcut. */
export const SEEK_END_GUARD_SECONDS = 3;

/**
 * Resolves the clamped target time for a relative seek.
 *
 * @param currentTime - The player's current position in seconds.
 * @param deltaSeconds - Signed offset to apply (e.g. +10 / -10).
 * @param duration - Track duration in seconds.
 * @returns The new time, clamped to `0 … duration`.
 */
export function resolveSeekTarget(currentTime: number, deltaSeconds: number, duration: number): number {
  return Math.max(0, Math.min(duration, currentTime + deltaSeconds));
}
```

- [ ] **Step 4: Test grün verifizieren** — gleicher vitest-Run → PASS.

- [ ] **Step 5: Commit** — `Feat: add clamped seek-target helper (MC-067)`

### Task A2: Seek-Aktionen + Tastatur-Router im Player

**Files:**
- Modify: `apps/frontend/src/components/audio/AudioPreviewPlayer.tsx`

Erweitert die bestehende Leertasten-Registry (`AudioPreviewPlayer.tsx:242-306`) um Seek, statt einer zweiten Registry (DRY: ein Set, ein `resolveTarget`, ein refcount-Listener).

- [ ] **Step 1: Handle-Interface + Prop erweitern**

`AudioPreviewSpacebarHandle` (Zeile 242-247) → umbenennen zu `AudioPreviewKeyboardHandle` und ergänzen:

```ts
interface AudioPreviewKeyboardHandle {
  /** Forwards to the player's `togglePlay`. Stable across renders. */
  togglePlay: () => void;
  /** True while the player is in `Playing` or `Paused` phase, false otherwise. */
  isActive: () => boolean;
  /** Relative seek by signed seconds (arrow keys). No-op unless active. */
  seekBy: (deltaSeconds: number) => void;
  /** Jump to the track start (cmd+Left). No-op unless active. */
  seekToStart: () => void;
  /** Jump to `SEEK_END_GUARD_SECONDS` before the end (cmd+Right). No-op unless active. */
  seekToNearEnd: () => void;
}
```

Prop ergänzen in `AudioPreviewPlayerProps` (nach Zeile 35):

```ts
  /** Fires after a ±step arrow seek so the host can flash a VFD hint. Not fired for cmd jumps. */
  onSeekHint?: (direction: VfdScrollOutDirection) => void;
```

Import oben ergänzen: `import { VfdScrollOutDirection } from "@/components/ui/VfdDisplay";` (Re-Export aus Task B1 sicherstellen).

- [ ] **Step 2: Arrow-Target-Schutz + Handler (Modulebene, neben dem Spacebar-Handler)**

`shouldIgnoreSpacebarTarget` (Zeile 258-268) wird wiederverwendet. Neuer Handler:

```ts
function handleAudioPreviewArrows(event: KeyboardEvent): void {
  if (event.repeat) return;
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  if (event.altKey || event.ctrlKey || event.shiftKey) return;
  if (shouldIgnoreSpacebarTarget(event)) return;
  const target = resolveSpacebarTarget();
  if (!target || !target.isActive()) return;
  event.preventDefault();
  const isLeft = event.key === "ArrowLeft";
  if (event.metaKey) {
    if (isLeft) target.seekToStart();
    else target.seekToNearEnd();
    return;
  }
  target.seekBy(isLeft ? -SEEK_STEP_SECONDS : SEEK_STEP_SECONDS);
}
```

- [ ] **Step 3: Registry-Registrierung erweitern**

`audioPreviewRegistry` Typ → `Set<AudioPreviewKeyboardHandle>`. `registerAudioPreviewForSpacebar` → `registerAudioPreviewForKeyboard`, registriert beide Handler über denselben refcount:

```ts
function registerAudioPreviewForKeyboard(handle: AudioPreviewKeyboardHandle): () => void {
  audioPreviewRegistry.add(handle);
  if (audioPreviewListenerRefCount === 0) {
    window.addEventListener("keydown", handleAudioPreviewSpacebar);
    window.addEventListener("keydown", handleAudioPreviewArrows);
  }
  audioPreviewListenerRefCount += 1;
  return () => {
    audioPreviewRegistry.delete(handle);
    audioPreviewListenerRefCount -= 1;
    if (audioPreviewListenerRefCount === 0) {
      window.removeEventListener("keydown", handleAudioPreviewSpacebar);
      window.removeEventListener("keydown", handleAudioPreviewArrows);
    }
  };
}
```

- [ ] **Step 4: Seek-Funktionen im Hook (nach `togglePlay`, ~Zeile 1095)**

`onSeekHint` aus den destrukturierten Props lesen (Zeile 421-428 ergänzen). Dann:

```ts
const notifySeekHint = useCallback(
  (direction: VfdScrollOutDirection) => {
    onSeekHint?.(direction);
  },
  [onSeekHint],
);

const seekBy = useCallback(
  (deltaSeconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (state.phase !== PlayerPhase.Playing && state.phase !== PlayerPhase.Paused) return;
    const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 30;
    audio.currentTime = resolveSeekTarget(audio.currentTime, deltaSeconds, dur);
    setProgressRatio(resolveAudioProgressRatio(audio));
    notifySeekHint(deltaSeconds < 0 ? VfdScrollOutDirection.Left : VfdScrollOutDirection.Right);
  },
  [state.phase, notifySeekHint],
);

const seekToStart = useCallback(() => {
  const audio = audioRef.current;
  if (!audio) return;
  if (state.phase !== PlayerPhase.Playing && state.phase !== PlayerPhase.Paused) return;
  audio.currentTime = 0;
  setProgressRatio(resolveAudioProgressRatio(audio));
}, [state.phase]);

const seekToNearEnd = useCallback(() => {
  const audio = audioRef.current;
  if (!audio) return;
  if (state.phase !== PlayerPhase.Playing && state.phase !== PlayerPhase.Paused) return;
  const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 30;
  audio.currentTime = Math.max(0, dur - SEEK_END_GUARD_SECONDS);
  setProgressRatio(resolveAudioProgressRatio(audio));
}, [state.phase]);
```

`useEffectEvent`-Wrapper analog zu `togglePlayFromEvent` (Zeile 1096) für die drei Funktionen anlegen, damit das Handle stabil bleibt:

```ts
const seekByFromEvent = useEffectEvent(seekBy);
const seekToStartFromEvent = useEffectEvent(seekToStart);
const seekToNearEndFromEvent = useEffectEvent(seekToNearEnd);
```

- [ ] **Step 5: Registrierung aktualisieren** (Zeile 1160-1165):

```ts
useEffect(() => {
  return registerAudioPreviewForKeyboard({
    togglePlay: () => togglePlayFromEvent(),
    isActive: () => isPlayerActiveRef.current,
    seekBy: (delta) => seekByFromEvent(delta),
    seekToStart: () => seekToStartFromEvent(),
    seekToNearEnd: () => seekToNearEndFromEvent(),
  });
}, []);
```

- [ ] **Step 6: Gates** — `pnpm --filter @musiccloud/frontend exec tsc --noEmit` (oder Repo-Typecheck-Script) grün; `biome check --write apps/frontend/src/components/audio/AudioPreviewPlayer.tsx`.

- [ ] **Step 7: Commit** — `Feat: add keyboard seek router to audio preview player (MC-067)`

### Task B1: VFD-Overlay-Typen

**Files:**
- Modify: `apps/frontend/src/components/ui/VfdDisplayTypes.ts`
- Modify: `apps/frontend/src/components/ui/VfdDisplay.tsx` (Re-Export)

- [x] **Step 1: Typen ergänzen** (bei den anderen `as const`-Namespaces, ~Zeile 60):

```ts
/** Direction a transient scroll-out overlay leaves the row. */
export const VfdScrollOutDirection = {
  Left: "left",
  Right: "right",
} as const;
export type VfdScrollOutDirection = (typeof VfdScrollOutDirection)[keyof typeof VfdScrollOutDirection];

/**
 * Transient one-shot overlay drawn BEHIND a row's content and scrolled out
 * sideways. The row content stays put and visually occludes the overlay where
 * they overlap, so the overlay appears to emerge from behind the standing text.
 */
export interface VfdScrollOutOverlay {
  /** Glyph text scrolled out (e.g. a seek hint). */
  text: string;
  /** Side the overlay exits toward. */
  direction: VfdScrollOutDirection;
  /** Animation length in milliseconds. */
  durationMs: number;
  /** Monotonic trigger id. A changed nonce re-arms the animation from the start. */
  nonce: number;
}

/** Per-row scroll-out overlay state in flight on the canvas. */
export interface VfdOverlayRuntimeState {
  text: string;
  direction: VfdScrollOutDirection;
  startedAt: number;
  durationMs: number;
  nonce: number;
}
```

- [x] **Step 2: Felder an Line + RenderState**

In `VfdDisplayLine` (nach Zeile 163, `transition`):

```ts
  /** Transient one-shot overlay scrolled out from behind this row's content. */
  scrollOutOverlay?: VfdScrollOutOverlay;
```

In `NormalizedVfdLine` (nach `transition`, Zeile 298):

```ts
  scrollOutOverlay?: VfdScrollOutOverlay;
```

In `VfdCanvasRenderState` (nach `marqueeStates`, Zeile 337):

```ts
  overlays: Map<number, VfdOverlayRuntimeState>;
```

- [x] **Step 3: Re-Export** in `VfdDisplay.tsx` (Export-Blöcke Zeile 78-96): `VfdScrollOutDirection` zu den `export {}`-Werten und `VfdScrollOutOverlay` zu den `export type {}`-Typen hinzufügen.

- [x] **Step 4: Gate** — Typecheck grün; `biome check --write` auf beide Dateien.

- [x] **Step 5: Commit** — `Feat: add VFD scroll-out overlay types (MC-067)`

### Task B2: Overlay-Geometrie (reine Funktionen, TDD)

**Files:**
- Create: `apps/frontend/src/components/ui/vfdDisplayOverlay.ts`
- Test: `apps/frontend/src/components/ui/vfdDisplayOverlay.test.ts`

- [x] **Step 1: Failing test**

```ts
import { describe, expect, it } from "vitest";
import { VfdScrollOutDirection } from "@/components/ui/VfdDisplayTypes";
import { easeOutCubic, scrollOutStartColumn } from "@/components/ui/vfdDisplayOverlay";

describe("easeOutCubic", () => {
  it("maps 0→0 and 1→1", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
  });
});

describe("scrollOutStartColumn", () => {
  const rowCols = 100;
  const overlayCols = 20;
  it("starts centered at progress 0", () => {
    expect(scrollOutStartColumn(VfdScrollOutDirection.Left, 0, rowCols, overlayCols)).toBe(40);
    expect(scrollOutStartColumn(VfdScrollOutDirection.Right, 0, rowCols, overlayCols)).toBe(40);
  });
  it("exits left past column 0 at progress 1", () => {
    expect(scrollOutStartColumn(VfdScrollOutDirection.Left, 1, rowCols, overlayCols)).toBe(-20);
  });
  it("exits right past the row width at progress 1", () => {
    expect(scrollOutStartColumn(VfdScrollOutDirection.Right, 1, rowCols, overlayCols)).toBe(100);
  });
});
```

- [x] **Step 2: Test rot** — `pnpm --filter @musiccloud/frontend exec vitest run src/components/ui/vfdDisplayOverlay.test.ts` → FAIL.

- [x] **Step 3: Implementieren**

```ts
import {
  type VfdCanvasPixelColumn,
  type VfdCanvasRenderState,
  type VfdDisplayLine,
  type VfdOverlayRuntimeState,
  VfdScrollOutDirection,
} from "@/components/ui/VfdDisplayTypes";

/** Cubic ease-out: fast start, gentle settle. */
export function easeOutCubic(progress: number): number {
  const clamped = Math.max(0, Math.min(1, progress));
  return 1 - (1 - clamped) ** 3;
}

/**
 * Start column of the overlay's pixel buffer for the current progress.
 * At progress 0 the overlay sits centered (hidden behind the row content);
 * at progress 1 it has fully left the row toward `direction`.
 */
export function scrollOutStartColumn(
  direction: VfdScrollOutDirection,
  progress: number,
  rowColumns: number,
  overlayColumns: number,
): number {
  const centerStart = Math.round((rowColumns - overlayColumns) / 2);
  const eased = easeOutCubic(progress);
  if (direction === VfdScrollOutDirection.Left) {
    return Math.round(centerStart - eased * (centerStart + overlayColumns));
  }
  return Math.round(centerStart + eased * (rowColumns - centerStart));
}
```

- [x] **Step 4: Test grün** — vitest-Run → PASS.

- [x] **Step 5: Overlay-Arming + Merge ergänzen** (gleiche Datei, kein neuer Test — wird in Task B4 visuell verifiziert):

```ts
/**
 * Arms or re-arms the per-row overlay when a line carries a scroll-out overlay
 * with a nonce differing from the running one. Mirrors the transition-arming in
 * `syncRenderStateLines`. Removes the entry when the line drops its overlay.
 */
export function syncOverlayState(
  state: VfdCanvasRenderState,
  line: Pick<VfdDisplayLine, "scrollOutOverlay">,
  rowIndex: number,
  now: number,
): void {
  const overlay = line.scrollOutOverlay;
  if (!overlay) {
    state.overlays.delete(rowIndex);
    return;
  }
  const running = state.overlays.get(rowIndex);
  if (running && running.nonce === overlay.nonce) return;
  state.overlays.set(rowIndex, {
    text: overlay.text,
    direction: overlay.direction,
    durationMs: overlay.durationMs,
    nonce: overlay.nonce,
    startedAt: now,
  });
}

/**
 * Merges overlay columns behind foreground columns. Foreground (lit) pixels win.
 * Inside the foreground's lit span the gaps stay blank so the standing text
 * occludes the overlay solidly; outside that span the overlay shows through.
 */
export function mergeOverlayColumns(
  foreground: VfdCanvasPixelColumn[],
  overlay: VfdCanvasPixelColumn[],
  textFirst: number,
  textLast: number,
): VfdCanvasPixelColumn[] {
  return foreground.map((fg, index) => {
    if (fg.mask !== 0) return fg;
    if (index >= textFirst && index <= textLast) return fg;
    return overlay[index] ?? fg;
  });
}

/** Progress of a running overlay, clamped to [0,1]. */
export function overlayProgress(overlay: VfdOverlayRuntimeState, now: number): number {
  return Math.max(0, Math.min(1, (now - overlay.startedAt) / overlay.durationMs));
}
```

- [x] **Step 6: Gate** — Typecheck grün; `biome check --write`.

- [x] **Step 7: Commit** — `Feat: add VFD scroll-out overlay geometry helpers (MC-067)`

### Task B3: Overlay in die Render-Pipeline

**Files:**
- Modify: `apps/frontend/src/components/ui/vfdDisplayNormalize.ts`
- Modify: `apps/frontend/src/components/ui/VfdDisplay.tsx`
- Modify: `apps/frontend/src/components/ui/vfdDisplayCanvas.ts`

- [ ] **Step 1: `normalizeLine` durchreichen** — In `vfdDisplayNormalize.ts` im zurückgegebenen `NormalizedVfdLine` `scrollOutOverlay: line?.scrollOutOverlay` ergänzen (Feld aus der rohen Line übernehmen; bei undefined bleibt es undefined).

- [ ] **Step 2: `renderStateRef` initial** — In `VfdDisplay.tsx` (Zeile 154-161) `overlays: new Map(),` zum Initial-State ergänzen.

- [ ] **Step 3: Overlay-Arming in `syncRenderStateLines`** — In `VfdDisplay.tsx` (Funktion Zeile 43-71) am Ende der `normalizedLines.forEach`-Schleife `syncOverlayState(state, line, index, now)` aufrufen. Import: `import { syncOverlayState } from "@/components/ui/vfdDisplayOverlay";`. (Beide Pfade — React-`lines`-Effekt und imperativer `setLines` — laufen durch `syncRenderStateLines`, also wird das Overlay aus beiden Quellen korrekt geschärft.)

- [ ] **Step 4: Overlay-Render in `drawVfdCanvas`** — In `vfdDisplayCanvas.ts` im Nicht-Transition-Zweig (Zeile 398-402) das Overlay einweben:

```ts
} else {
  const current = lineCanvasColumns(line, state.cellCount, rowIndex, state, now);
  hasActiveMarquee = hasActiveMarquee || current.hasActiveMarquee;
  const overlay = state.overlays.get(rowIndex);
  if (overlay && !state.prefersReducedMotion) {
    const progress = overlayProgress(overlay, now);
    const overlaySource = contentCanvasPixelColumns(overlay.text, VfdBrightness.Bright);
    const start = scrollOutStartColumn(overlay.direction, progress, current.columns.length, overlaySource.length);
    const overlayColumns = Array.from({ length: current.columns.length }, (_, index) => {
      const source = overlaySource[index - start];
      return source ?? blankCanvasColumn(VfdBrightness.Bright);
    });
    const litColumns = current.columns
      .map((column, index) => (column.mask !== 0 ? index : -1))
      .filter((index) => index >= 0);
    const textFirst = litColumns.length > 0 ? litColumns[0] : 0;
    const textLast = litColumns.length > 0 ? litColumns[litColumns.length - 1] : -1;
    const merged = mergeOverlayColumns(current.columns, overlayColumns, textFirst, textLast);
    drawCanvasPixelColumns(ctx, merged, rowTop, 0, colors);
    if (progress >= 1) state.overlays.delete(rowIndex);
  } else {
    if (overlay) state.overlays.delete(rowIndex);
    drawCanvasPixelColumns(ctx, current.columns, rowTop, 0, colors);
  }
}
```

Imports oben in `vfdDisplayCanvas.ts` ergänzen: `mergeOverlayColumns`, `overlayProgress`, `scrollOutStartColumn` aus `vfdDisplayOverlay`.

- [ ] **Step 5: `hasActiveAnimation`-Rückgabe** — Return von `drawVfdCanvas` (Zeile 407) erweitern, damit ein laufendes Overlay die Loop am Leben hält:

```ts
return state.transitions.size > 0 || state.overlays.size > 0 || hasActiveMarquee;
```

- [ ] **Step 6: Gate** — Typecheck grün; `biome check --write` auf die drei Dateien.

- [ ] **Step 7: Commit** — `Feat: render VFD scroll-out overlay on the canvas (MC-067)`

### Task C1: seekHint-State in MediaCardHead

**Files:**
- Modify: `apps/frontend/src/components/cards/MediaCardHead.tsx`

- [ ] **Step 1: State + Handler** — In `MediaCardHead` (Funktionskörper ab Zeile 78):

```ts
const [seekHint, setSeekHint] = useState<{ direction: VfdScrollOutDirection; nonce: number } | null>(null);
const handleSeekHint = useCallback((direction: VfdScrollOutDirection) => {
  setSeekHint((previous) => ({ direction, nonce: (previous?.nonce ?? 0) + 1 }));
}, []);
```

Imports ergänzen: `import { useCallback, useState } from "react";` (vorhandenen React-Import erweitern) und `import { VfdScrollOutDirection } from "@/components/ui/VfdDisplay";`.

- [ ] **Step 2: An Player + SongInfo verdrahten**

`AudioPreviewPlayer` (Zeile 116-124) `onSeekHint={handleSeekHint}` ergänzen. `SongInfo` (Zeile 94-109) `seekHint={seekHint}` ergänzen.

- [ ] **Step 3: Gate** — Typecheck grün; `biome check --write`.

- [ ] **Step 4: Commit** — `Feat: hold seek-hint state in media card head (MC-067)`

### Task C2: seekHint → VFD-Overlay in SongInfo

**Files:**
- Modify: `apps/frontend/src/components/cards/SongInfo.tsx`

- [ ] **Step 1: Prop + Konstanten**

`SongInfoProps` (nach Zeile 44) ergänzen:

```ts
  /** Transient seek-hint trigger forwarded to the status row overlay. */
  seekHint?: { direction: VfdScrollOutDirection; nonce: number } | null;
```

Konstanten auf Modulebene (vor der Komponente):

```ts
/** Seek-hint overlay length, set by product (interactive tuning). */
const VFD_SEEK_HINT_DURATION_MS = 2900;
/** Glyph text per scroll-out direction. */
const SEEK_HINT_TEXT = {
  [VfdScrollOutDirection.Left]: "<< 10s",
  [VfdScrollOutDirection.Right]: "10s >>",
} as const;
```

Imports ergänzen: `VfdScrollOutDirection` und `type VfdScrollOutOverlay` aus `@/components/ui/VfdDisplay`; `seekHint` in die Props-Destrukturierung (Zeile 64-80) aufnehmen.

- [ ] **Step 2: Overlay aus seekHint bauen**

Vor dem `return` (nach Zeile 84):

```ts
const statusOverlay: VfdScrollOutOverlay | undefined = seekHint
  ? {
      text: SEEK_HINT_TEXT[seekHint.direction],
      direction: seekHint.direction,
      durationMs: VFD_SEEK_HINT_DURATION_MS,
      nonce: seekHint.nonce,
    }
  : undefined;
```

- [ ] **Step 3: Auf die Statuszeile setzen** — In der `lines`-Liste die 4. Zeile (Zeile 263-268) um `scrollOutOverlay: statusOverlay,` ergänzen.

- [ ] **Step 4: Gate** — Typecheck grün; `biome check --write`.

- [ ] **Step 5: Visuelle Verifikation (agent-browser, lokal)** — Dev-Server via `./app status` prüfen/`./app start`. Auf einer Share-Page einen Song abspielen, Fokus aus Eingabefeldern nehmen, `←`/`→` drücken. Erwartet: `<< 10s` bzw. `10s >>` kommt hinter `♫ SONG PLAYING` hervor und scrollt in 2,9 s seitlich raus; `SONG PLAYING` bleibt stehen; `cmd+←`/`cmd+→` springen ohne Hinweis. Playback gemäß Vorgabe nicht unbeaufsichtigt laufen lassen (muted/sofort pausieren oder nur Status prüfen). Screenshot als Beleg.

- [ ] **Step 6: Commit** — `Feat: flash seek hint in the status VFD row (MC-067)`

### Task D1: Pausiert-Status-Text (i18n)

**Files:**
- Modify: `apps/frontend/src/i18n/translations/de.json`
- Modify: `apps/frontend/src/i18n/translations/en.json`

- [ ] **Step 1: Keys ergänzen** — Direkt nach `audio.statusPlayingSong` (de.json:~456 / en.json:119):

de.json:
```json
  "audio.statusPausedSong": "♫ SONG PAUSIERT",
  "audio.statusPaused": "♫ VORSCHAU PAUSIERT",
```
en.json:
```json
  "audio.statusPausedSong": "♫ SONG PAUSED",
  "audio.statusPaused": "♫ PREVIEW PAUSED",
```

- [ ] **Step 2: Commit** — `Feat: add paused status strings (MC-067)`

### Task D2: Pausiert-Status in ShareLayout

**Files:**
- Modify: `apps/frontend/src/components/share/ShareLayout.tsx`

- [ ] **Step 1: `vfdStatusLine` erweitern** — Den `pausedStatus` analog zu `playingStatus` (Zeile 433-434) ableiten und den Pause-Fall vor `artistReadyVisible` in die Prioritätskette (Zeile 435-447) einhängen:

```ts
const playingStatus =
  config.mediaKind === MediaKindValue.Song ? t("audio.statusPlayingSong") : t("audio.statusPlaying");
const pausedStatus =
  config.mediaKind === MediaKindValue.Song ? t("audio.statusPausedSong") : t("audio.statusPaused");
const vfdStatusLine = artistStatusLoading
  ? t("artist.statusLoading")
  : resolveErrorVisible
    ? t("artist.statusResolveError")
    : artistLoadStatus === ArtistLoadStatus.Error
      ? t("artist.statusError", { code: artistErrorCode ?? "ERR" })
      : artistLoadStatus === ArtistLoadStatus.Empty
        ? t("artist.statusEmpty")
        : previewStatus === AudioPreviewStatus.Playing
          ? playingStatus
          : previewStatus === AudioPreviewStatus.Paused
            ? pausedStatus
            : artistReadyVisible
              ? t("artist.statusReady")
              : "";
```

- [ ] **Step 2: Gate** — Typecheck grün; `biome check --write`.

- [ ] **Step 3: Visuelle Verifikation** — Song abspielen, pausieren: Statuszeile zeigt `♫ SONG PAUSIERT` (DE) / `♫ SONG PAUSED` (EN). Im pausierten Song `←`/`→` drücken: Hinweis kommt hinter dem Pausiert-Text hervor. Screenshot.

- [ ] **Step 4: Commit** — `Feat: show paused status in the share VFD (MC-067)`

### Task E1: Regression + Doctor + Suite

- [ ] **Step 1: Doctor** — `pnpm run doctor:diff` (bzw. `pnpm doctor:staged` vor Commit). Erwartet: keine neuen Findings, insbesondere keine `domain-literals/*`-Verstöße (Richtungen sind PascalCase-Namespaces, Keyboard-`key`-Vergleiche sind wie der Bestandscode keine Domain-Literale).

- [ ] **Step 2: Volle Gates** — `tsc --noEmit` grün, `pnpm lint` grün, `pnpm test:run` grün (inkl. `AudioPreviewPlayer.seek.test.ts`, `vfdDisplayOverlay.test.ts`, bestehende `SongInfo.test.tsx`).

- [ ] **Step 3: Cross-Browser-Spot-Check** — Animation in Chromium + Firefox (Memory: Firefox-Render-Eigenheiten). Erwartet: identisches Scroll-out, kein Flackern.

- [ ] **Step 4: Abschluss-Commit, falls Reständerungen** — `Chore: finalize MC-067 keyboard seek`

---

## Checkliste (auswertbar)

- [ ] A1 `resolveSeekTarget` + Test grün
- [ ] A2 Tastatur-Router + Seek-Aktionen + Registry erweitert
- [x] B1 Overlay-Typen + Re-Export
- [x] B2 Overlay-Geometrie + Test grün
- [ ] B3 Overlay in Normalize + sync + Canvas-Render
- [ ] C1 `seekHint`-State in `MediaCardHead`
- [ ] C2 `seekHint` → VFD-Overlay in `SongInfo` (visuell verifiziert)
- [ ] D1 Pausiert-Status i18n DE/EN
- [ ] D2 Pausiert-Status in `ShareLayout` (visuell verifiziert)
- [ ] E1 Doctor sauber, alle Gates grün, Chromium + Firefox geprüft
- [ ] Alle Code-Referenzen verifiziert (Funktionen, Scripts, Pfade, i18n-Keys)

## Verified Facts (Stand 2026-06-29)

| Referenz | Verifikation |
|---|---|
| `audioPreviewRegistry` / `registerAudioPreviewForSpacebar` / `shouldIgnoreSpacebarTarget` / `resolveSpacebarTarget` | `Read` `AudioPreviewPlayer.tsx:242-306` |
| `AudioPreviewPlayerProps` (`mediaKind`, `onPlaybackIntent`, `onStatusChange`) | `Read` `AudioPreviewPlayer.tsx:22-36` |
| `audioRef`, `useAudioPreviewController`, `togglePlay`, `togglePlayFromEvent`, `useEffectEvent`, `resolveAudioProgressRatio`, `setProgressRatio`, `isPlayerActiveRef` | `Read` `AudioPreviewPlayer.tsx:421-465, 884-986, 988-1096, 1146-1165` |
| `notifyStatusChange`/`notifyPlaybackIntent`-Muster | `Read` `AudioPreviewPlayer.tsx:614-623` |
| `PlayerPhase.Playing`/`Paused` | `Read` `AudioPreviewPlayer.tsx` Reducer (Explore) + `state.phase`-Nutzung |
| VFD-Statuszeile (Zeile[3], `align: Center`, `marquee: shouldMarqueeStatus`) | `Read` `SongInfo.tsx:263-268` |
| `SongInfoProps.statusLine`, `shouldMarqueeStatus = statusLine.length > 28` | `Read` `SongInfo.tsx:44, 83` |
| `statusLine`-Pfad `ShareLayout`→`MediaCardHead:107`→`SongInfo:264` | `grep statusLine` |
| `previewStatus`-Pfad `ShareLayout`→`Desktop/MobileShareLayout`→`MediaSummaryCard`→`MediaCardHead:73,105`→`SongInfo` | `grep previewStatus` (DesktopShareLayout:41,85; MediaSummaryCard:13,41; MobileShareLayout:27,62) |
| `MediaCardHead` rendert Player (`onStatusChange`) + `SongInfo` als direkte Kinder | `Read` `MediaCardHead.tsx:94-126` |
| `vfdStatusLine`-Prioritätskette, `playingStatus`, `MediaKindValue.Song` | `Read` `ShareLayout.tsx:433-447` |
| `ShareUiActionType`/`ShareUiState`/`shareUiReducer` (Pause-Status braucht keinen Reducer-Eingriff, nur `previewStatus`, bereits im State) | `Read` `ShareLayout.tsx:15-133` |
| i18n `audio.statusPlayingSong`/`audio.statusPlaying` (EN `SONG PLAYING`/`PREVIEW PLAYING`, DE `SONG LÄUFT`/`VORSCHAU LÄUFT`) | `grep` de.json/en.json |
| VFD-Render: `drawVfdCanvas`, `lineCanvasColumns`, `writeColumns`, `contentCanvasPixelColumns`, `blankCanvasColumn`, `drawCanvasPixelColumns` | `Read` `vfdDisplayCanvas.ts:1-408` |
| `syncRenderStateLines` (Transition-Arming, beide Pfade), `renderStateRef`, gsap.ticker-Loop, `hasActiveAnimation`-Selbstabmeldung | `Read` `VfdDisplay.tsx:43-71, 149-285` |
| `VfdCanvasRenderState`, `NormalizedVfdLine`, `VfdDisplayLine`, `VfdBrightness`, `VfdContentTransition` | `Read` `VfdDisplayTypes.ts:1-345` |
| Marquee-Pattern (Offset über Zeit) als Aufhänger | `Read` `vfdDisplayMarquee.ts:1-133` |
| Plan-Nr. `MC-067` | `~/.local/bin/plans next` |
| Test-Runner `vitest`, Gate `pnpm test:run`, `pnpm run doctor:diff` | Memory `project_doctor_command_pitfalls`, `feedback_pre_push_gates` |

## Offene Punkte

Keine. Alle Produkt-Entscheidungen sind im Brainstorming geklärt (Spec-Tabelle).

## Risiken / Hinweise

- **Player nicht für DRY-Refactor anfassen** (Memory `project_player_c_cc_divergence`): Dieser Plan fügt nur Funktionalität additiv hinzu, führt C/CC-Player nicht zusammen.
- **Canvas-Layering**: Die Merge-Logik (B2/B3) verdeckt das Overlay im Text-Span solide. Falls der visuelle Test (C2 Step 5) „Durchscheinen" zeigt, ist `mergeOverlayColumns` der einzige Ort zum Nachjustieren.
- **`timeupdate` bei Pause**: Setzen von `audio.currentTime` feuert im Browser ein `timeupdate`/`seeked`; der State zieht über den bestehenden `handleTimeUpdate` nach. `seekBy` setzt `progressRatio` zusätzlich synchron, damit die Progressbar auch im pausierten Zustand sofort springt.
- **`prefers-reduced-motion`**: Der Render-Zweig überspringt das Overlay bei reduzierter Bewegung (kein Scroll), konsistent mit Marquee/Transition.
