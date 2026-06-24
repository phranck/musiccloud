# Cover-Morph beim List/Grid-Umschalten der Artist-Track-Ansichten

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) oder
> superpowers:subagent-driven-development. Schritte nutzen Checkbox-Syntax (`- [ ]`).

**Goal:** Beim Umschalten Liste ↔ Raster morpht das Cover jedes Tracks butterweich an seine neue
Position/Größe; der übrige Zeileninhalt fadet überlappend aus/ein (Variante 2).

**Architecture:** Wiederverwendung des vorhandenen GSAP-Flip-Plugins (`captureFlipState` /
`animateFlipFrom`). Das Cover wird über `data-flip-id` aus dem Track-Key gematcht. `ArtistTrackContent`
wird vom harten Switch zu einem Cross-Fade-Container (beide Ansichten kurz gleichzeitig im DOM; nur die
ankommende trägt die `flip-id`, die abgehende fadet als Geist aus).

**Tech Stack:** React 19, Astro, GSAP 3.15 + @gsap/react (Flip), Tailwind 4, Vitest.

Spec: `docs/superpowers/specs/2026-06-24-track-view-cover-morph-design.md`. Baut auf dem fertigen
List/Grid-Toggle auf (`.claude/plans/done/2026-06-24-artist-track-list-grid.md`).

## Entscheidungen (mit User abgestimmt)

- **Choreografie:** Variante 2 (überlappend) — Cover morpht, Zeilen-Text fadet gleichzeitig aus
  (Liste → Raster) bzw. leicht versetzt ein (Raster → Liste).
- **Text-Fade:** voll (Cross-Fade) — auch der abgehende Text fadet, daher beide Ansichten kurz im DOM.
- **Scope:** Popular + Similar, Desktop (`ArtistTrackListCard`) **und** Mobile (`ArtistInfoCard`),
  automatisch C **und** CC (Track-Ansichten sind modus-agnostisch).
- **Scroll-Reset:** beim Umschalten Scroll-Container auf `scrollTop = 0` (Snapshot/Ziel oben verankert).
- **Reduced Motion:** harter Sofortwechsel (kein Tween).
- **Timing:** `MotionEase.McOut`, `MotionDuration.Grid` (0,62 s).

## Ist-Zustand (verifiziert per Read 2026-06-24)

- `ArtistTrackContent` (Switch list/grid), `ArtistTrackList`/`PopularTrack`, `ArtistTrackGrid`/
  `ArtistTrackGridItem`, `useTrackListView`, `TrackViewToggle`, `ArtistTrackListCard` existieren und
  sind verdrahtet (Desktop via `AnimatedArtistColumn` 2×, Mobile via `ArtistInfoCard`).
- Cover beidseits = `SlideArtwork` (Liste `w-12 h-12`/`imgDim 48`, Grid `w-full aspect-square`/`imgDim 96`).
- React-Keys in beiden Ansichten identisch: `artistLabel ? \`${artistLabel}:${track.deezerUrl}\` : track.deezerUrl`.
- Flip-Infra vorhanden: `captureFlipState`/`animateFlipFrom` (`lib/motion/flip.ts`), Muster in
  `useFlipAnimation` + `AnimatedArtistColumn`.
- `RecessedCardRoot` reicht **keine** `data-*`-Props durch (nur `children/className/ref/style/borderWidth/radius/padding`).

## Slices

### Slice 1 — flip-id-Anker am Cover
- `RecessedCardRoot` (`RecessedCardParts.tsx`): optionales `data-flip-id` annehmen und aufs Wurzel-`div` setzen.
- `SlideArtwork`: optionale `flipId?: string`-Prop → `data-flip-id={flipId}` an `RecessedCard`.
- `PopularTrack` + `ArtistTrackGridItem`: den Track-Key berechnen (identisch zum React-`key`) und als
  `flipId` an `SlideArtwork` geben. Key-Helper in `artistTrackItems.ts` (DRY: ein `trackItemKey(item)`),
  den auch `ArtistTrackList`/`ArtistTrackGrid` fürs `key`-Prop nutzen.
- Test (`SlideArtwork.test.tsx`): mit `flipId` rendert `[data-flip-id="…"]`, ohne `flipId` kein Attribut.
- Gate (`test:run`, `astro check`, `pnpm lint`, `pnpm doctor:diff`) + Commit.

### Slice 2 — `useTrackViewMorph` (Choreografie-Hook)
- Neu: `apps/frontend/src/hooks/useTrackViewMorph.ts`. Wrappt `useTrackListView(storageKey)` und liefert
  `{ view, setView, containerRef, outgoingView }`.
  - `containerRef` zeigt auf den stabilen Wrapper um `ArtistTrackContent`.
  - `setView(next)`: scroll-reset; `captureFlipState` der aktuellen `[data-flip-id]`-Cover im Container
    (alte Ansicht noch im DOM); `outgoingView = aktuelle view`; dann `useTrackListView.setView(next)`;
    monotonen Tick erhöhen.
  - `useGSAP`/`useLayoutEffect` (tick-keyed, Muster wie `useFlipAnimation`): nach Commit
    `animateFlipFrom(state, { targets: ankommende Cover, duration: MotionDuration.Grid })`; `onComplete`
    räumt `outgoingView` (Geist-Unmount). Reduced Motion: `animateFlipFrom` → `null` → `outgoingView`
    sofort räumen (harter Wechsel).
- Test (`useTrackViewMorph.test.ts`): `setView` ruft `captureFlipState` vor dem Commit und
  `animateFlipFrom` danach (Flip-Modul gemockt, wie `useFlipAnimation.test.ts`); Reduced-Motion-Pfad
  räumt `outgoingView` ohne Tween.
- Gate + Commit.

### Slice 3 — `ArtistTrackContent` als Cross-Fade-Container
- `ArtistTrackContent` bekommt zusätzlich `outgoingView?: TrackListView`. Rendert die ankommende Ansicht
  im Fluss (mit `flip-id` an den Covern). Ist `outgoingView` gesetzt, rendert es die abgehende Ansicht
  zusätzlich als `position: absolute inset-0`-Geist **ohne** `flip-id`, der per GSAP/CSS ausfadet
  (Zeilen-Text der alten Ansicht). Der Geist überlagert sich am Start deckungsgleich mit dem morphenden
  Cover (kein Doppelbild).
- `flip-id` nur an der ankommenden Ansicht: die `flipId`-Weitergabe in `PopularTrack`/`ArtistTrackGridItem`
  wird über eine Prop (z. B. `enableFlipId`) der jeweiligen Ansicht gesteuert; der Geist setzt sie nicht.
- Reduced Motion: kein Geist, harter Switch (`outgoingView` nie gesetzt).
- Verifikation: Browser (jsdom hat keine Layout-Engine) — Morph + Text-Fade in beiden Richtungen sichtbar,
  keine doppelten Cover, kein Layout-Sprung. Plus Verhaltenstest, dass der Geist nur bei gesetztem
  `outgoingView` rendert.
- Gate + Commit.

### Slice 4 — Verdrahtung Desktop + Mobile
- `ArtistTrackListCard`: `useTrackListView` → `useTrackViewMorph`; `containerRef` um den
  `ArtistTrackContent`-Bereich (innerhalb `ArtistSectionWell`); `setView` an den `TrackViewToggle`;
  `outgoingView` an `ArtistTrackContent`.
- `ArtistInfoCard`: analog für `popularView` **und** `similarView` (zwei Instanzen).
- Verifikation: Browser — Umschalten Desktop + Mobile, Popular + Similar, kommerziell + CC; Persistenz
  (localStorage) unverändert; Reduced-Motion (DevTools-Emulation) = harter Wechsel.
- Gate + Commit.

## Checkliste
- [ ] Slice 1: `flip-id` am Cover (RecessedCard-Durchreichung, SlideArtwork-Prop, Key-Helper), Test grün
- [ ] Slice 2: `useTrackViewMorph` (capture/animate, tick-keyed, reduced-motion), Test grün
- [ ] Slice 3: `ArtistTrackContent` Cross-Fade-Container, Browser-verifiziert
- [ ] Slice 4: Desktop + Mobile verdrahtet, C+CC browser-verifiziert, Persistenz intakt
- [ ] Alle Code-Referenzen verifiziert (Typen, Hooks, Pfade, Konstanten)
- [ ] Gates je Slice grün (`test:run`, `astro check`, `pnpm lint`, `pnpm doctor:diff`)
- [ ] Reduced Motion: harter Sofortwechsel ohne Tween

## Verifizierte Fakten (Stand 2026-06-24, gegen Repo gelesen)
- `ArtistTrackContent.tsx:35` — `view === TrackListView.Grid ? <ArtistTrackGrid> : <ArtistTrackList>`.
- `ArtistTrackList.tsx:45` / `ArtistTrackGrid.tsx:66` — `items.map`, Key `artistLabel ? \`${artistLabel}:${track.deezerUrl}\` : track.deezerUrl`.
- `PopularTrack.tsx:52` — `SlideArtwork sizeClass="w-12 h-12" imgDim={48}`; `ArtistTrackGridItem.tsx:73` — `sizeClass="w-full aspect-square" imgDim={96} radius={TILE_RADIUS}`.
- `SlideArtwork.tsx:75` — Wurzel `RecessedCard`; `RecessedCardParts.tsx:210` — kein `data-*`-Spread.
- `useTrackListView.ts:72` — `[view, setView]`; `TrackListView = { List:"list", Grid:"grid" }`.
- `flip.ts:143` `captureFlipState`, `flip.ts:165` `animateFlipFrom` (scale:true, absolute, nested, onEnter/onLeave, reduced-motion → null).
- `useFlipAnimation.ts:95` — capture/trigger-Muster, `useGSAP` auf `returnTick`.
- `AnimatedArtistColumn.tsx:97` — Container-Flip via `useGSAP`; rendert `ArtistTrackListCard` 2× (`:134`, `:147`).
- `constants.ts` — `MotionDuration.Grid = 0.62`, `MotionEase.McOut = "mcOut"`.
- Call-Sites: `ArtistTrackListCard.tsx:59` (Desktop), `ArtistInfoCard.tsx:76-77` (Mobile, popular + similar).
- `CcTrackDetailsSection.tsx` — Label/Wert, keine Cover → out of scope.
