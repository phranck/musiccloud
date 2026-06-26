# List/Grid-Slide der Artist-Track-Ansichten

Plan-Nr.: MC-057

**Goal:** Beim Umschalten Liste ↔ Raster gleiten beide Ansichten als ganze Objekte horizontal
ineinander über (Liste links, Raster rechts); die Card-Höhe bleibt fix (Grid-Höhe) mit einem
Scroll-Peek der letzten Reihe.

**Architecture:** Beide Ansichten sind in `ArtistTrackContent` dauerhaft als absolute Layer gemountet;
ein Wechsel tweent nur ihre `transform` (GSAP, `useGSAP` auf `[view]`). Kein View-Remount → kein
Cover-Flackern. Ein unsichtbarer Grid-View im Fluss verankert die Höhe; der Slide-Viewport clippt rund
auf eigenem GPU-Layer.

**Tech Stack:** React 19, Astro, GSAP 3.15 + @gsap/react, Tailwind 4, Vitest.

Spec: `docs/superpowers/specs/2026-06-24-track-view-list-grid-slide-design.md`.

## Historie: Pivot von Morph zu Slide

Ursprünglich als **Cover-Morph** (GSAP Flip, `data-flip-id` am Cover, Cross-Fade-Container,
`useTrackViewMorph`-Hook) geplant und umgesetzt (Commits `056ca11a`, `ddb7b976`, `ad59c5e2`,
`0c209b39`). Der Morph las sich nicht als sauberer, butterweicher Effekt; auf Wunsch wurde auf einen
**directional View-Slide** umgeschwenkt (`4b0cc178` ff). Der gesamte Morph-Apparat (Flip-Hook,
`flip-id`-Plumbing, die alten `PopularTrack`/`ArtistTrackGridItem`/`ArtistTrackList`/`ArtistTrackGrid`)
wurde dabei entfernt. Dieser Plan dokumentiert den finalen Slide-Stand.

## Finale Architektur

- **`ArtistTrackContent`** — hält Liste + Raster als zwei permanente, absolute Layer. `useGSAP` mit
  `dependencies: [view]` positioniert pro View: aktive bei `xPercent: 0`, andere off-screen (Liste `-100`,
  Raster `+100`). Erstlauf/Reduced-Motion snappen (`gsap.set`), ein echter Wechsel tweent (`gsap.to`,
  `0.85 s`, `power2.inOut`, `force3D`). Ein unsichtbarer Grid-View im Fluss verankert die Card-Höhe; ein
  negativer `margin-bottom` (`SCROLL_PEEK_PX = 30`) lässt die letzte Reihe angeschnitten (Scroll-Hinweis).
  Der Viewport clippt rund auf eigenem GPU-Layer (`transform-gpu` + `borderRadius: raisedControlRadius`).
- **`ArtistTrackView`** *(neu)* — eine vollständige Ansicht (Scroll-Viewport + `useGroupedCorners` + je
  Track eine `ArtistTrackCell`), mit `fillHeight`-Modus (füllt die fixe Layer-Höhe statt eigener `max-h`).
- **`ArtistTrackCell`** *(neu)* — eine Zelle für beide Darstellungen: Liste via `ArtistPanelRow`
  (`EmbossedButton`-Row-Frame) + `ArtistPanelRowText`; Raster als Cover-Kachel mit Hover-Overlay.
- **`SlideArtwork`** — `decoding`-Prop durchgereicht; Track-Cover dekodieren `sync`.
- **Verdrahtung** — `ArtistTrackListCard` (Desktop) und `ArtistInfoCard` (Mobile) geben `view` aus
  `useTrackListView` an `ArtistTrackContent` (je Popular + Similar).

## Completed (2026-06-25)

Umgesetzt und gemergt auf `main` via PR #7 (Branch `feat/track-view-cover-morph`). Relevante Commits
des Slide-Pivots und der Feinarbeit:

- `4b0cc178` — Slide statt Morph (ganze Views), `ArtistTrackView` + `ArtistTrackCell` eingeführt, alte
  Morph-Komponenten gelöscht.
- `54768b52` — ungenutztes `flip-id`-Plumbing entfernt.
- `8b19f0b8` — Slide GPU-smooth (`force3D`), Card auf Grid-Höhe fixiert.
- `cedab529` — Listen-Row-Frame (`ArtistPanelRow`) wiederhergestellt.
- `9d249eaa` — Card-Höhe −30 px Scroll-Peek.
- `e6548eee` — rundes Clipping des Slide-Viewports (eigener GPU-Layer).
- `13d1f617` — Cover-Decoding `sync`.
- `7144daa1` — beide Views permanent gemountet → kein Cover-Flackern beim Wechsel.

Verifiziert (agent-browser, Desktop, `/C10IL`): Slide horizontal in beiden Richtungen mit 0 dropped
frames; Höhe konstant (Grid-Höhe) über den Wechsel; Liste scrollt mit Peek; rundes Clipping hält
während des Slides; kein Cover-Remount beim Wechsel (Frame-Tracking). Mobile (`ArtistInfoCard`) und CC
nutzen denselben Code-Pfad (modus-agnostische Track-Views). Finale Gates grün: typecheck 0,
`pnpm lint` clean, 238 Tests, `doctor:diff` 0 issues.
