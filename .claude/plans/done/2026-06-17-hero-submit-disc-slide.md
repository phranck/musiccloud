# Hero-Submit: Disc-Slide-Choreografie

## Preface

Beim Absenden einer Suche im Hero-Input wird heute der Submit-Button bei
`state === InputState.Loading` schlicht durch die `CDSpinArtwork` ersetzt (harter
Swap, keine Bewegung) — `HeroInput.tsx:187-189`. Gewünscht ist eine choreografierte
Mikro-Interaktion: Submit-Button slidet nach rechts raus, gleich im Anschluss
slidet die Spinning-Disc von rechts in exakt den Button-Slot, dreht während des
Ladens, und slidet vor dem Wechsel zur Result-Seite wieder nach rechts raus.

Design ist als animiertes Mockup gezeigt und vom User freigegeben (inkl. Defaults:
Min-Spin, Fast-Result-Queue, `prefers-reduced-motion`, Scope = Share-Result-Pfad).

## Ziel

`HeroInput` spielt beim Submit die Sequenz **Button-raus → Disc-rein (dreht) →
Disc-raus**; die Disc füllt den **vollen Button-Footprint** (40px/48px). `LandingPage`
hält den Wechsel zu `ActiveShareResult` zurück, bis die Disc draußen ist. Der
Daten-State (`useAppState`/Reducer) bleibt unberührt — die Choreografie lebt in der
View. Verhalten für Disambiguation/Genre/Error unverändert.

## Design

### Visuelle Sequenz

1. Submit gedrückt (`onSubmit` → `state` wird `Loading`): **Button slidet nach
   rechts raus** (`translateX(0 → 170%)`, ~260ms, ease-in), vom `overflow:hidden`
   des Wells abgeschnitten.
2. **Gleich im Anschluss**: **Disc slidet von rechts rein** (`translateX(170% → 0)`,
   ~320ms, `cubic-bezier(.16,1,.3,1)`) und dreht.
3. **Loading**: Disc dreht im Slot (mind. Min-Spin, s.u.).
4. Result fertig (`active` gesetzt): **Disc slidet nach rechts raus**
   (`translateX(0 → 170%)`, ~260ms, ease-in), dreht dabei weiter.
5. **Erst danach**: `ActiveShareResult` erscheint.

### Geometrie / Größe

- Rechter Slot = fester Button-Footprint `size-10 md:size-12` (40/48px), `relative`,
  `overflow-hidden` (clippt die Slides). Button + Disc liegen beide `absolute inset-0`
  im Slot, `translateX` schiebt sie.
- Disc wird auf **volle Slot-Größe** gebracht: `CDSpinArtwork className="size-10 md:size-12"`
  (heute kleiner: `w-8 h-8 md:w-10 md:h-10`, `HeroInput.tsx:189`).
- Der innere Well-`overflow:hidden` (RecessedCard) bleibt — er clippt die Slides am
  rechten Feldrand. (Der äußere Pill hat seit dem Firefox-Fix `overflow-visible`;
  irrelevant, da die Slides im inneren Well stattfinden.)

### Phasen-Maschine in `HeroInput`

`useReducer`-Phase: `idle → buttonExit → discEnter → spinning → discExit → done`.
Treiber:
- `state`-Prop-Übergang `→ Loading` startet `buttonExit`; Phasenwechsel via
  `onTransitionEnd` am bewegten Element (Timeout-Sicherung gegen verpasste Events).
- `buttonExit` fertig → `discEnter`; `discEnter` fertig → `spinning`.
- Neue Prop `requestDiscExit` (von `LandingPage`) startet aus `spinning` heraus
  `discExit`; `discExit` fertig → `onLoadingExitComplete()` callback + Phase `done`.
- Min-Spin: `spinning` mindestens ~600ms, bevor `discExit` zugelassen wird (sonst
  Queue: Exit erst nach Ablauf).
- Fast-Result: kommt `requestDiscExit` während `buttonExit`/`discEnter`, wird der
  Exit **gequeued** und erst nach `spinning`(+Min-Spin) gespielt (kein Mitten-Abbruch).
- Verlässt `state` Loading zu einem **Nicht-Result** (Idle, z.B. Disambiguation/
  Genre/Error): Reset auf `idle` (Button zurück, Disc raus) — kein Hold.
- `prefers-reduced-motion`: keine Slides; Disc/Button-Swap + Result-Reveal direkt
  (heutiges Verhalten), `onLoadingExitComplete` sofort.
- **`compact`-Wechselwirkung**: heute hat der Submit-Button `compact && "hidden"`
  (`HeroInput.tsx:200`), und `showCompact` wird beim Loading sofort true
  (`useAppState.ts:76-82`). Während `buttonExit` muss der Button **sichtbar** sein,
  um rauszusliden — die Phase (nicht die `compact`-Klasse) steuert die Sichtbarkeit
  des Slot-Inhalts. `compact && hidden` darf die Slot-Layer während der Sequenz nicht
  ausblenden; nur im Ruhezustand (`idle` + compact, Nicht-Loading) gilt das heutige
  Verstecken.

Slot-Rendering: Button (Arrow/Check/Disabled je `state`) **und** Disc gleichzeitig
gemountet, Sichtbarkeit/Position aus der Phase. Ersetzt den heutigen
`state === Loading ? <disc> : <EmbossedButton>`-Ternary (`HeroInput.tsx:187-209`).

### `LandingPage`-Gate (Result-Reveal zurückhalten)

- Lokaler State `discExitPending` (kein Reducer-Eingriff).
- Übergang `inputState` Loading → `active` gesetzt (Share-Result) und nicht
  reduced-motion → `discExitPending = true`.
- Render-Gate (`LandingPage.tsx:398`) erweitern:
  `activeShareConfig && active && !isFieldReturnStaging && !discExitPending`
  → solange `discExitPending`, bleibt der Hero-Block gemountet.
- Während `discExitPending`: an `HeroInput` `state={InputState.Loading}` (Override,
  damit Disc sichtbar bleibt) + `requestDiscExit={true}`.
- `onLoadingExitComplete` → `discExitPending = false` → `ActiveShareResult` rendert.

### Mechanismus

CSS `transition: transform` (+ `transition: opacity` für den Button-Fade) auf den
beiden Slot-Layern, Phasenwechsel über `onTransitionEnd` + Timeout-Sicherung. KISS,
passt zum Projekt-Idiom (Segmented-Control-Indicator + LandingPage-FLIP nutzen CSS-
Transitions). GSAP ist verfügbar, aber für einen Slide unnötig.

### Timing-Defaults (tunbar)

`buttonExit` 260ms / `discEnter` 320ms / `discExit` 260ms / Min-Spin 600ms.
Ease-in `cubic-bezier(.4,0,1,1)` für Exits, Ease-out `cubic-bezier(.16,1,.3,1)` für
den Disc-Eintritt.

## Implementation

1. **`CDSpinArtwork`** — keine Änderung nötig (size kommt per `className`).
2. **`HeroInput.tsx`**
   - Phasen-`useReducer` + Refs auf Button-/Disc-Layer; `useEffect` auf `state` und
     `requestDiscExit` treibt die Phasen.
   - Rechten Slot umbauen: fester `size-10 md:size-12`-Container `relative overflow-hidden`;
     darin Button-Layer (`EmbossedButton`, Akzent-Fill, Arrow/Check) + Disc-Layer
     (`CDSpinArtwork className="size-10 md:size-12"`), beide `absolute inset-0`, per
     Phase `translateX`/`opacity` via inline-style oder Tailwind-Datenattribut.
   - `prefers-reduced-motion`-Branch (Swap ohne Slides, `onLoadingExitComplete` sofort).
   - Props erweitern: `requestDiscExit?: boolean`, `onLoadingExitComplete?: () => void`.
   - Verhalten/aria/Clear/Auto-Submit/`compact` unverändert.
3. **`LandingPage.tsx`**
   - `discExitPending`-State + Effekt (Loading→active-Erkennung, reduced-motion-Guard).
   - Render-Gate um `&& !discExitPending` erweitern (`LandingPage.tsx:398`).
   - `HeroInput`-Props: `requestDiscExit` + `onLoadingExitComplete` + ggf.
     `state`-Override während Hold (`LandingPage.tsx:416-428`).
4. **Verifikation im Browser** (:3001, Chrome via chrome-devtools-mcp + Firefox-Sicht):
   Submit → Button raus → Disc rein/dreht → Disc raus → Result; Disc = Button-Größe;
   schnelles/gecachtes Result (Min-Spin greift); reduced-motion (kein Slide);
   Disambiguation/Genre/Error unverändert; keine Konsolen-Fehler.
5. **Gates**: `astro check`, `pnpm lint`, `pnpm doctor:diff`, `LandingPage.test.tsx`
   (Test-Kontrakt: Input-/Clear-aria unverändert).

## Verified facts

- [x] Heutiger Swap `state === InputState.Loading ? <CDSpinArtwork .../> : <EmbossedButton>`
  — `HeroInput.tsx:187-209`; Disc heute `w-8 h-8 md:w-10 md:h-10` in `size-10 md:size-12`-
  Container — `HeroInput.tsx:188-189`.
- [x] Submit-Button = `EmbossedButton as="button"`, Akzent-Fill via `style`,
  `size-10 md:size-12`, `compact && "hidden"` — `HeroInput.tsx:192-209`.
- [x] `HeroInputProps` ohne Animations-Props; `onSubmit` vorhanden — `HeroInput.tsx:25-37,30`.
- [x] Pill ist `EmbossedCard radius="9999px" className="overflow-visible"`; Well =
  `RecessedCard ... "hero-field"` (eigener `overflow-hidden` via `recessed-gradient-border
  overflow-hidden`, `RecessedCardParts.tsx:256`) — `HeroInput.tsx:144-145`.
- [x] `CDSpinArtwork` nimmt `className` für Größe (kein size-Prop) — `CDSpinArtwork.tsx:16,31`.
- [x] `LandingPage` Render-Gate `activeShareConfig && active && !isFieldReturnStaging ?
  <ActiveShareResult> : <Hero-Block mit HeroInput>` — `LandingPage.tsx:398-430`.
- [x] `inputState`-Ableitung: `state.type === Result → Success`, sonst `state.type as
  InputState` (Loading→Loading) — `LandingPage.tsx:256-262`.
- [x] `HeroInput` gerendert mit `onSubmit={handleSubmit}` + `state={inputState}` +
  `compact={showCompact}` — `LandingPage.tsx:416-428`.
- [x] Loading→Result-Übergang = `dispatch({type:"RESOLVE_SUCCESS", active, resolved})`
  in `handleSubmit`; `SUBMIT` setzt loading — `useAppState.ts:86,132`. Reducer bleibt
  unberührt.
- [x] GSAP verfügbar (`gsap`, `@gsap/react` in `apps/frontend/package.json`), aber
  nicht nötig; Projekt-Idiom für Mikro-Interaktionen = CSS-Transitions.

## Checklist

- [x] Alle Code-Referenzen verifiziert (Funktionen, Klassen, Pfade, Props) — s.o.
- [x] Slot-Choreografie (Button raus → Disc rein → spin → Disc raus), Disc auf
  voller Button-Größe (`size-full` im `size-10 md:size-12`-Slot), reduced-motion-Branch.
- [x] `LandingPage`: Result-Reveal-Hold + `requestDiscExit`/`onLoadingExitComplete`
  + state-Override während Hold.
- [x] Verhalten/aria/Clear/Auto-Submit/`compact` unverändert; Disambiguation/Genre/
  Error unverändert (Hold nur am direkten Search→Share-Result-Pfad).
- [x] Browser-Verifikation (Chrome): voller Flow `sawBtnOut/sawDiscIn/sawDiscOut/
  resultAppeared = true`, `discWidth = restButtonWidth = 48px`; keine
  animationsbezogenen Konsolen-Fehler.
- [x] Gates grün: `astro check` (0 errors), `pnpm lint`, `pnpm doctor:diff` (0 issues),
  komplette Frontend-Vitest-Suite (143 passed).

## Completed

Umgesetzt + verifiziert am 2026-06-17. Noch nicht committet (User entscheidet).

**Architektur-Abweichung vom ursprünglichen Design (wegen react-doctor-prevention-Policy):**
Statt einer JS-Timer-Phasen-Maschine mit Effekten (die `no-event-handler`,
`no-prop-callback-in-effect`, `state-chained-in-effect` triggerte) wurde die
Choreografie deklarativ über **CSS-Keyframes + `onAnimationEnd`-Event-Handler**
gebaut — keine Effekte, kein Parent-Callback-in-Effect.

- Neu: `apps/frontend/src/components/landing/HeroSubmitSlot.tsx` — Rest-Button /
  animierter Slot (Phase via bedingtem Mount zurückgesetzt) / reduced-motion-Disc.
  `SUBMIT_ACCENT_FILL` + die Submit-Button-Darstellung sind hierher gewandert.
- Neu: `apps/frontend/src/hooks/useDeferredResultReveal.ts` — hält den Share-Result-
  Reveal via render-time-Transition-Detection (kein Effekt).
- Neu: `apps/frontend/src/hooks/useHeroFieldFlip.ts` — die FLIP-`useLayoutEffect` aus
  `LandingPage` ausgelagert (löst `no-giant-component`; `LandingPageInner` war 301 Z.).
- Keyframes `mc-hero-btn-out/disc-in/disc-out` in `animations.css`.
- `HeroInput.tsx` schlank: rendert nur noch `HeroSubmitSlot`.
- Min-Spin (600ms) entfällt: die Disc kann erst nach vollständigem Eintritt
  raussliden (Enter-Gate ~580ms Mindestsichtbarkeit), daher kein Flash auch ohne
  expliziten Timer — react-doctor-konform ohne Timer-Effekt.
- `LandingPage.test.tsx`: Test 1 treibt die CSS-Choreografie deterministisch über
  synthetische `animationend`-Events (jsdom rendert keine CSS-Animationen) — analog
  zum bestehenden GSAP-`totalProgress(1)`-Muster der Suite.

**Pre-existing (nicht von diesem Task):** Locale-Hydration-Mismatch (SSR EN ↔ Client
DE) auf Placeholder/Teaser/Switcher-Legend — eigener Task.
