# CC-Pfad — Genre-Discovery (100% Jamendo) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`. **Harte Produktregel:** Im CC-Modus kommt JEDES Ergebnis ausschließlich von Jamendo — kein Last.fm, kein Deezer, kein kommerzieller Fallback.

**Goal:** CC-natives Genre-Browse + Genre-Suche, ausschließlich aus Jamendo. `genre:?` im CC-Modus zeigt Jamendos Genre-Kacheln (aus `/radios`); `genre: <name>` listet Jamendo-Tracks des Genres; ein Klick öffnet die CC-Track-Seite. Ersetzt die (falsche) Abkürzung, die CC-Genre auf den kommerziellen Endpoint routete.

**Architecture:** Spiegelt das kommerzielle Genre-Muster strukturgleich, aber Jamendo-gespeist. Browse-Quelle = `GET /radios` (Jamendos kuratierte Genre-Stationen, name/dispname/image). Suche = `GET /tracks?tags=<genre>`. Response-Shapes werden wiederverwendet (`ApiGenreTile`, `ResolveGenreSearchResponse`), sodass die bestehenden Frontend-Komponenten (`GenreBrowseGrid`, `GenreSearchResults`) unverändert rendern — nur die Daten kommen aus Jamendo. Der CC-Modus routet ALLE Queries (inkl. genre) an `/api/v1/cc/resolve`; die kommerzielle Genre-Abkürzung im Frontend wird zurückgenommen.

**Scope (V1 dieser Runde):** Genre-Browse (Jamendo `/radios`) + Genre-Suche **Tracks-Spalte** (Jamendo `/tracks?tags=`). Track-Klick → CC-Track-Seite (existiert). Album-/Künstler-Spalten in CC-Genre sind zurückgestellt, bis CC-Album-/Künstler-Seiten existieren — bewusst weggelassen statt kommerzielle Daten zu zeigen (Regel: nur Jamendo). `parseGenreQuery` wird wiederverwendet (DRY); für CC werden nur Tracks gefetcht.

**Backend-Voraussetzung (erfüllt):** `JAMENDO_CLIENT_ID` gesetzt; `/radios`, `/tracks?tags=` live verifiziert. Jamendo-Client + CC-Resolve-Route existieren (Plan 1/2).

---

## File Structure

- **Modify:** `apps/backend/src/services/cc/jamendo/types.ts` — `JamendoRadioRaw`, `CcGenre`.
- **Modify:** `apps/backend/src/services/cc/jamendo/client.ts` — `getCcGenres()` (GET /radios + Mapper).
- **Create:** `apps/backend/src/services/cc/cc-genre.ts` — `runCcGenreBrowse()`, `runCcGenreSearch()`.
- **Modify:** `apps/backend/src/routes/cc-resolve.ts` — Genre-Flows im Handler (browse/search) vor dem Text-Search-Flow.
- **Modify:** `apps/frontend/src/hooks/useAppState.ts` — Abkürzung zurücknehmen (CC-Genre → CC-Endpoint); `handleSelectGenreResult` mode-aware (CC → `selectedCandidate` an CC-Endpoint).

---

## Task 1: Jamendo-Genres aus /radios (Client + Typen)

**Files:** `types.ts`, `client.ts`, test.

- [ ] **Step 1 (types.ts):** ergänzen:
```typescript
/** Raw radio object from `GET /v3.0/radios` (Jamendo's curated genre stations). */
export interface JamendoRadioRaw {
  id: string;
  name: string; // tag key, e.g. "jazz"
  dispname: string; // display name, e.g. "Jazz Radio"
  image: string;
}

/** A Jamendo genre (from a radio station) for the CC browse grid. */
export interface CcGenre {
  name: string; // the tag used in `tags=` search, e.g. "jazz"
  displayName: string; // cleaned for the UI, e.g. "Jazz"
  imageUrl?: string;
}
```

- [ ] **Step 2 (client.ts):** `getCcGenres()` anhängen — `jamendoFetch<JamendoRadioRaw>("/radios", { limit: 50 })`, mappen, `"bestof"` ausschließen (kein Genre), `displayName` = `dispname` ohne trailing `" Radio"` (sonst `dispname`). TSDoc.
```typescript
export async function getCcGenres(): Promise<CcGenre[]> {
  const raw = await jamendoFetch<JamendoRadioRaw>("/radios", { limit: 50 });
  return raw
    .filter((r) => r.name !== "bestof")
    .map((r) => ({
      name: r.name,
      displayName: r.dispname.replace(/\s*Radio$/i, "").trim() || r.dispname,
      imageUrl: r.image || undefined,
    }));
}
```

- [ ] **Step 3:** Unit-Test (gestubbtes fetch) in `client.test.ts`: `getCcGenres` mappt radios, schließt `bestof` aus, bereinigt `" Radio"`. Run `pnpm --filter @musiccloud/backend test:run src/services/cc/jamendo/__tests__/client.test.ts`.

- [ ] **Step 4:** typecheck + `biome check --write` + commit `Feat: add Jamendo getCcGenres (radios as genre list)`.

---

## Task 2: CC-Genre-Service (browse + track-search)

**Files:** `apps/backend/src/services/cc/cc-genre.ts` (neu), test.

Lies `apps/backend/src/services/genre-search/index.ts` (`runGenreBrowse`/`runGenreSearch`) + `parser.ts` (`parseGenreQuery`, `isGenreBrowseQuery`, `isGenreSearchQuery`) + `packages/shared/src/api.ts` (`ApiGenreTile`, `ResolveGenreSearchResponse`, `ApiGenreTrackCandidate`) als Vorlage.

- [ ] **Step 1 (cc-genre.ts):**
  - `runCcGenreBrowse(): Promise<ResolveGenreBrowseResponse>` — `getCcGenres()` → `genres: ApiGenreTile[]` (`name`, `displayName`, `artworkUrl = imageUrl ?? ""`; kein accentColor). `{ status: "genre-browse", genres }`.
  - `runCcGenreSearch(query: string): Promise<ResolveGenreSearchResponse>` — `parseGenreQuery(query)` wiederverwenden (DRY); für jeden Genre-Namen `searchCcTracks({ tags: genres.join("+"), limit: parsed.tracks ?? 10 })`; mappen auf `ApiGenreTrackCandidate` mit **`id = "jamendo:<jamendoId>"`** (für den CC-Resolve-Klick), `webUrl = shareUrl ?? ""`, `artworkUrl`, `durationMs`, `artists: [artistName]`. `results: { tracks, albums: null, artists: null }` (Tracks-only, Scope). `{ status: "genre-search", query: {...}, results, warnings }`.
  - Genre-Parse-Fehler analog kommerziell behandeln (GenreQueryParseError → 400 im Route-Handler).

- [ ] **Step 2:** Unit-Test (gestubbtes searchCcTracks/getCcGenres): browse liefert Jamendo-Tiles; search liefert Tracks mit `id = "jamendo:…"` und `albums/artists = null`.

- [ ] **Step 3:** typecheck + biome + commit `Feat: add CC genre service (Jamendo radios browse + tag track-search)`.

---

## Task 3: CC-Route — Genre-Flows

**Files:** `apps/backend/src/routes/cc-resolve.ts`.

- [ ] **Step 1:** Im Handler, NACH dem Rate-Limit + dem leeren-Body-Check, VOR dem `selectedCandidate`/Text-Search-Flow, Genre erkennen (reuse `isGenreBrowseQuery`/`isGenreSearchQuery` aus `services/genre-search/index.js`):
```typescript
if (query && isGenreBrowseQuery(query)) {
  return reply.send(await runCcGenreBrowse());
}
if (query && isGenreSearchQuery(query)) {
  try {
    return reply.send(await runCcGenreSearch(query));
  } catch (err) {
    if (err instanceof GenreQueryParseError) return reply.status(400).send(ccError("INVALID_URL", err.message));
    throw err;
  }
}
```
Imports ergänzen. Das Response-Schema der Route um die genre-browse/genre-search-Form erweitern (oneOf, additionalProperties:true wie kommerziell), damit Fastify die Antwort nicht ablehnt — lies das kommerzielle `resolve.ts`-Response-Schema als Vorlage.

- [ ] **Step 2:** typecheck + build + commit `Feat: handle genre browse/search in CC resolve route (Jamendo)`.

---

## Task 4: Frontend — CC-Genre verdrahten, Abkürzung zurücknehmen

**Files:** `apps/frontend/src/hooks/useAppState.ts`.

- [ ] **Step 1:** Die Genre-Abkürzung in `handleSubmit` ENTFERNEN — im CC-Modus gehen ALLE Queries (inkl. `genre:`) an den CC-Endpoint:
```typescript
const endpoint = mode === ResolveMode.Cc ? ENDPOINTS.frontend.ccResolve : ENDPOINTS.frontend.resolve;
```
(Den `isGenreQuery`-Check + Kommentar entfernen.) Die bestehenden `genre-browse`/`genre-search`-Response-Branches greifen unverändert (shape-gleich) und rendern jetzt Jamendo-Daten.

- [ ] **Step 2:** `handleSelectGenreResult(webUrl, id)` mode-aware machen: im CC-Modus den CC-Track per `selectedCandidate` auflösen (der CC-Genre-Track trägt `id = "jamendo:<id>"`), sonst kommerziell wie bisher:
```typescript
if (mode === ResolveMode.Cc) {
  // CC genre result → resolve the Jamendo track via the CC endpoint → cc-track page.
  const response = await fetch(ENDPOINTS.frontend.ccResolve, { method: "POST", headers: {...},
    body: JSON.stringify({ selectedCandidate: id }), signal });
  const data = (await response.json()) as CcResolveSuccessResponse;
  dispatch({ type: "RESOLVE_CC_SUCCESS", ccActive: parseCcResolveResponse(data) });
  return;
}
// commercial: unchanged (query: webUrl)
```
`mode` in die `useCallback`-Deps aufnehmen. (Lies die aktuelle `handleSelectGenreResult`-Implementierung; den kommerziellen Pfad byte-identisch lassen.)

- [ ] **Step 3:** check + test:run + doctor:diff + biome + commit `Feat: route CC-mode genre discovery through Jamendo (revert commercial shortcut)`.

---

## Task 5: Browser-Verifikation

- [ ] Dev-Server (`./app`). CC-Modus: `genre:?` → **Jamendo-Genre-Kacheln** (Jazz, Rock, Electronic, Pop, Hip Hop, Classical, Lounge, Metal, …) aus `/radios`, NICHT die Last.fm-Kacheln (00S/Anime/Art Rock dürfen NICHT erscheinen). Klick auf ein Genre → Jamendo-Tracks. Klick auf einen Track → CC-Track-Seite (Jamendo-Stream/Lizenz). Kommerzieller Modus: `genre:?` unverändert (Last.fm). Screenshots als Beleg.

---

## Task 6: Jamendo-Cover-Artwork (kommerzielles Schema)

Befund (live verifiziert): Jamendos Radio-Bilder existieren nur als 150px (`<name>150.jpg`); höhere Auflösungen und der `imagesize`-Param für `/radios` liefern 404, und `piano150.jpg`/`happy150.jpg` sind selbst 404. Also **keine** brauchbaren Genre-Cover direkt von Jamendo. Stattdessen wird Artwork nach dem **kommerziellen Schema** generiert, gespeist aus repräsentativen **Jamendo-Album-Covern**. Der Genre-Name wird wie kommerziell **ins Bild eingebrannt** (oben links, identische Schrift/Größe/Abstände); das temporäre HTML-Label aus Task 4 entfällt.

Wiederverwendet, unverändert: `generateArtwork`, `ensureArtwork`, `getCachedArtwork`, Tabelle `genre_artworks` (Text-PK nimmt `cc:<key>`-Keys ohne Migration).

- [x] Shared `endpoints.ts`: `ENDPOINTS.v1.ccGenreArtwork`, `ENDPOINTS.frontend.ccGenreArtwork`, `ROUTE_TEMPLATES.v1.ccGenreArtwork`.
- [x] Backend-Client: `getCcGenreCoverUrl(genre)` via `/tracks?tags=<genre>&order=popularity_total&imagesize=600&limit=1`, Cover = Track-`image || album_image`. **Korrektur ggü. erstem Entwurf:** Jamendos Genre-Tags hängen an **Tracks**, nicht an Alben — `/albums?tags=` ignoriert den Tag und liefert für JEDES Genre dasselbe globale Top-Album. Cover muss aus der tag-gefilterten Track-Query kommen (dieselbe Quelle wie `searchCcTracks`). `getCcGenres` memoisiert; totes Radio-`imageUrl` (CcGenre + Mapping + Test) entfernt.
- [x] Neue Route `routes/cc-genre-artwork.ts` (`GET /api/v1/cc/genre-artwork/:genreKey`), Cache-Key `cc:<key>`, displayName via `getCcGenres`-Lookup, in `server.ts` registriert + rate-limit-exempt (ruft `apiRateLimiter` nie, wie die kommerzielle Route).
- [x] `cc-genre.ts`: `artworkUrl` → `/api/cc/genre-artwork/<name>?v=2` — `CC_ARTWORK_VERSION` von 1 auf **2** gebumpt nach dem Cover-Source-Fix (busted die unter v=1 falsch gecachten Tiles).
- [x] Frontend: `fetchCcGenreArtwork` + Proxy `pages/api/cc/genre-artwork/[genreKey].ts`; `showLabel`-Label in `GenreBrowseGrid` + `LandingPage` zurückgenommen.
- [x] Browser verifiziert: CC-Kacheln = je eigenes repräsentatives Jamendo-Album-Cover + eingebrannter Name oben links (kommerzielles Schema, gleiche Schrift/Größe/Position), Tile-Farbe aus dem Cover, keine 404-Fallbacks. Klick → Tracks → CC-Track-Seite weiterhin grün.

**Verifizierte Fakten (live):** Radio-Bilder nur 150px; höhere + `imagesize` → 404; `piano150.jpg`/`happy150.jpg` → 404 (deshalb verworfen). `/albums?tags=<g>&order=popularity_total` liefert für ALLE Genres dasselbe Album (id=608316) — Tag greift auf `/albums` nicht. `/tracks?tags=<g>&order=popularity_total&imagesize=600` liefert pro Genre ein eigenes Cover (`usercontent.jamendo.com?type=album&…&width=600`, HTTP 200). Generator/Orchestrierung/Repository: `services/genre-artwork/{generator,index,repository}.ts` (`generateArtwork`, `ensureArtwork`, `getCachedArtwork`, Tabelle `genre_artworks` Text-PK). Kommerzielle Route: `routes/genre-artwork.ts`; Browse-`artworkUrl`: `genre-search/lastfm.ts:576` (`?v=ARTWORK_VERSION`).

---

## Task 7: Genre-Liste erweitern (kuratierte Jamendo-Genres statt /radios)

Befund: `/radios` liefert nur 14 kuratierte Radio-Stationen, nicht Jamendos Genre-Katalog. Jamendo hat keinen „Top-Genres"-Endpoint (anders als Last.fm `chart.getTopTags`), aber sehr viel mehr Genres über `tags=`.

- [x] `getCcGenres` von `/radios`-Fetch auf statische, kuratierte `CC_GENRES`-Liste (49 Genres) umgestellt. Jeder Tag **live gegen `/tracks?tags=` validiert** (Python-Loop wegen zsh-`for-in`-Wortsplitting). `name` = exakter Jamendo-Tag (lowercase), `displayName` = menschliches Label (z. B. `hiphop`→„Hip Hop", `drumnbass`→„Drum & Bass", `postrock`→„Post-Rock"). Mood-Tags (relaxation/happy/songwriting) raus, reine Genres rein.
- [x] Toter `JamendoRadioRaw`-Typ + `ccGenresCache`-Memo entfernt; `getCcGenres`-Tests auf die statische Liste umgestellt; `CcGenre`-TSDoc bereinigt.
- [x] Browser verifiziert: `genre:?` (CC) zeigt 49 Genres im scrollbaren Raster, je eigenes Cover + eingebrannter Name; Artwork-Pipeline + Klick-Flow unverändert grün.

**Verifizierte Fakten (live):** 58 Kandidaten-Tags gegen `/tracks?tags=` geprüft, alle mit Content (u. a. blues, folk, reggae, punk, ska, grunge, alternative, drumnbass, breakbeat, postrock, deephouse, synthwave, electronica, downtempo, psychedelic, swing, latin, gospel, rnb). Burst-Limit von Jamendo bei >~5 req/s ohne Pause — Validierung mit Delay + Python-Loop. `CC_GENRES` in `services/cc/jamendo/client.ts`.

---

## Self-Review
**Regel-Compliance:** Browse = Jamendo `/radios`; Suche = Jamendo `/tracks?tags=`; Klick = CC-Resolve (Jamendo). Kein Last.fm/Deezer im CC-Genre-Pfad. Die kommerzielle Genre-Abkürzung ist zurückgenommen. **Scope:** Tracks-only (Album/Künstler-Spalten zurückgestellt, da CC-Album/Künstler-Seiten fehlen — bewusst weggelassen, NICHT mit kommerziellen Daten gefüllt). **DRY:** `parseGenreQuery`, `isGenreBrowseQuery`, `isGenreSearchQuery`, die Genre-Response-Shapes + Frontend-Komponenten wiederverwendet.
**Verifizierte Fakten (live gegen Jamendo-API):** `/radios` liefert 15 Genre-Stationen (electro/rock/lounge/hiphop/world/jazz/classical/pop/songwriting/metal/soundtrack/relaxation/piano/happy + bestof) mit name/dispname/image. `/tracks?tags=jazz`, `/albums?tags=jazz`, `/artists?tags=jazz` liefern Ergebnisse. Genre-Parser + Shapes: `genre-search/parser.ts`, `genre-search/index.ts`, `packages/shared/src/api.ts`.
