# Spec: List/Grid-Slide der Artist-Track-Ansichten

**Datum:** 2026-06-24
**Status:** Umgesetzt und gemergt (PR #7)

> **Hinweis zur Historie:** Ursprünglich war ein *Cover-Morph* geplant (jedes Cover morpht
> per GSAP Flip von seiner Listen- an seine Rasterposition). In der Umsetzung hat sich das
> nicht als sauberer, butterweicher Morph lesen lassen; auf Wunsch wurde auf einen
> **directional View-Slide** umgeschwenkt. Diese Spec beschreibt den umgesetzten Slide.

## Kontext

Jede Artist-Track-Sektion (die eigenen *Popular Tracks* und die *Similar-Artist Tracks*) lässt sich zwischen einer Listen- und einer Rasteransicht umschalten. Der Umschalter ([TrackViewToggle.tsx](../../../apps/frontend/src/components/artist/TrackViewToggle.tsx)) sitzt im Card-Header; die Auswahl wird pro Sektion in `localStorage` gehalten ([useTrackListView.ts](../../../apps/frontend/src/hooks/useTrackListView.ts)).

Beide Ansichten zeigen dieselben Tracks über dieselbe Zelle ([ArtistTrackCell.tsx](../../../apps/frontend/src/components/artist/ArtistTrackCell.tsx)) und dasselbe Cover ([SlideArtwork.tsx](../../../apps/frontend/src/components/ui/SlideArtwork.tsx)): in der Liste eine Row (Cover 48 px + Titel/Sublabel/Dauer), im Raster eine quadratische Cover-Kachel mit Hover-Overlay.

## Ziel

Beim Umschalten zwischen Liste und Raster **gleiten die beiden Ansichten als ganze Objekte horizontal** ineinander über, statt hart zu wechseln. Im Toggle sitzt das List-Icon links, das Grid-Icon rechts; der Slide folgt dieser Geometrie:

- **Liste → Raster:** die Liste schiebt nach links aus dem sichtbaren Bereich, das Raster kommt gleichzeitig von rechts herein.
- **Raster → Liste:** umgekehrt.

Das gilt für **beide Sektionen** (Popular + Similar), **beide Viewports** (Desktop und Mobile) und damit **beide Modi** (kommerziell und Creative Commons) — Letzteres automatisch, weil die Track-Ansichten modus-agnostisch sind und keine CC-eigenen Track-View-Komponenten existieren.

## Verhalten

### Slide

- Beide Ansichten liegen als absolute Layer übereinander. Die aktive ruht bei `xPercent: 0`, die andere wartet off-screen (Liste links bei `-100`, Raster rechts bei `+100`). Ein Wechsel tweent nur die `transform` beider Layer.
- Easing/Dauer: `power2.inOut` über `0.85 s` — eine symmetrische Kurve (sanft anlaufen, sanft ausklingen), damit der Ganz-Ansicht-Move wie ein gleitendes Objekt liest statt wie ein Schnapper. (Die front-loaded Control-Kurve `MotionEase.McOut` wirkte für diese große Translation „zu schnell".)
- Rein compositor-basiert (`transform` auf GPU-Layern via `force3D`); keine Layout-Properties pro Frame animiert.
- **Reduced Motion:** kein Tween — sofortiger, harter Wechsel.

### Fixe Card-Höhe mit Scroll-Peek

- Die Card-Höhe ist **fix auf die Höhe der Rasteransicht** verankert und ändert sich beim Umschalten nicht. Realisiert über einen unsichtbaren Grid-View im Fluss (Höhen-Anker); die sichtbaren Layer liegen absolut darauf und füllen die Höhe (`fillHeight`). Die Liste scrollt innerhalb dieser fixen Höhe.
- Vom Anker werden `30 px` abgezogen (negativer `margin-bottom`), sodass in **beiden** Ansichten die letzte Reihe angeschnitten bleibt — ein stehender Scroll-Hinweis („da kommt noch mehr").

### Rundes Clipping während des Slides

- Der Slide-Viewport clippt selbst rund, auf eigenem Compositing-Layer (`transform-gpu` + `border-radius` = `raisedControlRadius`). Die `border-radius`-Clipping der umgebenden well allein greift während des Slides nicht, weil die GPU-Layer der slidenden Views das Clipping eines Vorfahren umgehen, solange die Clipping-Box nicht selbst ein GPU-Layer ist.

### Auslöser

Nur der Klick auf den `TrackViewToggle`. Kein Slide bei Erst-Render/Hydration (der erste Lauf positioniert ohne Animation) und kein Slide beim Skeleton→Content-Wechsel (das ist der separate Column-Flip in [AnimatedArtistColumn.tsx](../../../apps/frontend/src/components/share/AnimatedArtistColumn.tsx)).

## Architektur

### Permanente Layer (kein Remount → kein Cover-Flackern)

[ArtistTrackContent.tsx](../../../apps/frontend/src/components/artist/ArtistTrackContent.tsx) hält **beide** Ansichten dauerhaft gemountet (zwei absolute Layer). Ein Wechsel mountet keine View neu — er tweent nur ihre Positionen. Das ist der Kern gegen das Cover-Flackern: würde die abgehende View beim Wechsel neu gemountet, würden ihre frisch eingehängten Cover an sichtbarer Position neu painten und kurz „aufblitzen".

Die Positionierung läuft über ein `useGSAP` mit `dependencies: [view]`:

- ein `prevViewRef` unterscheidet Erstlauf/Reduced-Motion (snap via `gsap.set`) von einem echten Wechsel (Tween via `gsap.to`);
- die aktive View → `xPercent: 0`, die andere → off-screen (Liste `-100`, Raster `+100`).

### Höhen-Anker + `fillHeight`

- Ein unsichtbarer Grid-View im Fluss ([ArtistTrackView.tsx](../../../apps/frontend/src/components/artist/ArtistTrackView.tsx) mit `view=Grid`, `aria-hidden`, `invisible`) gibt der Card die Grid-Höhe; sein negativer `margin-bottom` von `SCROLL_PEEK_PX` (30 px) erzeugt den Scroll-Peek.
- `ArtistTrackView` erhält eine `fillHeight`-Prop: im Layer-Modus füllt der Scroll-Viewport die vorgegebene fixe Höhe (`h-full` bzw. `h-[calc(100%-4px)]` im Grid wegen dessen 2 px Eigen-Inset) statt seiner eigenen `max-height`.

### Eine Zelle für beide Darstellungen

[ArtistTrackCell.tsx](../../../apps/frontend/src/components/artist/ArtistTrackCell.tsx) rendert einen Track wahlweise als Listen-Row oder Raster-Kachel:

- **Liste:** die geteilte [ArtistPanelRow](../../../apps/frontend/src/components/artist/ArtistPanelRow.tsx) (ein `EmbossedButton` mit erhabenem Row-Frame + token-getriebener Chrome, identisch zu den kommerziellen Candidate-Rows) plus [ArtistPanelRowText](../../../apps/frontend/src/components/artist/ArtistPanelRowText.tsx).
- **Raster:** das Cover ist die Kachel; Titel/Sublabel erscheinen als Bottom-Overlay bei Hover/Fokus.

Grouped Corners (gerundete Außenecken der Row-/Kachel-Gruppe) kommen aus [useGroupedCorners](../../../apps/frontend/src/components/cards/useGroupedCorners.ts) (layout-agnostisch: rundet in der Liste die erste/letzte Row, im Raster die vier Eckkacheln).

### Cover-Decoding

[SlideArtwork.tsx](../../../apps/frontend/src/components/ui/SlideArtwork.tsx) reicht eine `decoding`-Prop an [CoverImage](../../../apps/frontend/src/components/ui/CoverImage.tsx) durch; die Track-Cover dekodieren synchron (`decoding="sync"`), damit ein bereits gecachtes Cover im ersten Frame steht.

## Betroffene Komponenten

- `apps/frontend/src/components/artist/ArtistTrackContent.tsx` — Host mit permanenten Layern, GSAP-Positionierung pro View, Höhen-Anker + Peek, rundes Clipping.
- `apps/frontend/src/components/artist/ArtistTrackView.tsx` *(neu)* — eine vollständige Ansicht (Scroll-Viewport + Grouped Corners + Zellen), mit `fillHeight`-Modus.
- `apps/frontend/src/components/artist/ArtistTrackCell.tsx` *(neu)* — eine Zelle für Row und Kachel.
- `apps/frontend/src/components/ui/SlideArtwork.tsx` — `decoding`-Prop durchgereicht.
- `apps/frontend/src/components/artist/ArtistTrackListCard.tsx` (Desktop) und `ArtistInfoCard.tsx` (Mobile) — verdrahten `useTrackListView` an `ArtistTrackContent` (je Popular + Similar).

## Out of Scope

- [CcTrackDetailsSection.tsx](../../../apps/frontend/src/components/cards/CcTrackDetailsSection.tsx) — eine Label/Wert-Liste ohne Cover und ohne List/Grid-Toggle; nicht betroffen.
- Die interne CD-Slot-Resolve-Animation von `SlideArtwork` bleibt unverändert.
- Andere List-Ansichten außerhalb der Artist-Track-Sektionen (es existieren keine weiteren List/Grid-Toggles).

## Verifizierte Fakten (Stand 2026-06-25, gegen Repo gelesen)

- `ArtistTrackContent.tsx` — `SLIDE_DURATION = 0.85`, `SLIDE_EASE = "power2.inOut"`, `SCROLL_PEEK_PX = 30`; permanente Layer für `[List, Grid]`, `useGSAP` mit `dependencies: [view]`; Viewport `transform-gpu` + `borderRadius: raisedControlRadius`.
- `ArtistTrackView.tsx` — `fillHeight`-Prop; Scroll-Viewport `overflow-y-auto`, `useGroupedCorners({ frameSelector: ".recessed-gradient-border", frameInset: isGrid ? 0 : 4, fillFrame: isGrid })`.
- `ArtistTrackCell.tsx` — Liste via `ArtistPanelRow` + `ArtistPanelRowText`, Raster als Cover-Kachel + Overlay; `SlideArtwork … decoding="sync"`.
- `SlideArtwork.tsx` — `decoding?: "async" | "sync" | "auto"` → `CoverImage`.
- `useTrackListView.ts` — `[view, setView]`, localStorage, SSR-safe; `TrackListView = { List: "list", Grid: "grid" }`.
- `cardGeometry.ts` — `raisedControlRadius = calc(recessedSurfaceRadius - recessedControlInset)`.
- Call-Sites: `ArtistTrackListCard.tsx` (Desktop), `ArtistInfoCard.tsx` (Mobile, `popularView` + `similarView`).
