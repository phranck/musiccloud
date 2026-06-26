# Artist-Info: Stale-While-Revalidate statt blockierendem Cold-Refetch

Plan-Nr.: MC-059

## Preface

Folge-Plan aus der Root-Cause-Analyse von Bug 2 ("rechte Seite der Share-Page mal voll, mal komplett leer beim Reload"). Die rechte Artist-Spalte lädt client-seitig über `/api/artist-info`; ist die Antwort langsamer als das Client-Timeout, bricht der `AbortController` ab → `Error` → `artistData = null` → alle vier Artist-Karten rendern `null` → Spalte komplett leer (kein sichtbarer Fehlerzustand).

Der Timeout ist das Symptom, nicht die Ursache. Die 5s-Schranke existiert unverändert seit 2026-04-11 (`1eebbbbd`); kein Commit im Regressions-Fenster 20.-24.6. hat sie verschärft oder die Spalte erst async gemacht (war sie schon). Die eigentliche Ursache ist Backend-/Proxy-Latenz, die unter Last die immer schon vorhandene 5s-Grenze überschreitet.

**Dominante Ursache: Shared-Capacity-Contention unter Nebenläufigkeit** (Node-Event-Loop / geteilter pg-Pool `max: 20` / Proxy-Queue) — NICHT der Upstream-Cold-Refetch. Belegt durch den warm-vs-cold-Diskriminator (Messung unten): schon reine Cache-Treffer OHNE jeden Upstream-Call brechen unter Last über 5s, während cold-unter-Last nicht schlechter ist. Der blockierende Cold-Refetch (`await Promise.all(fetches)`, [`artist-info.ts:216`](../../apps/backend/src/routes/artist-info.ts), plus bis zu 3 Similar-Fetches `:247-267`) ist ein zweiter, verstärkender Beitrag auf dem stale-Pfad, aber nicht der Haupttreiber.

Sofort-Mitigation bereits umgesetzt: Client-Timeout in [`useArtistInfo.ts:12`](../../apps/frontend/src/hooks/useArtistInfo.ts) 5s → 15s. Fängt die beobachteten 5-8s ab, beseitigt die Contention aber nicht (unter höherer Last reissen auch 15s). Dieser Plan reduziert die Ursache; der reine Warm-Contention-Rest braucht ggf. zusätzlich Pool-/Proxy-/Payload-Arbeit (siehe offene Fragen).

## Messung (2026-06-26, Prod, via `/api/artist-info`-Proxy)

Diskriminator warm-vs-cold unter Nebenläufigkeit (entscheidend):
- **Warm solo** (Cache-Hit, kein Upstream): ~1,0-1,9s.
- **Warm, N=20 parallel** (reine Cache-Hits, KEIN Upstream): p50 4,02s, max 7,40s, 2/20 > 5s, alle HTTP 200 (unabhängig reproduziert).
- **Cold, N=10 parallel** (verschiedene Artists, echter Upstream-Fan-out): p95 4,27s, 0/10 > 5s.
- Cold-unter-Last ist NICHT schlechter als warm-unter-Last → Upstream-Cold-Refetch ist nicht der primäre >5s-Treiber.

Die Latenz entsteht **downstream des Caches**, in geteilter Request-Verarbeitungs-Kapazität. Schon der warme Solo-Floor von ~1s für einen reinen Cache-Hit ist auffällig hoch (Proxy-Hop + ~10 DB-Round-Trips + JSON-Serialisierung/Schema-Validierung) und ist die Basis, auf der die Contention aufsetzt.

## Spec / Ziel

Die `/api/v1/artist-info`-Antwort liefert unabhängig von der Cache-Staleness in DB-Latenz (zweistellige Millisekunden), solange für den Artist überhaupt ein Cache-Eintrag existiert. Abgelaufene Sektionen werden sofort (stale) ausgeliefert und im Hintergrund aufgefrischt; der nächste Request sieht die frischen Daten. Nur der allererste Request für einen komplett ungecachten Artist wartet noch synchron (es gibt nichts zu servieren).

## Design

- IST: `needsTracks` / `needsProfile` / `needsEvents` werden aus den TTLs abgeleitet ([`artist-info.ts:178-180`](../../apps/backend/src/routes/artist-info.ts), TTLs `:70-73` = 7d / 183d / 24h). Die stale Sektionen werden via `await Promise.all(fetches)` aufgefrischt, BEVOR geantwortet wird (`:214-216`). Zusätzlich blockieren die `similarArtistTracks`-Cold-Fetches (`:247-267`, bis zu 3 weitere Upstream-Calls).
- SOLL: Wenn ein Cache-Eintrag existiert, sofort mit den (ggf. stale) Cache-Sektionen antworten und die Refetches der stale Sektionen OHNE `await` anstossen (fire-and-forget; die bestehenden `saveArtistCache`-Partial-Writes pro Sektion bleiben). `similarArtistTracks` ebenso aus Cache servieren, im Hintergrund auffrischen.
- Cold-Fall (`!cached`): nichts zu servieren → erste Anfrage wartet weiterhin synchron. Cold-Artists sind selten und der Client hat jetzt 15s Budget.
- Hintergrund-Hygiene: In-Flight-Registry (`Map<artistName+section, Promise>`), damit ein Besucher-Burst auf denselben stale Artist nicht N identische Upstream-Calls auslöst. Cleanup-Intervall analog zum Rate-Limiter.
- Fehler-Isolation: ein fehlgeschlagener Hintergrund-Refetch darf den Request-Lifecycle nicht beeinflussen (kein unhandled rejection; loggen, Cache unverändert lassen).
- Wirkung auf die Contention (#1): Die In-Flight-Dedup senkt die gleichzeitigen Upstream-Calls; sofortiges Antworten aus Cache verkürzt die Haltedauer pro Request (kürzere Event-Loop-/Pool-Belegung). SWR behebt aber NICHT die reine Warm-Pfad-Contention — Cache-Hits konsumieren weiter Event-Loop, eine Pool-Connection und Serialisierungszeit. Falls die Warm-unter-Last-Messung nach SWR weiter > 5s zeigt, ist das Residuum separat anzugehen (Pool-Sizing, Payload-Größe, Proxy-Concurrency/Scaling).

## Implementation

1. Handler in "served data" (aus Cache) und "refresh tasks" (stale Sektionen) aufteilen; mit served data antworten.
2. Fire-and-forget-Runner mit Per-`(artist, section)`-In-Flight-Dedup + periodischem Cleanup.
3. Synchrones `await` nur noch im `!cached`-Pfad.
4. `similarArtistTracks`: Cache servieren, Refresh in den Hintergrund-Runner.
5. Tests (vitest, `apps/backend`): (a) cached+stale → Antwort löst auf, BEVOR der gemockte Upstream-Delay abläuft; (b) Hintergrund-Refresh aktualisiert den Cache; (c) In-Flight-Dedup feuert pro Sektion nur einen Upstream-Call bei parallelen Requests; (d) `!cached` wartet weiterhin.

## Offene Fragen (brauchen Prod-Metriken)

- Welche geteilte Resource sättigt zuerst? Frontend-Proxy-Event-Loop vs. Backend-Event-Loop vs. pg-Pool. Von aussen nicht trennbar (Backend nicht public). Braucht: Event-Loop-Lag (`perf_hooks.monitorEventLoopDelay`), pg-Pool `waitingCount`/Acquire-Zeit, und ob je der 2s-`connectionTimeoutMillis` ([`postgres.ts:220`](../../apps/backend/src/db/adapters/postgres.ts)) greift.
- Echte gleichzeitige Last auf `/api/v1/artist-info` zum Zeitpunkt der leeren Spalten — alle Messungen sind synthetische Einzel-Client-Bursts.
- Warum jetzt ("3-4 Tage")? Kein Code-Change im Fenster 20.-24.6. — also umgebungsbedingt: steigender Share-Traffic, langsamer werdender Upstream, oder eine TTL-Expiry-Welle. Braucht Upstream-Latenz-Historie + Traffic-Graphen um 2026-06-20. Möglicher indirekter Verstärker: der Share-/CC-Umbau (21.-23.6.) erhöht die gesamte SSR-Last pro Seitenaufruf auf dem Frontend-Pod, dessen Event-Loop sich der Proxy-Hop teilt.
- Warmer Solo-Floor ~1s für einen Cache-Hit: Payload-Größe / Schema-Validierung (`$ref: "ArtistInfo#"`) / Serialisierung profilen.

## Checklist

- [ ] Stale Sektionen werden bei vorhandenem Cache nicht mehr awaited (Antwort sofort aus Cache)
- [ ] Hintergrund-Refresh-Runner mit Per-`(artist, section)`-In-Flight-Dedup + Cleanup
- [ ] `similarArtistTracks` aus Cache serviert, im Hintergrund aufgefrischt
- [ ] Cold-Pfad (`!cached`) wartet weiterhin synchron auf den ersten Fetch
- [ ] Tests: fast-response-while-stale, background-update, in-flight-dedup, cold-await
- [ ] Nach SWR: warm-under-concurrency erneut messen (N=20/25); bleibt p95 < 5s? Falls nicht → Pool-/Proxy-/Payload-Residuum separat angehen
- [ ] All code references verified (functions, scripts, paths, env vars, package-manager commands)

## Verified facts

- `await Promise.all(fetches)` blockiert die Antwort: [`artist-info.ts:214-216`](../../apps/backend/src/routes/artist-info.ts) (Read, 2026-06-26).
- `needsTracks/Profile/Events` + TTLs: `artist-info.ts:178-180`, `:70-73` (7d / 183d / 24h).
- `similarArtistTracks` Cold-Fetch-Fan-out: `artist-info.ts:247-267`.
- Partial-Writes pro Sektion: `repo.saveArtistCache({ artistName, ... })` (`:191`, `:200`, `:209`, `:255`).
- Interne SSR-Requests umgehen den Rate-Limiter (`!isInternalRequest`): `artist-info.ts:141` — kein 429 auf diesem Pfad.
- Client-Timeout (Mitigation, bereits 15000): [`useArtistInfo.ts:12`](../../apps/frontend/src/hooks/useArtistInfo.ts).
