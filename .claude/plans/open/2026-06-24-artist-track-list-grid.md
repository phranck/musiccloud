# Artist-Track-Liste: protocol-driven vereinheitlichen + Grid-Ansicht

## Ziel

Die vier sichtbaren Track-Karten der Artist-Spalte — „Popular Tracks" und „Similar
Artists/Tracks", jeweils im kommerziellen und im CC-Modus — sind im Kern **eine**
Anzeige-Mechanik. Sie werden zu einer generischen, **protocol-driven** Presentation-
Komponente zusammengeführt (alle Daten kommen normalisiert von außen) und um eine
**umschaltbare Grid-Ansicht** erweitert.

## Entscheidungen (mit User abgestimmt)

- **View-Umschaltung:** pro Karte unabhängig, in `localStorage` gemerkt (wie die
  CC-Details-Karte über `usePersistedDisclosure`).
- **Grid-Spalten:** responsiv 3–4 (auto-fit nach Spaltenbreite).
- **Reichweite:** Desktop **und** mobiles Artist-Sheet.
- **Grid-Item:** nur Cover (quadratisch); bei Hover blendet unten ein Gradient mit
  Titel + Subline (Album bei Popular, Artist bei Similar) ein.
- **Paging** bleibt erhalten (im Grid mehr Items pro Seite als in der Liste).

## Das „Protocol" (normalisierte Daten von außen)

```ts
interface ArtistTrackItem {
  track: ArtistTopTrack;   // Cover, Titel, Dauer, deezerUrl (Resolve-Kandidat)
  artistLabel?: string;    // gesetzt für Similar (anderer Künstler), leer für Popular
}
```

Die Karte/Section bekommt `items: ArtistTrackItem[]` (bereits gefiltert) + Präsentations-
Config (Titel, `cardSignal`, `Skeleton`, `swapKey`, `minHeight`) + Handler + `view`. Sie
zeigt nur an — die Extraktion aus `ArtistInfoResponse` macht der Aufrufer.

## Ist-Zustand (verifiziert per Read)

- Row geteilt: `PopularTrack` — „Both Popular Tracks and Similar Tracks render it"
  ([PopularTrack.tsx:34](apps/frontend/src/components/artist/PopularTrack.tsx)).
- Liste geteilt: `ArtistPanelList`; Well + Tri-State geteilt: `ArtistSectionWell`.
- Zwei dünne Mapper: `PopularTracksSection` (tracks → row), `SimilarArtistsSection`
  (withTrack → row mit `artistLabel`) — Unterschied nur Mapping + `cardSignal`.
- Desktop: `PopularTracksCard` + `SimilarArtistsCard` (fast identisch: Extraktion,
  Skeleton, swapKey, min-h, Section), gerendert von
  [AnimatedArtistColumn](apps/frontend/src/components/share/AnimatedArtistColumn.tsx).
- Mobile: [ArtistInfoCard](apps/frontend/src/components/artist/ArtistInfoCard.tsx)
  rendert die Sektionen direkt (Titel via `ArtistSectionWell.innerTitle`, Pager unter
  dem Well).
- Shell: `ArtistCardShell` = Alias auf `SectionCardShell` (Header ist eine Flex-Row mit
  Title + Refresh-Spinner; **kein** `Header.AddOn`-Slot vorhanden).
- Toggle-Baustein: `EmbossedSegmentedControl` (icon-only Segmente, 34px), Segment-Typ
  vorhanden.

## Slices

### Slice 1 — Section vereinheitlichen (Wrapper raus)
- `ArtistTrackItem`-Typ + `toPopularItems`/`toSimilarItems`-Helper (lib).
- Neue generische `ArtistTrackList` (mappt `items` → `PopularTrack` in `ArtistPanelList`,
  optionaler `cardSignal`), ersetzt `PopularTracksSection` + `SimilarArtistsSection`.
- Die 4 Nutzungsstellen (PopularTracksCard, SimilarArtistsCard, ArtistInfoCard ×2) auf
  `ArtistTrackList` + Item-Mapping umstellen.
- Alte zwei Sections löschen.
- Gates + Browser (Liste unverändert) → Commit.

### Slice 2 — Desktop-Karten vereinheitlichen (protocol-driven)
- Neue `ArtistTrackListCard` (items + Config in, Paging/Well/Footer, reine Presentation)
  ersetzt `PopularTracksCard` + `SimilarArtistsCard`.
- `AnimatedArtistColumn`: Items extrahieren, generische Karte 2× rendern.
- Alte zwei Karten löschen.
- Gates + Browser (Desktop unverändert) → Commit.

### Slice 3 — Grid-Rendering + View-State
- `useTrackListView(storageKey)` (persisted list/grid, analog `usePersistedDisclosure`).
- `ArtistTrackGrid` + `ArtistTrackGridItem` (quadratisches Cover, Hover-Gradient unten
  mit Titel + Subline; Klick = Resolve wie die Row).
- `ArtistTrackList` rendert Liste **oder** Grid je `view`. Paging: eigene Page-Size fürs
  Grid.
- Gates + Browser (Grid testweise via Default-View) → Commit.

### Slice 4 — Toggle verdrahten (Desktop + Mobile)
- `TrackViewToggle` (EmbossedSegmentedControl, 2 Icon-Segmente Liste/Grid).
- `SectionCardShell` um optionalen `headerAddOn`-Slot (trailing im Header) erweitern.
- Desktop: Toggle im Card-Header; Mobile: Toggle in der Well-`innerTitle`-Zeile.
- View-State pro Karte/Section über `useTrackListView` mit eigenem Key.
- Gates + Browser (Umschalten Desktop + Mobile, Persistenz) → Commit.

## Checkliste
- [ ] Slice 1: Section vereinheitlicht, alte Sections gelöscht, Liste unverändert
- [ ] Slice 2: Desktop-Karten vereinheitlicht (protocol-driven), alte Karten gelöscht
- [ ] Slice 3: Grid + persisted View-State
- [ ] Slice 4: Toggle Desktop + Mobile, Persistenz
- [ ] Alle Code-Referenzen verifiziert (Typen, Hooks, Pfade)
- [ ] Gates je Slice grün (typecheck, biome, doctor); Browser-Verifikation

## Verifizierte Fakten
- `PopularTrack` props: `{ track, artistLabel?, cardSignal?, onTrackResolve?, onResolveStart? }`
  — deckt Liste beider Modi ab (Read PopularTrack.tsx).
- `ResolvedSimilarArtist` + `hasResolvedTrack` in
  [similarArtistTracks.ts](apps/frontend/src/components/artist/similarArtistTracks.ts).
- `usePagedList(items, { resetKey })` → `{ page, pageCount, canGoPrevious, canGoNext,
  goPrevious, goNext }` (Read der Karten).
- `EmbossedSegmentedControl` + `Segment<T>` (icon-only, `ariaLabel`) in
  [EmbossedSegmentedControl.tsx](apps/frontend/src/components/ui/EmbossedSegmentedControl.tsx).
- `SectionCardShell` Header = Flex-Row, **kein** AddOn-Slot → in Slice 4 ergänzen.
