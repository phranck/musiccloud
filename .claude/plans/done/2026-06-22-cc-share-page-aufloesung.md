# CC-Share-Page-Auflösung (Plan 2b) — Implementation Plan

Plan-Nr.: MC-053

## Preface / Problem (Code-verifiziert)

Geteilte CC-Share-Links (z.B. `http://localhost:3001/V0onz`) liefern **404**. Ursache ist NICHT fehlende Persistierung — `V0onz` liegt korrekt in `cc_short_urls` (cc_track_id, 65 CC-Track-Shares lokal). Der **Auflöse-Pfad** ist komplett kommerziell:

- `GET /api/v1/share/:shortId` ([apps/backend/src/routes/share.ts:119-123](apps/backend/src/routes/share.ts)) probiert nur `loadByShortId` / `loadAlbumByShortId` / `loadArtistByShortId`, alle gegen die kommerziellen `short_urls`-Tabellen. Eine ID, die nur in `cc_*_short_urls` existiert, fällt durch alle drei → 404 → `[shortId].astro` redirectet auf `/404`.
- Es existiert ein halber, **nie aufgerufener** Baustein `findCcTrackByShortId` ([postgres-cc.ts:333](apps/backend/src/db/adapters/postgres-cc.ts)). Für CC-Album/Artist fehlt selbst dieser.
- Im Plan `cc-pfad-backend-resolve.md` explizit als Abgrenzung markiert: *„NICHT in diesem Plan: die permanente Share-Page (`loadByShortId`-Pendant). Diese folgen als Plan 2b."* — Plan 2b wurde nie geschrieben. **Dies ist Plan 2b.**

## User-Entscheidungen (2026-06-22)

1. **Scope:** Track **und** Album **und** Artist komplett.
2. **Rechte Spalte:** **Volle Spiegelung** der Live-Ansicht (Popular/Similar Tracks), `artistInfo` beim Öffnen live von Jamendo gebaut.

## Ziel

Eine geöffnete CC-Share-URL (`/:shortId` auf einen cc-track/cc-album/cc-artist) rendert SSR dieselbe Zwei-Spalten-Ansicht wie der Live-Resolve: links `MediaSummaryCard` (Player) + `CcInfoCard` (Lizenz/Attribution/Jamendo), rechts die `AnimatedArtistColumn` (Popular/Similar Tracks). Kommerzielle Share-Pages bleiben byte-identisch.

## Architektur

### Kern-Idee: Loader = shortId→jamendoId (DB) + Live-Resolve-Builder (Jamendo), DRY

Der Live-Resolve baut die Response in `persistCcTrackAndRespond` / `persistCcAlbumAndRespond` / `persistCcArtistAndRespond` ([cc-resolve.ts:201-316](apps/backend/src/routes/cc-resolve.ts)): Entity → `toApiCcTrack` + `buildCcArtistInfo(...)` (rechte Spalte) → `CcResolveSuccessResponse` / `CcAlbum…` / `CcArtist…`.

Der Share-Loader reproduziert **denselben Builder**, gespeist aus der DB statt aus dem Resolve-Kandidaten:

1. **shortId → (kind, jamendoId):** Lookup über die drei `cc_*_short_urls`-Tabellen (JOIN auf die Entity-Tabelle für `jamendo_id`).
2. **jamendoId → Entity (frisch von Jamendo):** `getCcTrack` / `getCcAlbum` / `getCcArtist` (gedrosselt) — liefert die volle `CcTrack`/`CcAlbum`/`CcArtist` **inklusive** `jamendoArtistId`/`jamendoAlbumId`, die die DB-Records nicht selektieren.
3. **Response-Builder (extrahiert, geteilt):** `buildCcTrackResponse` / `buildCcAlbumResponse` / `buildCcArtistResponse` — von Live-Resolve UND Share-Loader genutzt. Baut `artistInfo` via `buildCcArtistInfo` + `getCcArtistTopTracks` / `getCcAlbumTracks`.

**Warum frisch von Jamendo statt aus der DB:** Die rechte Spalte (`artistInfo`) braucht ohnehin Jamendo-Calls (`getCcArtistTopTracks`), cc-album persistiert keine Tracklist, und `CcTrackRecord` trägt kein `jamendoArtistId`. Der Entity-Refetch (1 Call) ist marginal und hält Live-Resolve und Share-Page bit-konsistent. Der DB-Eintrag dient nur als Existenz-/Identitäts-Nachweis (shortId→jamendoId).

### Wire-Type: `SharePageResponse` zur discriminated union erweitern

`SharePageResponse` ([api.ts:349-357](packages/shared/src/api.ts)) wird von Interface zu union erweitert um drei CC-Varianten, die die bereits existierenden `CcResolveSuccessResponse`-Felder tragen:

```ts
export type SharePageResponse =
  | { type: "track" | "album" | "artist"; og: OgMeta; track?: ApiTrack; album?: ApiAlbum; artist?: ApiArtist; links: ApiLink[]; shortUrl: string }
  | { type: "cc-track"; og: OgMeta; shortUrl: string; track: ApiCcTrack; artistInfo: ArtistInfoResponse }
  | { type: "cc-album"; og: OgMeta; shortUrl: string; album: ApiCcAlbum; artistInfo: ArtistInfoResponse }
  | { type: "cc-artist"; og: OgMeta; shortUrl: string; artist: ApiCcArtist; artistInfo: ArtistInfoResponse };
```

Ein Endpoint, ein `fetchShareData`-Call. Kommerzielle Consumer prüfen `data.type` bereits — sie brauchen nur einen CC-else-Branch.

### Frontend: bestehende CC-Render-Logik wiederverwenden

Die Live-Ansicht ([CcShareResult.tsx](apps/frontend/src/components/landing/CcShareResult.tsx)) rendert CC durch `ShareLayout` mit `artistData`/`skipArtistFetch`/`secondaryCard=<CcInfoCard>`/`labels`/`onTrackResolve` aus `ccResultToShareProps(ccActive, t)`. Der SSR-Pfad reproduziert das, gespeist aus der Wire-Response statt app-state.

## Scheiben

### Scheibe A: Wire-Type + geteilte Response-Builder (Backend, kommerziell unverändert)
- **api.ts:** `SharePageResponse` zur union erweitern (3 CC-Varianten). `pnpm --filter @musiccloud/shared build`.
- **cc-resolve.ts → cc-response-builders.ts (neu):** `buildCcTrackResponse(track, shortId, origin)`, `buildCcAlbumResponse(album, tracks, shortId, origin)`, `buildCcArtistResponse(artist, topTracks, shortId, origin)` extrahieren (die `toApiCcTrack` + `buildCcArtistInfo`-Logik aus `persistCc*AndRespond`). Live-Resolve ruft danach `persist… + buildCc…Response`.
- Gate: backend tsc, bestehende cc-resolve-Tests grün.

### Scheibe B: CC-Share-Loader + Route-Wiring (Backend)
- **postgres-cc.ts:** `findCcShortId(shortId)` — probiert `cc_short_urls`/`cc_album_short_urls`/`cc_artist_short_urls`, gibt `{ kind: "cc-track"|"cc-album"|"cc-artist", jamendoId } | null`. (Ein Finder statt drei; nutzt JOIN auf die jeweilige Entity-Tabelle für `jamendo_id`.)
- **repository.ts / postgres.ts:** Finder auf `CcRepository` deklarieren + verdrahten.
- **share-page.ts (oder neu cc-share-page.ts):** `loadCcByShortId(shortId, origin)` — `findCcShortId` → `getCcTrack`/`getCcAlbum`+`getCcAlbumTracks`/`getCcArtist`+`getCcArtistTopTracks` → `buildCc…Response`. Plus OG-Meta für CC (eigener Builder analog `og.ts`-Regeln: Titel ≤60, Desc ≤65, `image=artworkUrl||/og/default.jpg`, `url=${origin}/${shortId}`).
- **share.ts:** `loadCcByShortId` als 4. Lookup in `Promise.all`; CC-Varianten-Branch baut die cc-`*`-`SharePageResponse`. 404-Text auf „No track, album, artist, or CC entity" erweitern.
- Gate: backend tsc; neuer Loader-Test (track/album/artist, je ein gemockter Jamendo-Pfad).

### Scheibe C: Frontend SSR-Render (CC-Branch)
- **share-view.ts:** `ccResultToShareProps`-Logik für Wire-Input nutzbar machen — entweder `ccResultToShareProps` so refactoren, dass es eine serialisierbare CC-Payload akzeptiert (CcResult ≈ Wire-Response), oder einen Sibling `buildCcShareViewFromResponse(data, t)` ergänzen, der `{config, ccInfoContent, artistInfo, artistName, labels}` liefert.
- **DeferredShareContent.astro** (Browser) **+ Bot-Branch in [shortId].astro:** Auf `data.type.startsWith("cc-")` verzweigen → `ShareLayout` (bzw. `SharePageShell`) mit `artistData=artistInfo`, `skipArtistFetch`, `secondaryCard=<CcInfoCard>`, `labels={similar, profileProvidedBy}`, und einem CC-`onTrackResolve`.
- **CC-onTrackResolve auf der Share-Page:** Analog zum default `handleTrackResolve` ([ShareLayout.tsx:368/413](apps/frontend/src/components/share/ShareLayout.tsx)), aber gegen `/api/v1/cc/resolve` (jamendo:<id>) + Navigation zur neuen Share-URL. Wenn der bestehende `handleTrackResolve` bereits generisch genug ist (shortId-basiert), prüfen ob er CC-Rows trägt.
- **Bot-OG (kosmetisch):** `og:type=music.song/album/profile` bleibt; dns-prefetch i.scdn.co/mzstatic ist für CC irrelevant (Jamendo-Cover), nicht blockierend.
- Gate: frontend tsc, biome, doctor:diff.

### Scheibe D: Verifikation
- `pnpm lint`, `pnpm run doctor` (full), backend + frontend Tests.
- Browser (agent-browser): `/V0onz` (cc-track) lädt die volle Zwei-Spalten-Ansicht; je ein cc-album- + cc-artist-Share aus `cc_album_short_urls`/`cc_artist_short_urls` testen; eine kommerzielle Share-URL als Regressions-Check unverändert.
- DB: shortIds für die Tests aus `cc_album_short_urls`/`cc_artist_short_urls` ziehen.

## Risiken / offene Punkte
- **CC-onTrackResolve auf der isolierten Share-Page:** Hauptkomplexität. Die LandingPage hat `handleSelectCcTrack` (app-state); die Share-Page nicht. Lösung in Scheibe C festzulegen (eigener Resolve→Navigate-Handler vs. generischer Default).
- **Jamendo-Verfügbarkeit:** Verschwindet die Jamendo-Entity, liefert die Share-Page 404 trotz DB-Eintrag (gleiches Verhalten wie die Live-Ansicht). Akzeptiert.
- **Jamendo-Quota/Last:** Jeder CC-Share-Open macht 2-4 gedrosselte Jamendo-Calls. Share-Endpoint cached `private, max-age=3600` — mildert wiederholte Crawler-/Reload-Hits.
- **`ccResultToShareProps`-Refactor:** Falls es tief an app-state-`CcResult` hängt, ist der Sibling-Builder der sichcrere Weg (kein Risiko für die Live-Ansicht).

## Verified facts (Plan-write-time)
- 404-Pfad: `share.ts:119-123` (3 kommerzielle Loader), `[shortId].astro:75-77` redirect `/404`. ✓ grep+curl (`/V0onz` → 302 → `/404`).
- `V0onz` in `cc_short_urls` (cc_track_id K7dXQlIKeCD6kLPrtU8nq). ✓ psql. Counts: cc_short_urls 65, cc_album_short_urls 4, cc_artist_short_urls 3.
- `findCcTrackByShortId` existiert ([postgres-cc.ts:333](apps/backend/src/db/adapters/postgres-cc.ts)), **kein Consumer**; kein `findCcAlbumByShortId`/`findCcArtistByShortId`, kein `CcAlbumRecord`/`CcArtistRecord`. ✓ grep.
- Live-Builder: `persistCc{Track,Album,Artist}AndRespond` ([cc-resolve.ts:201-316](apps/backend/src/routes/cc-resolve.ts)), nutzen `toApiCcTrack` + `buildCcArtistInfo(artistName, jamendoArtistId, topTracks)`. ✓ Read.
- Jamendo-Bausteine: `getCcTrack:173`, `getSimilarCcTracks:194`, `getCcAlbum:254`, `getCcArtist:267`, `getCcAlbumTracks:331`, `getCcArtistTopTracks:350` ([jamendo/client.ts](apps/backend/src/services/cc/jamendo/client.ts)); `buildCcArtistInfo` ([cc-artist-info.ts:64](apps/backend/src/services/cc/cc-artist-info.ts)). ✓ grep.
- Service-Typen `CcTrack`/`CcAlbum`/`CcArtist` tragen `jamendoArtistId`/`jamendoAlbumId` ([jamendo/types.ts:96-128](apps/backend/src/services/cc/jamendo/types.ts)). ✓ grep.
- Schema: `cc_tracks.cc_artist_id` FK → `cc_artists.id`; `cc_artists.jamendo_id` (JOIN für jamendoArtistId möglich). ✓ migration 0043. cc_album/cc_artist short-urls: migration 0044.
- Wire-Typen `ApiCcTrack`/`ApiCcAlbum`/`ApiCcArtist`/`Cc{,Album,Artist}ResolveSuccessResponse` + `SharePageResponse` ([api.ts:201-357](packages/shared/src/api.ts)). ✓ Read.
- Frontend-Render: `CcShareResult.tsx` → `ccResultToShareProps(ccActive, t)` ([parsers.ts:624](apps/frontend/src/lib/resolve/parsers.ts)) → `ShareLayout(artistData, skipArtistFetch, secondaryCard, labels, onTrackResolve)`; `ShareLayout` default `handleTrackResolve` ([ShareLayout.tsx:368/413](apps/frontend/src/components/share/ShareLayout.tsx)); kommerzielle SSR-Share via `SharePageShell`. ✓ Read.
- [ ] Alle Code-Referenzen verifiziert (functions, scripts, paths, env vars, package-manager commands) — beim Execute re-grep.

## Checklist
- [x] Scheibe A: Wire-union + extrahierte Response-Builder, Live-Resolve unverändert grün
- [x] Scheibe B: `findCcShortId` + `loadCcByShortId` + share.ts-Wiring + CC-OG + Loader-Test
- [x] Scheibe C: share-view CC-Branch + DeferredShareContent/[shortId].astro CC-Render + CC-onTrackResolve
- [x] Scheibe D: Gates grün + Browser-Verify (cc-track/album/artist + kommerzielle Regression)

## Completed (2026-06-22)

CC-Share-URLs lösen jetzt vollständig auf. Commits:
- `34eb4ab` Test: getCcArtistMusicInfo HTML-Bio-Erwartungen (pre-existing Fix)
- `f2c16a1` Refactor: SharePageResponse-union + CC-Response-Builder (Scheibe A)
- `1fa3cb0` Feat: CC-Share-Loader + share.ts-Wiring (Scheibe B)
- `d9060cf` Feat: CC-Render durch ShareLayout (Scheibe C)

**Architektur-Entscheidungen (wie geplant umgesetzt):**
- Loader holt per `findCcShortId` nur `{kind, jamendoId}` aus der DB und baut Entity + rechte Spalte live von Jamendo (löst fehlende Album-Tracklist + nicht-persistiertes `artistInfo`). `findCcTrackByShortId`/`CcTrackRecord` (uncalled) durch `findCcShortId`/`CcShortIdLookup` ersetzt.
- `SharePageResponse` zur discriminated union (commercial | cc-track/album/artist). `SharePageSchema` → `oneOf`, damit Fastify die CC-Felder nicht strippt.
- Frontend: `ccResponseToResult` (Wire→CcResult) reused die bestehenden `ccResultToShareProps`-Builder; `CcSharePageShell` rendert `ShareLayout`. **CC-onTrackResolve = resolve + navigate** (nicht der kommerzielle in-place-Reducer — der ist commercial-only). Folge-Refinement möglich, falls in-place gewünscht.

**Verifikation:** Backend-E2E (curl) + Browser (cc-track/album/artist volle Zwei-Spalten-Ansicht, kommerziell unverändert). Gates: backend 1051 Tests, frontend tsc + astro-check 0 errors, biome 756 clean, doctor 0 issues. Die im Browser gesichtete „Kellee Maize"-dup-key-Warnung war stale Console-Buffer (V0onz-spezifisches „JekK" feuert nicht — composite key korrekt).
