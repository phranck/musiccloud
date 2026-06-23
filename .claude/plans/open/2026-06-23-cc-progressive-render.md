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
3. **Frontend**: `fetchCcArtistInfo(jamendoArtistId, artistName)` (artist-info-client);
   `useArtistInfo` + `ShareLayout` CC-async-Modus (CC-Kontext → `fetchCcArtistInfo`);
   CcSharePageShell + Landing-CC-Result reichen `jamendoArtistId` durch statt `artistInfo`.
4. **Verify**: CC-Share + CC-Such-Result rendern Kern-Card sofort (~0.3s), Künstler-Spalte
   fadet nach; Commercial unverändert; Gates (tsc/biome/doctor).

## Offen / Risiko

- `useArtistInfo` + `ShareLayout` sind C+CC geteilt → Commercial-Regression-Risiko, sorgfältig.
- cc-album / cc-artist bleiben vorerst sync (artistInfo SSR) — Folge-Scheibe, nullable-Feld
  deckt beide Fälle ab.
- [ ] Alle Code-Referenzen verifiziert (Routen, Endpoints, Typen).
