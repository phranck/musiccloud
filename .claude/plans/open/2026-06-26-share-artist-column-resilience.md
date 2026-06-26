# Share-Page Artist-Spalte: Resilienz gegen Backend-Latenz

Plan-Nr.: MC-060

## Vorwort

Aus der Root-Cause-Analyse der "rechte Spalte mal voll, mal leer"-Reports. Verifizierter Stand:

- Das Symptom (leere Spalte) ist ein **UI-Versagensmodus**: bei Timeout/Fehler des async `/api/artist-info`-Fetch rendern die vier Artist-Karten nichts. Die garantierte Absicherung ist, die Spalte **nie leer werden zu lassen, egal wie langsam das Backend ist**.
- Die Latenz selbst ist **pfad-spezifisch** zum artist-info-Handler (Interleave-Test: ein anderer Backend-Endpoint blieb bei 0,12s, während artist-info auf 5,4s sprang → kein container-weiter CPU-Freeze). Verstärkt durch ~10 serielle DB-Round-Trips im Handler.
- **GC unter zu wenig RAM bestätigt:** Nach dem Backend-RAM-Bump 0,25 → 1 GB (+ 2 Cores, 2 Container) fiel der echte Cache-Floor von ~0,58s auf **73ms**, p50 von ~1,0s auf 0,74s, Spike-Anteil >3s von ~25% auf ~6%. Ein seltener Mehrsekunden-Schwanz (1/32 > 5s) **bleibt** und ist noch nicht attribuiert (deshalb das Logging unten).

SWR ist als eigener Plan [[MC-059]] (`.claude/plans/open/2026-06-26-artist-info-stale-while-revalidate.md`) beschrieben; dieser Plan deckt die übrige Resilienz-Arbeit.

## Ziel

1. Die Artist-Spalte rendert **nie** leer, unabhängig von der Backend-Latenz (SSR-Prefill + Graceful Degradation).
2. Die Ursache des Rest-Spikes ist in Prod **messbar** (Slow-Path-Breadcrumb).
3. Der Warm-Pfad ist **billiger** (Round-Trip-Count von ~10 auf ~3-4).
4. Infra-Änderungen sind in `zerops.yml` **versioniert**, nicht nur im GUI.

## Design

### NOW — sichtbares Symptom killen + Ursache messbar machen

- **Slow-Path-Logging** (erledigt): `request.log.info`-Breadcrumb in [`artist-info.ts`](../../apps/backend/src/routes/artist-info.ts) nur bei totalMs > 1500, segmentiert nach alias/cacheRead/fetches/enrich + Cold-Flags + Event-Loop-Lag ([`event-loop-lag.ts`](../../apps/backend/src/lib/infra/event-loop-lag.ts)). Diskriminiert Upstream-Refetch vs. DB-Round-Trips vs. Event-Loop-Starvation. Fastify-Logger ist in Prod `level: "info"` (`server.ts:78`), in VITEST aus.
- **SSR-Prefill** der Artist-Spalte in `DeferredShareContent.astro`: artist-info server-seitig in das bestehende `Promise.all` aufnehmen und via `artistData`/`skipArtistFetch` an `SharePageShell` → `ShareLayout` durchreichen (die CC-Seite macht genau das: `CcSharePageShell.tsx:68-69`, `useArtistInfo.ts:165-169`). Kurzes Server-Budget; bei Miss Fallback auf den heutigen Client-Fetch. SSR-Fetch nutzt internen `X-API-Key` → kein Rate-Limit (kein 429-Risiko).
- **Graceful Degradation:** in [`useArtistInfo.ts`](../../apps/frontend/src/hooks/useArtistInfo.ts) bei `Error` die letzten Daten NICHT auf `null` setzen; `EventsCard`/`ArtistTrackListCard` bei Fehler Skeleton/Retry statt `return null`. Plus einmaliger Client-Retry mit Backoff vor dem Error-Zustand.

### NEXT — Warm-Pfad billiger

- **MC-059 SWR** (eigener Plan): blockierenden `await Promise.all(fetches)` (`artist-info.ts`) raus, sofort aus Cache antworten, im Hintergrund auffrischen, per-(artist,section) In-Flight-Dedup.
- **Round-Trips bündeln:** `findShortIdByTrackUrl` pro Track durch ein `WHERE source_url = ANY($1)` ersetzen (Top + Similar), Round-Trips ~10 → ~3-4.
- **HTTP-Cache:** `Cache-Control` (`public, max-age=…, stale-while-revalidate`) auf der client-seitigen artist-info-Antwort; der Astro-Proxy darf den Header nicht strippen.
- **`fetchNavigation` in-process cachen** (Header+Footer), analog zum 60s-`fetchDesignTokens`-Cache.

### SCALE — Infra + Observability (gemessen, nicht geraten)

- **Bereits angewandt (GUI):** backend 2 Container / 2 Cores / 1 GB RAM, frontend 2 Container / 2 Cores / 0,5 GB RAM, beide Shared CPU. → in `zerops.yml` festschreiben, sonst Reset-Risiko bei Deploy.
- **Dedicated CPU** nur, falls das Logging echte Event-Loop-Starvation zeigt (Lag hoch, fetches/enrich niedrig). 1h-Mindestintervall zwischen CPU-Mode-Wechseln beachten.
- **Event-Loop-Lag + pg-Pool `waitingCount`** als laufende Metrik; Alerting auf p99.
- Aux-pg-Pools (plugin-repository/image-cache/site-settings/genre-artwork, je max:2) gegen postgres `max_connections` prüfen, bevor der Haupt-Pool (max:20) angefasst wird.

## Checklist

- [x] Slow-Path-Breadcrumb + Event-Loop-Lag-Modul (NOW)
- [ ] SSR-Prefill der Artist-Spalte (NOW)
- [ ] Graceful Degradation: Spalte nicht leeren bei Fehler + Client-Retry (NOW)
- [ ] Round-Trips bündeln (`source_url = ANY($1)`) (NEXT)
- [ ] HTTP-`Cache-Control` auf artist-info + Proxy reicht ihn durch (NEXT)
- [ ] `fetchNavigation` in-process cachen (NEXT)
- [ ] GUI-Scaling-Werte in `zerops.yml` festschreiben (SCALE)
- [ ] Nach Prod-Daten: Rest-Spike-Ursache attribuiert, Dedicated-CPU-Entscheidung gemessen (SCALE)
- [ ] All code references verified (functions, scripts, paths, env vars, package-manager commands)

## Verified facts

- Fastify-Logger Prod-Level: `apps/backend/src/server.ts:78` (`level: "info"` in production, `false` unter VITEST).
- Blank-Spalte-Mechanik: `useArtistInfo.ts` (`Error` → `artistData: null`), `AnimatedArtistColumn.tsx` (Karten `return null`).
- CC-SSR-Prefill-Vorbild: `CcSharePageShell.tsx:68-69` (`artistData` + `skipArtistFetch`), `useArtistInfo.ts:165-169` (Seed ohne Fetch).
- Warm-Pfad-Round-Trips: `artist-info.ts` `findArtistCache` + per-Track `findShortIdByTrackUrl` + 3x Similar; batchbar via `postgres-tracks.ts` `findShortIdByTrackUrl` (auf `ANY($1)` erweitern).
- Interner Bypass (kein 429 für SSR-Prefill): `artist-info.ts` `!isInternalRequest`; `client.ts` `internalHeaders` mit `X-API-Key`.
- Messung RAM-Bump (2026-06-26): Floor 0,58s → 0,073s, p50 ~1,0s → 0,74s, >3s ~25% → ~6%, 1/32 > 5s Rest-Schwanz.
