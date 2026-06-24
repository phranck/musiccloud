# CC-Genre — 3 Spalten + CC-Album/Artist-Ansichten + Vollflächen-Artwork — Implementation Plan

> **Harte Produktregel:** Im CC-Modus kommt JEDES Ergebnis ausschließlich von Jamendo. **Rate-Limit-Regel:** Der CC-Pfad darf nie in Jamendos Burst-Limit laufen — alle Calls über die Drossel in `jamendoFetch`. **Sanitize-Regel:** Jamendo liefert HTML-entity-codierten Text (`R&amp;B`); jedes neue/abgeleitete Anzeige-Textfeld (Task B Album-/Artist-Spalten, Task C/D Views) muss durch `decodeHtmlEntities` (`lib/html.ts`). Die Mapper `mapJamendoTrack/Album/Artist` dekodieren bereits — über die Mapper abgeleitete Daten sind abgedeckt.

**Goal:** Die CC-Genre-Suche liefert 3 Spalten (Tracks/Alben/Artists) **identisch zur kommerziellen** Darstellung; Track-Klick → CC-Track-Seite, **Album-Klick → CC-Album-Ansicht, Artist-Klick → CC-Artist-Ansicht** (neue Views, Jamendo-gespeist). Tile-Artwork = vollflächiges Jamendo-Cover + Name oben links (statt Spotify-Composite). Rate-Limit-Drossel.

## Status / erledigt

- [x] **Rate-Limit-Drossel** (`throttleJamendo` in `services/cc/jamendo/client.ts`): seriell, Mindestabstand `JAMENDO_MIN_GAP_MS` (Default 350 ms, env-overridable, Tests = 0). Jeder Jamendo-Call läuft durch. Mit permanentem `genre_artworks`-Cache ⇒ Cover-Fetch nur einmal pro Genre.

---

## Task A: CC-Tile-Artwork (Composite + größeres Thumbnail) — erledigt

**Endgültige Entscheidung (revidiert):** CC-Kacheln nutzen die **kommerzielle Composite-Komposition** (Flächenfarbe in der Cover-Durchschnittsfarbe + Name oben links eingebrannt + rotiertes Cover-Thumbnail unten rechts), aber mit **größerem Thumbnail**. Der zwischenzeitliche Vollflächen-Ansatz (`generateCoverTileArtwork` + Scrim, Commit `aba7274`) wurde verworfen — der User wollte „die gleiche Composition wie kommerziell, **aber** das Cover etwas größer" (Commit `c64e6f0`).

- [x] `generateArtwork` um optionalen `coverSize`-Param erweitert (Default `COVER_SIZE`=320); `ensureArtwork` reicht ihn durch; CC-Route übergibt `CC_THUMB_SIZE`=400. Die kommerzielle Route ruft ohne Param → unverändert. Die Vollflächen-Funktion wurde wieder entfernt (Dead Code).
- [x] `CC_ARTWORK_VERSION` = 4; alte `cc:*`-Artworks gepurgt → Regeneration im Composite-Stil.
- [x] Browser verifiziert: Composite mit prominentem, größerem Cover-Thumb unten rechts; Name oben links; kommerziell unverändert.

## Task B: 3-Spalten-Genre-Suche (aus den Genre-Tracks abgeleitet)

`runCcGenreSearch` baut alle 3 Spalten aus **einer** `/tracks?tags=`-Query (rate-limit-freundlich) plus einem `/artists?id=`-Nachschlag für Artist-Bilder.

- [x] `runCcGenreSearch`: aus den Genre-Tracks ableiten — **tracks** (wie bisher), **albums** (unique nach `album_id`: `album_name` + `album_image`), **artists** (unique nach `artist_id`: `artist_name`). Artist-Bilder per einem `getCcArtistsByIds(ids)` → `GET /artists?id=<id1>+<id2>…` (filtert per id, nicht per Tag).
- [x] Map auf `ApiGenreTrackCandidate` (id `jamendo:<id>`), `ApiGenreAlbumCandidate` (id **`jamendo-album:<id>`**, `webUrl` = Jamendo-Album-Shareurl, `artworkUrl`), `ApiGenreArtistCandidate` (id **`jamendo-artist:<id>`**, `imageUrl`, `webUrl`). Counts an die kommerziellen Defaults angleichen (statt fix 10).
- [x] `query`-Echo: `albums`/`artists` nicht mehr `null`. Test anpassen.

## Scheibe-1-Entscheidung (entschieden 2026-06-21): teilbar mit Persist

CC-Album/Artist-Ansichten sind **teilbar** — die Resolve-Response trägt `id` + `shortUrl` wie `cc-track`, die Entity wird persistiert. Umgesetzt nach dem **kommerziellen Muster** (separate Short-URL-Tabelle pro Typ: `short_urls`/`album_short_urls`/`artist_short_urls`):

- **Schema (Migration 0044):** neue Tabellen `cc_album_short_urls` (`cc_album_id` UNIQUE → `cc_albums.id`) + `cc_artist_short_urls` (`cc_artist_id` UNIQUE → `cc_artists.id`), 1:1 zu `cc_short_urls`. `cc_albums`/`cc_artists` existieren bereits (Upserts in `persistCcTrack`).
- **Persist-Strategie (KISS/YAGNI):** Album-Resolve persistiert **nur die Album-Entity** (+ minimaler Artist-Upsert für den FK) und mintet die Album-short-url. Die Trackliste reist **live** als `ApiCcTrack[]` mit, wird **nicht** mitpersistiert — Track-Klick feuert den bestehenden `jamendo:<id>`-Flow (lazy Track-Persist). Artist-Resolve analog (Top-Tracks live).
- **Nicht in Scheibe 1:** Share-Page-Konsumierung (`findCcAlbum/ArtistByShortId` + Render) — wie beim cc-track-Flow, der die short-url eager mintet, aber noch keine Share-Route konsumiert.

## Task C: CC-Album-Resolve + Ansicht

- [x] Wire-Type `ApiCcAlbum` (`packages/shared/src/api.ts`): Album-Felder + `tracks: ApiCcTrack[]`. Response `CcAlbumResolveSuccessResponse` (`type: "cc-album"`, mit `id` + `shortUrl`).
- [x] Client: `getCcAlbumTracks(albumId)` via `GET /tracks?album_id=<id>` (live bestätigt). Repo: `persistCcAlbum` (upsert Artist + Album, mint `cc_album_short_urls`) → `{ ccAlbumId, shortId }`.
- [x] Backend: `resolveCcCandidate` (diskriminiertes Union) erkennt `jamendo-album:<id>` → `getCcAlbum(id)` + `getCcAlbumTracks(id)`; Route persistiert Album + shaped `cc-album`-Response.
- [x] Frontend (Scheibe 3): `parseCcAlbumResolveResponse` + neue `CcAlbumView` (Album-Header + Trackliste, je Track abspielbar / klickbar zur CC-Track-Seite). An `CcMediaCard` orientieren.

## Task D: CC-Artist-Resolve + Ansicht

- [x] Wire-Type `ApiCcArtist` + `CcArtistResolveSuccessResponse` (`type: "cc-artist"`, mit `id` + `shortUrl`): Artist-Felder + `topTracks: ApiCcTrack[]`.
- [x] Client: `getCcArtistTopTracks(artistId)` via `GET /tracks?artist_id=<id>&order=popularity_total`. Repo: `persistCcArtist` (upsert Artist, mint `cc_artist_short_urls`) → `{ ccArtistId, shortId }`.
- [x] Backend: `resolveCcCandidate` erkennt `jamendo-artist:<id>` → `getCcArtist(id)` + `getCcArtistTopTracks(id)`; Route persistiert Artist + shaped `cc-artist`-Response.
- [x] Frontend (Scheibe 3): `CcArtistView` (Artist-Header + Top-Tracks).

## Task E: Klick-Routing + Verifikation

- [x] `handleSelectGenreResult` (CC-Modus): `selectedCandidate: id` an den CC-Endpoint; Response-Branch nach `type` (`cc-track`/`cc-album`/`cc-artist`) → passende View dispatchen. Kommerzieller Pfad unverändert.
- [x] CC-Resolve-Route: Candidate-Parsing nach Prefix (`jamendo:` Track, `jamendo-album:` Album, `jamendo-artist:` Artist). Response-Schema um die 3 Formen erweitern.
- [x] Browser: `genre: jazz` (CC) → 3 Spalten; Track-Klick → CC-Track-Seite; Album-Klick → CC-Album-Ansicht (Trackliste); Artist-Klick → CC-Artist-Ansicht. Kommerziell unverändert. Gates grün.

---

## Verified facts (Plan-write-time)
- `getCcAlbum(jamendoId): Promise<CcAlbum|null>` (client.ts:232), `getCcArtist` (client.ts:245). `CcAlbum`/`CcArtist` haben KEINE Trackliste → Tracks separat holen.
- `GenreSearchResults.onSelect(webUrl, id)` wird für Track/Album/Artist gleich aufgerufen (`GenreSearchResults.tsx:137/168/193`) → einheitliches Klick-Routing über `id`-Prefix.
- `ApiGenreAlbumCandidate`/`ApiGenreArtistCandidate` (api.ts:115/124); `ResolveGenreSearchResponse.results.{albums,artists}` (api.ts:147/148).
- Generator-Helfer in `services/genre-artwork/generator.ts` (`drawGenreText`, `fillPath`, `buildShadow`, `TEXT_X=32`/`TEXT_TOP_Y=32`); `ensureArtwork`/`getCachedArtwork` in `services/genre-artwork/index.ts`; CC-Route `routes/cc-genre-artwork.ts`; `CC_ARTWORK_VERSION` in `services/cc/cc-genre.ts`.
- **Jamendo-Endpoints bestätigt (live, sparsam):** `/tracks?album_id=<id>` liefert die Album-Tracks; `/tracks?artist_id=<id>&order=popularity_total` die Artist-Top-Tracks. `/artists?id=<id1>+<id2>+<id3>` liefert mehrere Artists in EINEM Call (2026-06-21 live bestätigt: status success, count 3) — **Reihenfolge NICHT request-konform** (per id zuordnen, nicht per Position); `image` kann pro Artist fehlen. (Nicht erneut proben — Rate-Limit.)
- **CC-Resolve-Architektur (bestätigt):** `cc-resolver.ts` — `CC_CANDIDATE_PREFIX = "jamendo:"`, `ccCandidateId(id)`, `parseCcCandidateId(candidateId)`, `resolveCcSelectedCandidate(candidateId) → getCcTrack`. Für Album/Artist: neue Prefixes `jamendo-album:`/`jamendo-artist:` + `parse`-Varianten + Resolver-Branches + `getCcAlbumTracks`/`getCcArtistTopTracks` im Client. Route-Handler (`routes/cc-resolve.ts:106-111`) verzweigt heute nur auf Track → um Album/Artist erweitern. `CcMediaCard`-Struktur als Vorlage für die neuen Views.

## Checklist
- [x] Alle Code-Refs am Execute re-verifiziert (Funktionen, Pfade, Jamendo-Params, Schema).
- [x] Jamendo-Probes am Execute nur einzeln + mit Pause (Rate-Limit-Regel).

---

## Completed (2026-06-21)

In drei vertikalen Scheiben umgesetzt, jede mit grünen Gates (typecheck · vitest · biome · doctor:diff) und eigenem Commit:

- **Scheibe 1 — Backend CC-Album/Artist-Resolve mit Persist** (Commit `8ece9ac`): Migration `0044` (neue Tabellen `cc_album_short_urls` / `cc_artist_short_urls` nach dem kommerziellen Per-Typ-Muster), `persistCcAlbum`/`persistCcArtist` + `mintCcShortUrl`-Helfer, Wire-Types `ApiCcAlbum`/`ApiCcArtist` + `cc-album`/`cc-artist`-Responses, `getCcAlbumTracks`/`getCcArtistTopTracks`, `resolveCcCandidate` (diskriminiertes Union), Route-Switch. Resolver-Unit + Persist-Integration-Tests.
- **Scheibe 2 — 3-Spalten-Genre-Suche (Task B)** (Commit `91827f6`): `runCcGenreSearch` leitet Album-/Artist-Spalten aus einer `/tracks?tags=`-Query ab; `getCcArtistsByIds` (`/artists?id=…`) reichert die Artist-Spalte an (Zuordnung per id, Jamendo reordert); `ccAlbumCandidateId`/`ccArtistCandidateId`-Builder. Per-Typ-Counts steuern jede Spalte. Client- + Genre-Tests.
- **Scheibe 3 — Frontend CC-Album/Artist-Views + Klick-Routing (Tasks C/D/E)** (Commit `efd41c4`): generische `CcEntityCard` (Header + klickbare Trackliste, Row-Chrome aus der Genre-Suche wiederverwendet), `parseCcAlbumResolveResponse`/`parseCcArtistResolveResponse` + `CcResult`-Union, `dispatchCcResult` (parser-Wahl per Discriminant) + `handleSelectCcTrack`, `CcResultView` dispatcht nach Entity-kind, `CcResultType`-Namespace + `CC_TRACK_CANDIDATE_PREFIX`, en/de-Strings.

**Browser-verifiziert** (agent-browser): `genre: jazz` (CC) → 3 Spalten (Tracks/Alben/Artists); Album-Klick → CC-Album-Ansicht (Header + Trackliste) → Track-Klick → CC-Track-Seite; Artist-Klick → CC-Artist-Ansicht (Top Tracks) → Track-Klick → CC-Track-Seite. Kommerzieller Pfad unverändert (Disambiguation → Result mit allen Plattform-Links + Artist-Info).

**Bewusst nicht umgesetzt (YAGNI):** Vollflächen-Tile-Artwork (Goal-Zeile) — durch Task A (Composite + größeres Thumbnail) ersetzt; CC-Album/Artist-Share-Page-Konsumierung (`findCcAlbum/ArtistByShortId` + Render) — short-urls werden eager gemintet, eine Share-Route konsumiert sie noch nicht (wie beim cc-track-Flow).
