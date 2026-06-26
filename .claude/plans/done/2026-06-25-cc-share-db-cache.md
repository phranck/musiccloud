# CC-Share-Pages aus der DB lesen statt Live-Jamendo-Refetch (track + album + artist)

Plan-Nr.: MC-058

## Context — warum diese Änderung

**Symptom (User-bestätigt):** Eine CC-Share-URL wird geöffnet, ein paar Sekunden passiert nichts, dann kommt ein 404. Kommerzielle Shares funktionieren.

**Root Cause (in Prod verifiziert):** Der CC-Share-Loader `loadCcByShortId` ([apps/backend/src/lib/server/cc-share-page.ts](apps/backend/src/lib/server/cc-share-page.ts)) holt bei **jedem Öffnen** die Daten **live von Jamendo** (`getCcTrack` / `getCcAlbum`+`getCcAlbumTracks` / `getCcArtist`+`getCcArtistTopTracks`, plus `buildCcArtistInfo` fürs rechte Panel — alle durch einen globalen 350 ms-Throttle). Schlägt ein Call fehl (Jamendo-Rate-Limit/Timeout, oder unser `apiRateLimiter`), gibt der Loader `null` oder **wirft** → kein 200 → `fetchShareData` ([apps/frontend/src/api/client.ts:160-182](apps/frontend/src/api/client.ts)) macht aus jedem `!res.ok`/Timeout ein `null` → Frontend redirectet auf `/404`. Die „paar Sekunden“ sind exakt die throttled Jamendo-Calls.

Der kommerzielle Pfad (`loadByShortId`, [share-page.ts:56](apps/backend/src/lib/server/share-page.ts)) liest **alles aus der DB** (~20 ms, kein externer Call) — deshalb robust.

**Ziel (User-Vorgabe „alles cachen“):** CC-Daten beim Resolve einmal vollständig persistieren, danach den Share-Loader für **alle drei Typen** (track, album, artist) nur noch aus der DB lesen — kein Jamendo-Call im kritischen Open-Pfad. Genau wie kommerziell. Das beseitigt „Sekunden → 404“ und den Rate-Limit-Druck.

**Nebenbefund (separat, nicht Teil dieses Fixes):** In Prod existieren CC-Shares erst ab 24.06. 15:15 UTC; früher geteilte CC-URLs sind gar nicht in der DB → sofortiger 404 (kein Spinner). Anderes Phänomen, hier nur vermerkt.

## Leitprinzip

Ein einheitlicher Pfad für alle drei CC-Typen (keine Sonderpfade — vgl. CC-spiegelt-kommerziell): **Loader = reiner DB-Read der Kern-Entität.** Die rechte Spalte (`artistInfo`: Similar-Tracks + Artist-Profil) ist sekundär und nie 404-kritisch — sie wird nicht-blockierend behandelt (cc-track lädt sie heute schon client-seitig; album/artist bauen sie inline, künftig fehlertolerant).

---

## Backend

### 1. Schema — `cc_tracks` um 6 Spalten ([postgres.ts:1306-1335](apps/backend/src/db/schemas/postgres.ts))
```ts
albumPosition: integer("album_position"),     // Album-Tracklist-Reihenfolge
artistTopPosition: integer("artist_top_position"), // Artist-topTracks-Reihenfolge (Popularität)
musicInfo: jsonb("music_info"),               // Details-Section
stats: jsonb("stats"),                         // Details-Section
proLicensing: integer("pro_licensing"),        // toApiCcTrack
proUrl: text("pro_url"),                        // toApiCcTrack
```
Migration via Drizzle: `pnpm db:generate` → `0045_*.sql` + Snapshot + Journal. Prüfen: genau 6 `ADD COLUMN`, keine Drift.

### 2. Resolve persistiert vollständig ([cc-resolve.ts](apps/backend/src/routes/cc-resolve.ts), [postgres-cc.ts](apps/backend/src/db/adapters/postgres-cc.ts))
- **`upsertCcTrackRow`-Helper extrahieren** aus dem `cc_tracks`-INSERT in `persistCcTrack` ([postgres-cc.ts:177-219](apps/backend/src/db/adapters/postgres-cc.ts)) — wiederverwendbar für Album-Tracks/Artist-topTracks (DRY). Nimmt `ccArtistId`, `ccAlbumId`, `albumPosition`, `artistTopPosition` optional. `persistCcTrack` = `upsertCcTrackRow` + Short-URL-Mint.
- `persistCcTrack`: die 4 Detail-Felder (`musicInfo`/`stats`/`proLicensing`/`proUrl`) durchreichen — beim Single-Track-Resolve via `include=musicinfo+stats+licenses` gefüllt ([client.ts:243](apps/backend/src/services/cc/jamendo/client.ts)).
- `persistCcAlbum`: in derselben Transaktion die Album-`tracks` per `upsertCcTrackRow` mit `cc_album_id` + `album_position` (Array-Index) persistieren.
- `persistCcArtist`: die `topTracks` per `upsertCcTrackRow` mit `cc_artist_id` + `artist_top_position` (Array-Index, = Popularitäts-Reihenfolge von `order=popularity_total`) persistieren.
- `PersistCcAlbumData`/`PersistCcArtistData` ([repository.ts](apps/backend/src/db/repository.ts)) um `tracks`/`topTracks` (Persist-Payloads) erweitern; `PersistCcTrackData` um die Detail-Felder + Positions-Felder.

### 3. DB-Read-Methoden ([repository.ts](apps/backend/src/db/repository.ts) + [postgres-cc.ts](apps/backend/src/db/adapters/postgres-cc.ts) + Delegation [postgres.ts](apps/backend/src/db/adapters/postgres.ts))
- `loadCcTrackByShortId(shortId)` → volle Row inkl. `jamendoArtistId` via `JOIN cc_short_urls → cc_tracks → cc_artists` (Vorbild commercial [postgres-tracks.ts:282](apps/backend/src/db/adapters/postgres-tracks.ts)).
- `loadCcAlbumByShortId(shortId)` → `{ album, tracks[] }`: Album-Entity (JOIN cc_artists) + `cc_tracks WHERE cc_album_id = ? ORDER BY album_position`.
- `loadCcArtistByShortId(shortId)` → `{ artist, topTracks[] }`: Artist-Entity + `cc_tracks WHERE cc_artist_id = ? ORDER BY artist_top_position`.
- Gemeinsamer Row-Typ `CcTrackShareRow`; Mapper **`mapDbRowToCcTrack`** als `export` in [cc-share-response.ts](apps/backend/src/services/cc/cc-share-response.ts) (`int 0/1 → bool`, `null → undefined`).

### 4. Loader umbauen ([cc-share-page.ts](apps/backend/src/lib/server/cc-share-page.ts))
Alle drei `case`s lesen aus der DB statt von Jamendo; OG-Meta-Bau bleibt. `findCcShortId` bleibt (liefert `kind` fürs Switch). Jamendo-Entity-Imports (`getCcTrack` etc.) entfernen.
- `cc-track`: reiner DB-Read → `toApiCcTrack(mapDbRowToCcTrack(row))`. Rechte Spalte lädt client-seitig (unverändert, [cc-share-page.ts:72](apps/backend/src/lib/server/cc-share-page.ts)).
- `cc-album`/`cc-artist`: Entity + Tracklist/topTracks aus DB; `buildCc{Album,Artist}Payload` (mit DB-Tracks als `columnTracks`) baut das rechte Panel weiter.

### 5. `buildCcArtistInfo` fehlertolerant ([cc-artist-info.ts:94-126](apps/backend/src/services/cc/cc-artist-info.ts))
Die 2 Jamendo-Enrichment-Calls (`getSimilarCcTracks`, `getCcArtistMusicInfo`) je in `try/catch` → bei Fehler `similarArtistTracks: []` bzw. `profile: null`. So **wirft der album/artist-Loader nie wegen des Panels** → kein 404 mehr, auch wenn Jamendo zickt. (Die Tracklist — der eigentliche Inhalt — kommt aus der DB.) Betrifft auch den client-seitigen cc-track-Panel-Call positiv (degradiert statt zu erroren).

---

## Verifikation

- **Migration:** `pnpm db:generate` + `pnpm db:migrate` lokal; 6 Spalten existieren, Eintrag landet im **`drizzle.__drizzle_migrations`**-Tracker (musiccloud hat zwei Tracker — nach `db:migrate` ggf. `__drizzle_migrations` nachpflegen, sonst Backend-Restart-Crash).
- **Backend:** `pnpm --filter @musiccloud/backend test:run` + `typecheck` grün. Loader-Unit-Test ([cc-share-page.test.ts](apps/backend/src/lib/server/__tests__/cc-share-page.test.ts)) auf DB-Reads umstellen; Integration-Test ([postgres-cc.integration.test.ts](apps/backend/src/db/adapters/__tests__/postgres-cc.integration.test.ts)) um neue Felder + Album-/Artist-Tracklist-Persistenz + Read-Order erweitern.
- **End-to-end lokal:** je einen CC-track/-album/-artist resolven, dann die Share-URL öffnen → Response sofort (~DB-Latenz), **kein** Jamendo-Outbound auf dem `/api/v1/share/:shortId`-Pfad, kein 404. Jamendo testweise „abklemmen“ (falscher `JAMENDO_CLIENT_ID`) → Share-Pages laden trotzdem aus der DB (album/artist ohne Panel-Enrichment, kein 404). Eine kommerzielle Share als Regressions-Check unverändert.
- **Pre-push-Gates:** Typecheck + `pnpm lint` + `pnpm doctor:diff` grün.
- **Altbestand:** Vor der Migration persistierte Tracks haben `music_info`/`stats` = null bis zum nächsten Re-Resolve → Detail-Section self-hidet, Share lädt aber (kein 404). Album-/Artist-Shares, die vor diesem Change resolved wurden, haben noch keine persistierte Tracklist → einmaliges Re-Resolve füllt sie; optionales Backfill-Skript möglich, nicht erforderlich.

---

## Verified facts (geprüft am 25.06.)

- Bug-Pfad live: cc-track-`case` ruft `getCcTrack` ([cc-share-page.ts:70](apps/backend/src/lib/server/cc-share-page.ts)); album/artist rufen `getCcAlbum`+`getCcAlbumTracks` / `getCcArtist`+`getCcArtistTopTracks` ([:87-89,107-108](apps/backend/src/lib/server/cc-share-page.ts)). `fetchShareData` macht `!res.ok` → null → `/404` ([client.ts:177](apps/frontend/src/api/client.ts), [DeferredShareContent.astro:65](apps/frontend/src/components/share/DeferredShareContent.astro)).
- `cc_tracks` hat alle Core-Felder außer `music_info`/`stats`/`pro_licensing`/`pro_url`/`album_position`/`artist_top_position` ([postgres.ts:1306-1335](apps/backend/src/db/schemas/postgres.ts)). ✓
- `toApiCcTrack` braucht genau diese + `jamendoArtistId` (per JOIN `cc_artists.jamendo_id`) ([cc-share-response.ts:25-48](apps/backend/src/services/cc/cc-share-response.ts)). ✓
- `persistCcAlbum`/`persistCcArtist` persistieren NUR die Entity, nicht die Tracklist/topTracks ([postgres-cc.ts:246-324](apps/backend/src/db/adapters/postgres-cc.ts)). ✓
- `buildCcArtistInfo` macht 2 Live-Jamendo-Calls und wirft bei Fehler ([cc-artist-info.ts:100,106,92](apps/backend/src/services/cc/cc-artist-info.ts)); `columnTracks` akzeptiert `CcTrack[]` (DB-Tracks nutzbar). ✓
- cc-track-Panel lädt schon client-seitig (`skipArtistFetch` + `/api/cc/artist-info`); `artistInfo` ist für cc-album/cc-artist pre-built, für cc-track unset ([share-view.ts:36-38](apps/frontend/src/lib/share/share-view.ts), [CcSharePageShell.tsx:69](apps/frontend/src/components/share/CcSharePageShell.tsx)). ✓
- `getCcArtistTopTracks` liefert `order=popularity_total` (Array-Order = Popularität); `getCcAlbumTracks` Release-Order ([client.ts:405-433](apps/backend/src/services/cc/jamendo/client.ts)). ✓
- Migration: Drizzle-Kit (`pnpm db:generate`/`db:migrate`), letzte `0044`; Dual-Tracker `drizzle.__drizzle_migrations` vs `public._migrations`. ✓
- Prod: share-Endpoint liefert `200`/`429`, nie selbst `404`; CC-Shares erst ab 24.06. ✓ (psql + zcli-Logs)
