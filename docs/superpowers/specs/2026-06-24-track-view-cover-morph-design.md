# Spec: Cover-Morph beim List/Grid-Umschalten der Artist-Track-Ansichten

**Datum:** 2026-06-24
**Status:** Design freigegeben, bereit für Implementierungsplanung

## Kontext

Jede Artist-Track-Sektion (die eigenen *Popular Tracks* und die *Similar-Artist Tracks*) lässt sich zwischen einer Listen- und einer Rasteransicht umschalten. Der Umschalter ([TrackViewToggle.tsx](../../../apps/frontend/src/components/artist/TrackViewToggle.tsx)) sitzt im Card-Header; die Auswahl wird pro Sektion in `localStorage` gehalten ([useTrackListView.ts](../../../apps/frontend/src/hooks/useTrackListView.ts)).

Heute ist der Wechsel ein **harter Component-Swap**: [ArtistTrackContent.tsx:35](../../../apps/frontend/src/components/artist/ArtistTrackContent.tsx) rendert je nach `view` entweder `ArtistTrackList` oder `ArtistTrackGrid`. React unmountet die eine Ansicht und mountet die andere — die Ansicht „springt".

Beide Ansichten zeigen dasselbe Cover über dieselbe Komponente ([SlideArtwork.tsx](../../../apps/frontend/src/components/ui/SlideArtwork.tsx)): in der Liste 48×48 px ([PopularTrack.tsx:52](../../../apps/frontend/src/components/artist/PopularTrack.tsx)), im Raster quadratisch über die volle Spaltenbreite ([ArtistTrackGridItem.tsx:73](../../../apps/frontend/src/components/artist/ArtistTrackGridItem.tsx)). Die React-Keys sind in beiden Ansichten identisch (`track.deezerUrl`, bzw. `${artistLabel}:${track.deezerUrl}` für Similar). Das Cover ist also pro Track ein stabil identifizierbares, geteiltes Element — die ideale Grundlage für eine Shared-Element-Transition.

## Ziel

Beim Umschalten zwischen Liste und Raster **morpht das Cover jedes Tracks butterweich** von seiner alten an seine neue Position und Größe (Liste ↔ Raster), statt hart zu wechseln. Der übrige Zeileninhalt (Titel, Sublabel, Dauer) blendet dabei weich aus bzw. ein.

Das gilt für **beide Sektionen** (Popular + Similar), **beide Viewports** (Desktop und Mobile) und damit **beide Modi** (kommerziell und Creative Commons) — Letzteres automatisch, weil die Track-Ansichten modus-agnostisch sind und keine CC-eigenen Track-View-Komponenten existieren.

## Verhalten

### Choreografie (Variante 2 — überlappend)

| Richtung | Cover | Zeilen-Text / Overlay |
| --- | --- | --- |
| Liste → Raster | morpht aus der Spalte ins Raster (Position + Größe) | der Zeilen-Text blendet **gleichzeitig** aus, während die Cover wandern |
| Raster → Liste | morpht aus dem Raster zurück in die Spalte | der Zeilen-Text blendet **leicht versetzt** wieder ein, noch bevor die Cover ganz angekommen sind |

- Easing und Dauer aus dem bestehenden Motion-System: `MotionEase.McOut` (`cubic-bezier(0.16, 1, 0.3, 1)`) und `MotionDuration.Grid` (0,62 s) — siehe [constants.ts](../../../apps/frontend/src/lib/motion/constants.ts).
- Rein compositor-basiert (`transform`/`opacity`), keine Layout-Properties animiert (Performance-Policy MC-029).
- **Reduced Motion:** kein Tween — sofortiger, harter Wechsel (die DOM steht nach dem Commit bereits im Zielzustand). Das ist im Flip-Helper bereits eingebaut.

### Auslöser

Nur der Klick auf den `TrackViewToggle`. Kein Morph bei Erst-Render/Hydration, kein Morph beim Skeleton→Content-Wechsel (das ist der separate Column-Flip in [AnimatedArtistColumn.tsx](../../../apps/frontend/src/components/share/AnimatedArtistColumn.tsx)).

## Architektur

Ansatz: das bereits vorhandene **GSAP Flip-Plugin** wiederverwenden. `captureFlipState` schnappt die Cover-Geometrie, bevor die Ansicht wechselt; nach dem Commit morpht `animateFlipFrom` von diesem Snapshot auf das neue Layout ([flip.ts:143](../../../apps/frontend/src/lib/motion/flip.ts), [flip.ts:165](../../../apps/frontend/src/lib/motion/flip.ts)). Das exakte Capture-vor-Änderung / Animate-nach-Commit-Muster existiert schon zweimal: als Primitive in [useFlipAnimation.ts](../../../apps/frontend/src/hooks/useFlipAnimation.ts) und als Container-Flip in [AnimatedArtistColumn.tsx:97](../../../apps/frontend/src/components/share/AnimatedArtistColumn.tsx).

> Anders als beim `SmoothSwap` (wo das Plugin bewusst nicht genutzt wird, weil dort beide Buffer mit frischen Keys neu mounten und es kein matchbares Element gibt) ist die Element-Identität hier über den `track.deezerUrl` stabil — der Bilderbuch-Fall fürs Flip-Plugin.

### Flip-Anker: `flip-id` auf dem Cover

Das geteilte Cover wird über ein `data-flip-id` aus dem Track-Key gematcht. Da [SlideArtwork.tsx](../../../apps/frontend/src/components/ui/SlideArtwork.tsx) in beiden Ansichten dieselbe Komponente ist, ist sie der eine Anker — kein dupliziertes Cover-Markup.

- `SlideArtwork` erhält eine optionale `flipId`-Prop und setzt sie als `data-flip-id` auf ihr Wurzelelement.
- Das Wurzelelement ist eine `RecessedCard`. `RecessedCardRoot` reicht aktuell **keine** `data-*`-Props durch ([RecessedCardParts.tsx:210](../../../apps/frontend/src/components/cards/RecessedCardParts.tsx) destrukturiert nur `children, className, ref, style, borderWidth, radius, padding`). Daher wird `RecessedCardRoot` minimal um die Weitergabe eines `data-flip-id` erweitert.
- `PopularTrack` und `ArtistTrackGridItem` reichen `flipId={trackKey}` an ihr `SlideArtwork` durch (derselbe Key wie der React-`key`).

### Cross-Fade-Container statt hartem Switch

Damit auch der **abgehende** Zeilen-Text faden kann (Variante 2, „Voll"), müssen beide Ansichten für die Dauer der Transition (~0,62 s) gleichzeitig im DOM sein. [ArtistTrackContent.tsx](../../../apps/frontend/src/components/artist/ArtistTrackContent.tsx) wird vom harten Switch zu einem kleinen **Cross-Fade-Container**:

- Die **ankommende** Ansicht rendert im Fluss und trägt die `flip-id` auf ihren Covern.
- Die **abgehende** Ansicht bleibt kurz als `position: absolute` liegender „Geist" und blendet aus (ihr Zeilen-Text ist das, was sichtbar wegfadet). Sie trägt **keine** `flip-id`, damit es keinen doppelten Flip-Match gibt; ihr Cover liegt am Start deckungsgleich unter dem morphenden neuen Cover und ist daher kein sichtbares Doppelbild.
- Nach Abschluss der Transition wird der Geist entfernt (regulärer Unmount).

### Choreografie-Hook `useTrackViewMorph`

Ein neuer Hook kapselt die Choreografie an einer Stelle (DRY; Desktop + Mobile teilen ihn), gebaut nach dem Muster von [useFlipAnimation.ts](../../../apps/frontend/src/hooks/useFlipAnimation.ts):

- umschließt `useTrackListView` und liefert `[view, setViewAnimated, containerRef]`;
- `setViewAnimated(next)` ruft `captureFlipState` auf die aktuellen Cover im `containerRef` (solange die alte Ansicht im DOM ist) und setzt dann `view`;
- ein `useGSAP`/`useLayoutEffect`, gekeyt auf einen monotonen Tick (nicht auf `view`), ruft nach dem Commit `animateFlipFrom` mit `MotionDuration.Grid` und der `mcOut`-Kurve; rasches Hin-und-Her re-armt sauber (Capture force-completed einen laufenden Flip — GSAP-Snapshot-Semantik, wie in `useFlipAnimation`);
- Reduced Motion und `setupMotion()` kommen aus dem Flip-Helper, nicht aus dem Hook.

### Verdrahtung (zwei Call-Sites)

- **Desktop:** [ArtistTrackListCard.tsx:59](../../../apps/frontend/src/components/artist/ArtistTrackListCard.tsx) ersetzt `useTrackListView` durch `useTrackViewMorph`, legt `containerRef` um den `ArtistTrackContent`-Bereich und gibt `setViewAnimated` an den `TrackViewToggle`. Gerendert je einmal für Popular und Similar via [AnimatedArtistColumn.tsx:134](../../../apps/frontend/src/components/share/AnimatedArtistColumn.tsx).
- **Mobile:** [ArtistInfoCard.tsx:76](../../../apps/frontend/src/components/artist/ArtistInfoCard.tsx) analog für `popularView` und `similarView`.

## Betroffene Komponenten

- `apps/frontend/src/components/ui/SlideArtwork.tsx` — neue optionale `flipId`-Prop → `data-flip-id` auf der Wurzel.
- `apps/frontend/src/components/cards/RecessedCardParts.tsx` — `RecessedCardRoot` reicht `data-flip-id` durch (minimal).
- `apps/frontend/src/components/artist/PopularTrack.tsx` — `flipId={trackKey}` an `SlideArtwork`.
- `apps/frontend/src/components/artist/ArtistTrackGridItem.tsx` — `flipId={trackKey}` an `SlideArtwork`.
- `apps/frontend/src/components/artist/ArtistTrackContent.tsx` — Umbau zum Cross-Fade-Container (beide Ansichten während der Transition, abgehende absolut + ausblendend).
- `apps/frontend/src/hooks/useTrackViewMorph.ts` *(neu)* — Choreografie-Hook (capture/animate, gekeyt auf Tick).
- `apps/frontend/src/components/artist/ArtistTrackListCard.tsx` — auf `useTrackViewMorph` + `containerRef` umstellen.
- `apps/frontend/src/components/artist/ArtistInfoCard.tsx` — dito für beide Sektionen.
- Tests: `useTrackViewMorph.test.ts` (capture/animate-Wiring, Reduced-Motion-Pfad) und ein Verhaltenstest für den Cross-Fade-Container.

## Edge Cases

- **Unterschiedliche Scroll-Höhen:** Liste scrollt in `max-h-[248px]` ([ArtistTrackList.tsx:43](../../../apps/frontend/src/components/artist/ArtistTrackList.tsx)), Raster in `max-h-72` ([ArtistTrackGrid.tsx:58](../../../apps/frontend/src/components/artist/ArtistTrackGrid.tsx)). Cover außerhalb des sichtbaren Bereichs könnten über den Clip hinaus animieren. Default-Lösung: beim Umschalten den Scroll-Container auf `scrollTop = 0` setzen, damit Snapshot und Ziel konsistent oben verankert sind. Im Plan zu bestätigen.
- **Resolve-CD-Animation vs. Morph:** Die CD-Slot-Animation in `SlideArtwork` (`active`/`resolving`) ist eine eigene Schicht innerhalb des Covers und läuft nur beim Track-Resolve. Kollision mit dem View-Morph ist unwahrscheinlich; der laufende Morph wird beim erneuten Umschalten ohnehin sauber neu gestartet.
- **Schnelles Hin-und-Her-Umschalten:** Tick-gekeytes Re-Arming; Capture force-completed den laufenden Flip (GSAP-Snapshot-Semantik).
- **Leere oder einzeilige Sektion:** Der Toggle erscheint nur bei `items.length > 0` (bereits so); ohne Umschalter kein Morph.
- **SSR/Hydration:** `useTrackListView` liefert bei SSR die `defaultView`; der Morph läuft ausschließlich client-seitig nach Mount. Kein Flip im SSR-/Hydrations-Render.

## Out of Scope

- [CcTrackDetailsSection.tsx](../../../apps/frontend/src/components/cards/CcTrackDetailsSection.tsx) — eine Label/Wert-Liste (Genres, Stats) ohne Cover und ohne List/Grid-Toggle; nicht betroffen.
- Die interne CD-Slot-Resolve-Animation von `SlideArtwork` bleibt unverändert.
- Andere List-Ansichten außerhalb der Artist-Track-Sektionen (es existieren keine weiteren List/Grid-Toggles).

## Verifizierte Fakten (Stand 2026-06-24, gegen Repo gegrept/gelesen)

- [ArtistTrackContent.tsx:35](../../../apps/frontend/src/components/artist/ArtistTrackContent.tsx) — harter Switch `view === TrackListView.Grid ? <ArtistTrackGrid> : <ArtistTrackList>`.
- [ArtistTrackList.tsx:45](../../../apps/frontend/src/components/artist/ArtistTrackList.tsx) — `items.map` → `PopularTrack`, `key = artistLabel ? \`${artistLabel}:${track.deezerUrl}\` : track.deezerUrl`; Scroll-Clip `max-h-[248px]`.
- [ArtistTrackGrid.tsx:66](../../../apps/frontend/src/components/artist/ArtistTrackGrid.tsx) — `items.map` → `ArtistTrackGridItem`, identischer Key; Scroll-Clip `max-h-72`.
- [PopularTrack.tsx:52](../../../apps/frontend/src/components/artist/PopularTrack.tsx) — `SlideArtwork sizeClass="w-12 h-12" imgDim={48}`.
- [ArtistTrackGridItem.tsx:73](../../../apps/frontend/src/components/artist/ArtistTrackGridItem.tsx) — `SlideArtwork sizeClass="w-full aspect-square" imgDim={96} radius={TILE_RADIUS}`.
- [SlideArtwork.tsx:75](../../../apps/frontend/src/components/ui/SlideArtwork.tsx) — Wurzel ist `RecessedCard`; keine `flipId`/`data-*`-Prop vorhanden.
- [RecessedCardParts.tsx:210](../../../apps/frontend/src/components/cards/RecessedCardParts.tsx) — `RecessedCardRoot` destrukturiert nur `children, className, ref, style, borderWidth, radius, padding` (kein `...rest`/`data-*`-Spread).
- [useTrackListView.ts:72](../../../apps/frontend/src/hooks/useTrackListView.ts) — `[view, setView]`, localStorage, SSR-safe; `TrackListView = { List: "list", Grid: "grid" }`.
- [artistTrackViewKeys.ts:12](../../../apps/frontend/src/components/artist/artistTrackViewKeys.ts) — `ArtistTrackViewKey.Popular` / `.Similar`.
- [flip.ts:143](../../../apps/frontend/src/lib/motion/flip.ts) `captureFlipState`, [flip.ts:165](../../../apps/frontend/src/lib/motion/flip.ts) `animateFlipFrom` (`scale: true`, `absolute`, `nested`, `onEnter`/`onLeave`, Reduced Motion → `null`).
- [useFlipAnimation.ts:95](../../../apps/frontend/src/hooks/useFlipAnimation.ts) — `capturePosition`/`triggerReturn`/`isReturning`, `useGSAP` gekeyt auf `returnTick`.
- [AnimatedArtistColumn.tsx:97](../../../apps/frontend/src/components/share/AnimatedArtistColumn.tsx) — Container-Flip via `useGSAP`, `dependencies: [artistLoadStatus]`; rendert `ArtistTrackListCard` zweimal ([:134](../../../apps/frontend/src/components/share/AnimatedArtistColumn.tsx), [:147](../../../apps/frontend/src/components/share/AnimatedArtistColumn.tsx)).
- [constants.ts](../../../apps/frontend/src/lib/motion/constants.ts) — `MotionDuration.Grid = 0.62`, `MotionEase.McOut = "mcOut"`.
- Call-Sites des Toggles: [ArtistTrackListCard.tsx:59](../../../apps/frontend/src/components/artist/ArtistTrackListCard.tsx) (Desktop), [ArtistInfoCard.tsx:76](../../../apps/frontend/src/components/artist/ArtistInfoCard.tsx) (Mobile, `popularView` + `similarView`).
- [CcTrackDetailsSection.tsx:109](../../../apps/frontend/src/components/cards/CcTrackDetailsSection.tsx) — Label/Wert-Rows, keine Cover, kein Toggle.

## Checklist

- [ ] Alle Code-Referenzen verifiziert (Funktionen, Pfade, Komponenten, Konstanten)
- [ ] `SlideArtwork.flipId` → `data-flip-id`; `RecessedCardRoot` reicht `data-flip-id` durch
- [ ] `PopularTrack` + `ArtistTrackGridItem` geben `flipId={trackKey}` weiter
- [ ] `ArtistTrackContent` als Cross-Fade-Container (beide Ansichten während Transition, abgehende absolut + ausblendend, nur ankommende trägt `flip-id`)
- [ ] `useTrackViewMorph` kapselt Capture/Animate; Tick-gekeyt; Reduced-Motion über `animateFlipFrom`
- [ ] Verdrahtung Desktop (`ArtistTrackListCard`) + Mobile (`ArtistInfoCard`), je Popular + Similar
- [ ] Scroll-Reset-Entscheidung beim Umschalten umgesetzt
- [ ] C und CC visuell verifiziert (Popular + Similar, Desktop + Mobile)
- [ ] Reduced-Motion: harter, sofortiger Wechsel ohne Tween
- [ ] Gates grün: `test:run`, `astro check`, `pnpm lint`, `pnpm doctor:diff`
