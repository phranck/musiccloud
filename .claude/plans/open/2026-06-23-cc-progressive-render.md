# CC progressive render — Künstler-Info async statt blockierend

## Problem

CC-Track-Share und CC-Such-Result brauchen beide ~3s, bevor **irgendetwas** erscheint,
weil `buildCcTrackPayload` die volle Künstler-Info (Bio + Top-Tracks + ähnliche Tracks)
**blockierend** lädt: ~4 der 5 throttled Jamendo-Calls (`getCcArtistTopTracks` +
`getSimilarCcTracks` [2 intern] + `getCcArtistMusicInfo`). Der eigentliche Track
(Titel/Cover/Stream) ist nach 1 Call (`getCcTrack`, ~0.3s) da. Commercial rendert die
Kern-Card sofort und lädt die Künstler-Spalte client-seitig async (`useArtistInfo`).

## Lösung (vom User)

Kern-Card sofort rendern, Künstler-Info-Spalte **client-seitig async** nachladen + per
fade einblenden — exakt wie Commercial. CC erbt damit das Loading/Ready-Verhalten der
`AnimatedArtistColumn` automatisch. Fokus zuerst **cc-track** (der gemeldete Fall).

## Schlüssel-Fakten (verifiziert)

- `useArtistInfo` ([hooks/useArtistInfo.ts]) hat schon den async-Pfad
  (`skipArtistFetch=false` → `fetchArtistInfo` → `/api/artist-info`) und den CC-Seed-Pfad
  (`skipArtistFetch=true` + `artistDataProp`, SSR-vorgeladen).
- `buildCcArtistInfo(artistName, jamendoArtistId, columnTracks)` (cc-artist-info.ts:64)
  liefert denselben `ArtistInfoResponse` wie Commercial; `columnTracks =
  getCcArtistTopTracks(jamendoArtistId)`.
- `ApiCcTrack` (api.ts:201) trägt **kein** `jamendoArtistId` — muss ergänzt werden, weil
  der Client-Fetch ihn braucht. `CcTrack` (Jamendo-Typ) hat ihn.
- CcSharePageShell gibt `artistData={artistInfo} skipArtistFetch` an ShareLayout (Z.96).

## Scheiben

1. **Shared** ([api.ts], [endpoints.ts]): `ApiCcTrack += jamendoArtistId`; `artistInfo` in
   `CcTrackSharePageResponse` + CC-Resolve-Success optional/nullable; `ENDPOINTS.v1.ccArtistInfo`
   (`/api/v1/cc/artist-info`) + `ENDPOINTS.frontend.ccArtistInfo` (`/api/cc/artist-info`).
2. **Backend**: `toApiCcTrack += jamendoArtistId`; neue Route
   `GET /api/v1/cc/artist-info?jamendoArtistId&artistName` → `getCcArtistTopTracks` +
   `buildCcArtistInfo`; `loadCcByShortId` (cc-track) + `persistCcTrackAndRespond` bauen
   **keine** artistInfo mehr (→ `artistInfo: null`/weg), nur die Kern-Track-Card.
   Astro-Forward-Route `/api/cc/artist-info`.
3. **Frontend**: `fetchCcArtistInfo(jamendoArtistId, artistName)` (artist-info-client +
   client.ts-Forward); `useArtistInfo` `ccJamendoArtistId`-Option (CC-Kontext →
   `fetchCcArtistInfo`, 20s-Timeout). `jamendoArtistId` fliesst via
   `config.ccJamendoArtistId` (neues optionales Feld an `MediaCardContentConfiguration`) —
   `ShareLayout` liest `currentConfig.ccJamendoArtistId`; CcSharePageShell + CcShareResult
   setzen `skipArtistFetch={!config.ccJamendoArtistId}`. `artistInfo` wird überall optional
   (cc-track ungesetzt → async; album/artist seeden weiter SSR).
4. **Verify**: CC-Share + CC-Such-Result rendern Kern-Card sofort (~0.3s), Künstler-Spalte
   fadet nach; Commercial unverändert; Gates (tsc/biome/doctor).

## Verifiziert (2026-06-23)

- Gates grün: shared build, backend `tsc --noEmit`, frontend `astro check` (0 errors),
  `biome check` (763 files), `doctor:diff` (0 issues).
- Backend-Datenfluss (curl): `/api/v1/share/0nID0` (cc-track) liefert **kein** top-level
  `artistInfo`, aber `track.jamendoArtistId`; `/api/v1/cc/artist-info?jamendoArtistId&artistName`
  liefert profile + 20 topTracks + 12 similar (~2.2s); Frontend-Forward `/api/cc/artist-info` ok.
- Browser (agent-browser): **CC-Share** `/0nID0` rendert Kern-Card sofort, Spalte zeigt
  "KÜNSTLERDATEN WERDEN GELADEN" → fadet zu Bio + Tracks. **CC-Such-Result** (Freitext "funk"
  → "Funk Vision") identisch: Kern-Card sofort, Spalte "KÜNSTLERDATEN BEREIT" + Bio/Tracks.
  Commercial-Pfad unverändert (gleiches `useArtistInfo`, `ccJamendoArtistId` dort `undefined`).
  Keine Konsolen-Errors.

## Offen

- cc-album / cc-artist bleiben sync (artistInfo SSR-vorgebaut); das optionale `artistInfo`-Feld
  + `skipArtistFetch={!config.ccJamendoArtistId}` decken beide Modi schon ab — die async-Umstellung
  ist eine reine Folge-Scheibe ohne weitere Typ-Änderung.
- [x] Alle Code-Referenzen verifiziert (Routen, Endpoints, Typen).

## Folge-Fix: In-Place-Resolve via TrackResolver-Protokoll (2026-06-23)

**Problem (vom User):** Klick auf eine Popular/Similar-Zeile im CC-Modus liess das komplette
UI verschwinden + wiederkommen. Ursache: CC nutzte Sonderpfade (CcSharePageShell `navigate()`
zur frisch geminteten Short-URL = echte Astro-Navigation; CcShareResult `dispatchCcResult` in
den globalen App-State), während Commercial in `ShareLayout` in-place per `dispatchUi` +
`replaceBrowserUrlWithShortUrl` resolvte.

**Lösung (protocol-based):** Ein gemeinsames `TrackResolver`-Protokoll ([track-resolver.ts]) —
`commercialTrackResolver` (`resolveTrackQuery` → Share-/Active-Config) + `ccTrackResolver`
(`resolveCcCandidate` → `ccResultToShareProps`). `ShareLayout` konsumiert es generisch
(`trackResolver`-Prop, Default commercial): EIN `handleTrackResolve` für beide Modi, kein
`navigate`, kein globaler Dispatch. Die Sekundärkarte ist jetzt config-getrieben
(`config.ccInfoContent` → `CcInfoCard`, sonst `ServicesCard`), wechselt also beim
In-Place-Resolve automatisch mit. Entfernt: `handleSelectCcTrack` (useAppState),
`CcSharePageShell`-`navigate`-Handler, `secondaryCard`-Prop-Kette. `dispatchCcResult` nutzt
den neuen DRY-Helfer `ccResolveDataToResult` (parsers).

**Verifiziert (agent-browser, Remount-Probe auf `#main-content`):**
- CC `/0nID0` → Popular-Klick: `probe=alive` (kein Remount), Card wechselt
  (Lounge Lo-Fi → Dramatic Emotional), URL via replace (`/qce_X` → `/tSCyO`), Spalte fadet
  async, keine Konsolen-Errors (der `<ShareLayoutInner>`-Error war ein HMR-Artefakt der
  Live-Edits, bei Full-Reload weg).
- Commercial `/a5OUk` → Popular-Klick: `probe=alive`, Card wechselt
  (Never Gonna Give You Up → Especially for You), URL `/sHS1P`, keine Regression.
- Gates: `astro check` 0 errors, `biome` clean (764), `doctor:diff` 0 issues.

## Offen (Folge-Scheibe, protocol-based)

- `useAppState` `handleSubmit` / `handleSelectCandidate` / `handleSelectGenreResult` teilen
  weiterhin dasselbe `fetch` + Timeout + `mode === Cc ? ccResolve : resolve` + Error-Muster
  (4× Duplikation). Kandidat für einen gemeinsamen Resolve-Request-Helfer — noch offen.
