# CC-Genre — 3 Spalten + CC-Album/Artist-Ansichten + Vollflächen-Artwork — Implementation Plan

> **Harte Produktregel:** Im CC-Modus kommt JEDES Ergebnis ausschließlich von Jamendo. **Rate-Limit-Regel:** Der CC-Pfad darf nie in Jamendos Burst-Limit laufen — alle Calls über die Drossel in `jamendoFetch`. **Sanitize-Regel:** Jamendo liefert HTML-entity-codierten Text (`R&amp;B`); jedes neue/abgeleitete Anzeige-Textfeld (Task B Album-/Artist-Spalten, Task C/D Views) muss durch `decodeHtmlEntities` (`lib/html.ts`). Die Mapper `mapJamendoTrack/Album/Artist` dekodieren bereits — über die Mapper abgeleitete Daten sind abgedeckt.

**Goal:** Die CC-Genre-Suche liefert 3 Spalten (Tracks/Alben/Artists) **identisch zur kommerziellen** Darstellung; Track-Klick → CC-Track-Seite, **Album-Klick → CC-Album-Ansicht, Artist-Klick → CC-Artist-Ansicht** (neue Views, Jamendo-gespeist). Tile-Artwork = vollflächiges Jamendo-Cover + Name oben links (statt Spotify-Composite). Rate-Limit-Drossel.

## Status / erledigt

- [x] **Rate-Limit-Drossel** (`throttleJamendo` in `services/cc/jamendo/client.ts`): seriell, Mindestabstand `JAMENDO_MIN_GAP_MS` (Default 350 ms, env-overridable, Tests = 0). Jeder Jamendo-Call läuft durch. Mit permanentem `genre_artworks`-Cache ⇒ Cover-Fetch nur einmal pro Genre.

---

## Task A: Vollflächen-Cover-Artwork (Name oben links)

CC-Kacheln sollen das Jamendo-Cover vollflächig zeigen + Name oben links eingebrannt (gleiche Schrift/Größe/Position wie kommerziell), NICHT den Composite (Flat-Color + rotiertes Mini-Cover).

- [ ] Neue Funktion in `services/genre-artwork/generator.ts`, z. B. `generateCoverTileArtwork(displayName, coverBuffer): Promise<Buffer>` — Cover auf 512² cover-fit (center-crop), oben ein dunkler Legibility-Scrim (Gradient), Name oben links via vorhandenem `drawGenreText` in Weiß (gleiche `TEXT_X`/`TEXT_TOP_Y`/Font/Größen). Interne Helfer (`fillPath`, `drawGenreText`, `buildShadow`) wiederverwenden. **Commercial `generateArtwork` unverändert lassen.**
- [ ] CC-Artwork-Pfad auf die neue Funktion umstellen: entweder eine CC-Variante von `ensureArtwork` oder ein `style`-Param. Nur die **CC**-Route (`routes/cc-genre-artwork.ts`) nutzt den Cover-Stil; die kommerzielle Route bleibt beim Composite. Bei null-Cover Fallback wie bisher (Flat-Color + Name).
- [ ] `CC_ARTWORK_VERSION` auf 3 bumpen (neuer Render) + alte `cc:*`-Rows löschen (Regeneration).
- [ ] Browser: CC-Kacheln zeigen Cover vollflächig + Name oben links, lesbar (Scrim), keine 404er.

## Task B: 3-Spalten-Genre-Suche (aus den Genre-Tracks abgeleitet)

`runCcGenreSearch` baut alle 3 Spalten aus **einer** `/tracks?tags=`-Query (rate-limit-freundlich) plus einem `/artists?id=`-Nachschlag für Artist-Bilder.

- [ ] `runCcGenreSearch`: aus den Genre-Tracks ableiten — **tracks** (wie bisher), **albums** (unique nach `album_id`: `album_name` + `album_image`), **artists** (unique nach `artist_id`: `artist_name`). Artist-Bilder per einem `getCcArtistsByIds(ids)` → `GET /artists?id=<id1>+<id2>…` (filtert per id, nicht per Tag).
- [ ] Map auf `ApiGenreTrackCandidate` (id `jamendo:<id>`), `ApiGenreAlbumCandidate` (id **`jamendo-album:<id>`**, `webUrl` = Jamendo-Album-Shareurl, `artworkUrl`), `ApiGenreArtistCandidate` (id **`jamendo-artist:<id>`**, `imageUrl`, `webUrl`). Counts an die kommerziellen Defaults angleichen (statt fix 10).
- [ ] `query`-Echo: `albums`/`artists` nicht mehr `null`. Test anpassen.

## Task C: CC-Album-Resolve + Ansicht

- [ ] Wire-Type `ApiCcAlbum` (`packages/shared/src/api.ts`): Album-Felder + `tracks: ApiCcTrack[]`. Response `CcAlbumResolveSuccessResponse` (`type: "cc-album"`).
- [ ] Backend: `resolveCcSelectedCandidate`/Route erkennt `jamendo-album:<id>` → `getCcAlbum(id)` + Album-Tracks via `searchCcTracks`-analog `GET /tracks?album_id=<id>` → persistieren (falls nötig) + Response. (Jamendo `/tracks?album_id=` am Execute mit EINEM Call verifizieren.)
- [ ] Frontend: `parseCcAlbumResolveResponse` + neue `CcAlbumView` (Album-Header + Trackliste, je Track abspielbar / klickbar zur CC-Track-Seite). An `CcMediaCard` orientieren.

## Task D: CC-Artist-Resolve + Ansicht

- [ ] Wire-Type `ApiCcArtist` + `CcArtistResolveSuccessResponse` (`type: "cc-artist"`): Artist-Felder + `topTracks: ApiCcTrack[]`.
- [ ] Backend: Route erkennt `jamendo-artist:<id>` → `getCcArtist(id)` + Top-Tracks via `GET /tracks?artist_id=<id>&order=popularity_total` → Response.
- [ ] Frontend: `CcArtistView` (Artist-Header + Top-Tracks).

## Task E: Klick-Routing + Verifikation

- [ ] `handleSelectGenreResult` (CC-Modus): `selectedCandidate: id` an den CC-Endpoint; Response-Branch nach `type` (`cc-track`/`cc-album`/`cc-artist`) → passende View dispatchen. Kommerzieller Pfad unverändert.
- [ ] CC-Resolve-Route: Candidate-Parsing nach Prefix (`jamendo:` Track, `jamendo-album:` Album, `jamendo-artist:` Artist). Response-Schema um die 3 Formen erweitern.
- [ ] Browser: `genre: jazz` (CC) → 3 Spalten; Track-Klick → CC-Track-Seite; Album-Klick → CC-Album-Ansicht (Trackliste); Artist-Klick → CC-Artist-Ansicht. Kommerziell unverändert. Gates grün.

---

## Verified facts (Plan-write-time)
- `getCcAlbum(jamendoId): Promise<CcAlbum|null>` (client.ts:232), `getCcArtist` (client.ts:245). `CcAlbum`/`CcArtist` haben KEINE Trackliste → Tracks separat holen.
- `GenreSearchResults.onSelect(webUrl, id)` wird für Track/Album/Artist gleich aufgerufen (`GenreSearchResults.tsx:137/168/193`) → einheitliches Klick-Routing über `id`-Prefix.
- `ApiGenreAlbumCandidate`/`ApiGenreArtistCandidate` (api.ts:115/124); `ResolveGenreSearchResponse.results.{albums,artists}` (api.ts:147/148).
- Generator-Helfer in `services/genre-artwork/generator.ts` (`drawGenreText`, `fillPath`, `buildShadow`, `TEXT_X=32`/`TEXT_TOP_Y=32`); `ensureArtwork`/`getCachedArtwork` in `services/genre-artwork/index.ts`; CC-Route `routes/cc-genre-artwork.ts`; `CC_ARTWORK_VERSION` in `services/cc/cc-genre.ts`.
- **Am Execute zu verifizieren (je EIN Jamendo-Call, mit Pause):** `/tracks?album_id=<id>` (Album-Tracks), `/tracks?artist_id=<id>&order=popularity_total` (Artist-Top-Tracks), `/artists?id=<id1>+<id2>` (Artist-Bilder). CC-Resolve-Route Candidate-Parsing (`cc-resolver.ts`/`routes/cc-resolve.ts`). `CcMediaCard`-Struktur als Vorlage für die neuen Views.

## Checklist
- [ ] Alle Code-Refs am Execute re-verifiziert (Funktionen, Pfade, Jamendo-Params, Schema).
- [ ] Jamendo-Probes am Execute nur einzeln + mit Pause (Rate-Limit-Regel).
