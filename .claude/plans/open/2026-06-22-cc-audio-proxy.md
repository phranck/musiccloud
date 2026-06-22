# CC-Audio-Proxy + „Song"-Wording

## Problem

Im CC-Modus zeigt der Player „Vorschau nicht verfügbar", obwohl der Track abspielbar ist
(Download + „Auf Jamendo öffnen" funktionieren). Zwei Punkte:

1. **Bug:** Der Player setzt immer `audio.crossOrigin = "anonymous"`
   ([AudioPreviewPlayer.tsx:877](apps/frontend/src/components/audio/AudioPreviewPlayer.tsx#L877)) —
   nötig für den Web-Audio-Analyzer (`createMediaElementSource`). Jamendos Storage-Server
   beantwortet den CORS-**Range**-Preflight nicht so wie Deezers CDN (kein
   `Access-Control-Allow-Headers: Range`). Verifiziert: dieselbe MP3-URL lädt **ohne**
   `crossOrigin` (`loadedmetadata ok`), failt **mit** `crossOrigin` (`MEDIA_ELEMENT_ERROR` code 4).
2. **Wording:** „Preview" ist für CC falsch — es sind vollständige Tracks.

## Entscheidung (vom User)

- Audio: **Backend-CORS-Proxy** (voller Funktionsumfang inkl. Spektrum-Visualizer).
- Wording: **„Song"** (DE/EN).

## Architektur

**Same-origin-Proxy** statt Cross-Origin: Audio läuft über eine Astro-Route
`/api/cc/audio/:jamendoId` → Backend `/api/v1/cc/audio/:jamendoId` → Jamendo. Weil das
Audio-Element dann same-origin lädt, gibt es **kein** CORS-Problem und der Analyzer bleibt
funktionsfähig (Quelle nicht „tainted"). Der Player bleibt unverändert generisch
(`crossOrigin` schadet bei same-origin nicht).

Die `stream_url` ist laut Schema **permanent** (kein Expiry,
[postgres.ts:1303](apps/backend/src/db/schemas/postgres.ts#L1303)) → kein Refresh-Mechanismus
nötig, reiner Lookup per `jamendoId`.

## Scheiben

1. **Backend-Proxy** (`apps/backend/src/routes/cc-audio.ts`): Route
   `GET /api/v1/cc/audio/:jamendoId`. `stream_url` per `jamendoId` aus `cc_tracks` (neue
   schlanke Lookup-Funktion in `postgres-cc.ts`, Fallback `getCcTrack`). Jamendo-Audio
   per `fetch` mit durchgereichtem `Range`-Header laden, Response streamen mit
   Status (200/206), `Content-Type`, `Content-Range`, `Accept-Ranges`, `Content-Length`.
   Rate-Limiting wie `share-preview`. Registrieren in `server.ts`.
2. **Shared endpoints** ([endpoints.ts](packages/shared/src/endpoints.ts)): `ccAudio` in
   `ENDPOINTS.v1` (`/api/v1/cc/audio/:jamendoId`), `ENDPOINTS` client
   (`/api/cc/audio/:jamendoId`), `ROUTE_TEMPLATES.v1`.
3. **Astro-Forward** (`apps/frontend/src/pages/api/cc/audio/[jamendoId].ts`): dünner Proxy
   zum Backend, `Range`-Header + Stream + Status durchreichen (Muster:
   `pages/api/share-preview/[shortId].ts`).
4. **Frontend** ([parsers.ts](apps/frontend/src/lib/resolve/parsers.ts)): in
   `ccTrackToShareConfig` (Z. 589) `previewUrl: cc.streamUrl` → `previewUrl =
   ENDPOINTS.ccAudio(cc.jamendoId)` (same-origin relativ).
5. **Player-Wording** ([AudioPreviewPlayer.tsx](apps/frontend/src/components/audio/AudioPreviewPlayer.tsx)):
   neue Prop `mediaKind: "preview" | "song"` (vom CC-Config gesetzt). Conditional i18n:
   `audio.songUnavailable`, Status „SONG PLAYING", aria „Play/Pause song". Commercial
   bleibt „Preview". Neue i18n-Keys in `en.json`/`de.json`.
6. **Verify**: Browser (Audio spielt, Spektrum-Visualizer läuft, Wording „Song"), Gates
   (tsc, doctor:diff, biome), evtl. Backend-Tests.

## Verified facts (Stand 2026-06-22)

- `audio.crossOrigin = "anonymous"` — AudioPreviewPlayer.tsx:877 (grep).
- `previewUrl: cc.streamUrl` — parsers.ts:589; `ccResponseToResult` mappt `jamendoId` +
  `streamUrl` — parsers.ts:671-693 (Read).
- `stream_url` permanent — postgres.ts:1303; `cc_tracks.jamendoId` unique index
  `uq_cc_tracks_jamendo_id` — postgres.ts:1329 (grep).
- Jamendo `audio` = mp31 MP3, kein `audioformat`-Param gesetzt — client.ts:94-123,136 (Read).
- Route-Muster: `ROUTE_TEMPLATES.v1.sharePreview` + `apiRateLimiter`/`isInternalRequest` —
  share-preview.ts (Read). CORS: `@fastify/cors` `origin: CORS_ORIGIN` — server.ts:86 (Read).
- Astro-Proxy-Muster: `prerender = false`, `APIRoute`, `BACKEND_URL` —
  pages/api/share-preview/[shortId].ts (Read).
- [ ] Noch zu verifizieren bei Execute: `getCcTrack`-Signatur, Pool-Zugriff in
  `postgres-cc.ts`, exakte Wording-Keys/Zeilen im Player, `BACKEND_URL`-Forward-Helper
  (`@/api/client`).
