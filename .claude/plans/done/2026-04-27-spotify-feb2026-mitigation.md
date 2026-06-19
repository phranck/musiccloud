# Spotify Web API February 2026 — Mitigation

Plan-Nr.: MC-006

## Context

Spotify Feb-2026 changes (effective 2026-02-11 / 2026-03-09) tighten developer access. Cross-checking the February changelog, the migration guide and the March-2026 changelog (which reverted some removals), the residual impact for musiccloud is:

- **Reverted (back to normal):** `track.external_ids` (incl. `isrc`), `album.external_ids` (incl. `upc`). March changelog: *"[REVERTED] external_ids — Known external IDs … will continue to be available."*
- **Permanently removed (no Spotify-side replacement):**
  - `album.label`
  - `artist.popularity`
  - `artist.followers`
- **`/search` `limit` capped at 10** (default 5). Adapter currently uses `limit ∈ {1, 5, 10}` — within cap.
- **Dev-mode tightening:** 1 client ID per dev, max 5 authorized users, **Spotify Premium required**. Affects QA/test accounts before 2026-03-09 — out of scope for code, must be coordinated separately.

## Direktive (User)

1. **Keine Feature-Regression.** Alle aktuell angezeigten und angebotenen Informationen müssen erhalten bleiben — auch `label`, `popularity`, `followers`. Nichts wird ersatzlos entfernt.
2. **Spotify in der Resolverkette nach hinten.** Spotify wird zunehmend restriktiv; nicht länger primäre Quelle.
3. **Spotify nur noch für gesicherte Funktionen** (URL-Detection für Spotify-Links, ISRC-Lookup, /tracks/{id}, /albums/{id}, /artists/{id}, /search innerhalb des `limit≤10`-Caps).
4. **Andere Dienste für die wegfallenden Infos.**

## Strategischer Rahmen (User-Vision)

musiccloud entwickelt sich neben dem Unified-Short-URL-Service zu einer Musik-**Suchmaschine + Daten-Aggregator**. Konsequenzen für jede Resolve-Operation ab sofort:

- **ISRC- und UPC-Sammlung maximieren.** Nicht nur den ISRC vom Source-Adapter speichern — bei jedem Resolve ALLE Adapter abgrasen und alle gefundenen ISRCs/UPCs persistieren (regionale Varianten, Re-Releases, Album-Editionen haben oft eigene Codes, die für späteres Cross-Matching kritisch sind).
- **Statische Meta archivieren, dynamische nicht.** Statisch (ein-für-allemal in DB): ISRC, UPC, title, artists, albumName, durationMs, releaseDate, isExplicit, MBID, AcoustID-Fingerprint, Songwriter/Producer-Credits, recordLabel, Genre-Tags. Dynamisch (ggf. kurzer TTL oder gar nicht persistieren): popularity, followers, listeners, scrobbles, Chart-Position, signierte Preview-URLs.
- **Datenbank wird zum Asset.** Heute: tracks-Tabelle ist Cache, der nur bei Resolve-Hits wächst. Künftig: kanonische Entity-Tabelle plus Alias-Tabellen (ein Track = N ISRCs = M External-IDs pro Service). MBID als interner Primärschlüssel sinnvoll, falls verfügbar; ISRCs/UPCs als Indizes obendrauf.
- **Crawler-Layer (später).** Bots, die proaktiv Charts, Genre-Tag-Listen, neue Releases pro Service abgrasen und in die DB unifizieren. Skaliert über die User-getriebene Resolverlast hinaus. Achtung: Spotify Dev-Mode-Limits (5 User, Premium) gelten nicht für serverseitige App-Token-Calls, aber Rate-Limits werden hart treffen — Crawler muss Token-Pools, Backoff, persistente Rate-Limit-Tracker bauen.
- **Monetarisierung der API.** Bestehender Bearer-JWT-Pfad in `routes/resolve.ts:101` ist die Basis. Künftig: Tiers, Quotas pro Token, Abrechnung. Out of scope hier; bestimmt aber, dass ab jetzt jede neue API-Antwort sauber strukturiert und stabil shape-versioniert sein muss (kein Daten-Exodus über `additionalProperties: true`).

**Auswirkung auf diesen Plan:**

- Adapter-Reihenfolge (siehe unten) bevorzugt Quellen mit hoher ISRC/UPC-Dichte und freiem Zugriff (Deezer, Apple Music, MusicBrainz). Bestätigt User-Direktive 2.
- Cross-Service-Resolve, der heute primär Links füllt, soll zusätzlich **alle ISRCs aller Treffer** in die DB schreiben (auch wenn sie nicht im aktuellen Resolve-Output erscheinen). Konkret: Schema-Erweiterung `track_isrcs(track_id, isrc, source_service, observed_at)`. Out of scope für die akute Mitigation, aber Plan dafür sollte parallel entstehen.
- `popularity`/`followers` Ersatz (Last.fm listeners, Deezer nb_fan) sind **dynamische** Werte — weiter holen und ausliefern, aber **nicht oder nur kurz cachen**, sonst ist die DB voller veralteter Reichweite-Zahlen.
- MusicBrainz wird strukturell wichtiger als zuvor: kanonische IDs + Werks-Identität + Songwriter-Credits. Ein dünner MusicBrainz-Adapter sollte spätestens nach diesem Plan kommen.

## Design

### Verfügbare Quellen (existing in repo)

| Feld | Spotify (alt) | Ersatz primär | Ersatz Fallback |
|---|---|---|---|
| `album.label` | `raw.label` | **Deezer** `album.label` (`deezer/adapter.ts:150`, keyless, im Code) | Apple Music `attrs.recordLabel` (`apple-music/adapter.ts:429`) |
| `album.upc` | `external_ids.upc` (revertiert) | Spotify (revertiert) | Deezer `album.upc`, Apple Music UPC (falls vorhanden) |
| `artist.popularity` (0–100) | `raw.popularity` | **Last.fm** `artist.getInfo` → `stats.listeners` (Last.fm-Call existiert bereits in `artist-info.ts:262`) | Deezer `artist.nb_fan` als Surrogat |
| `artist.followers` | `raw.followers.total` | **Deezer** `artist.nb_fan` (keyless, https://api.deezer.com/artist/{id}) | Last.fm `stats.listeners` als Surrogat (anderer Skala, klar in der UI labeln) |
| `track.isrc` | `external_ids.isrc` (revertiert) | Spotify (revertiert) | Deezer `track.isrc`, Apple Music ISRC |

Last.fm `listeners` und Deezer `nb_fan` sind **nicht dasselbe** wie Spotifys `popularity`/`followers`, aber beide messen Reichweite und sind die einzigen breit verfügbaren Surrogate. Skala dokumentieren, in der UI ggf. neu beschriften (`Hörer (Last.fm)`, `Fans (Deezer)`), aber nicht weglassen.

### [Neu] Resolverkette umordnen — Spotify nach hinten

`apps/backend/src/services/plugins/registry.ts:86-107` definiert `PLUGINS` als Array. `getActiveAdapters` (`registry.ts:167`) filtert, behält Reihenfolge → die Array-Reihenfolge ist die Resolverkette.

Aktuell:
```
spotifyPlugin, appleMusicPlugin, youtubePlugin, deezerPlugin, tidalPlugin, …
```

Neu:
```
deezerPlugin, appleMusicPlugin, tidalPlugin, youtubePlugin, spotifyPlugin, …
```

Begründung der neuen Top-Drei:
- **Deezer**: keyless, ISRC-fähig, hat `label`, `nb_fan`, breite Preview-URL-Coverage. Bereits Preview-Refresh-Quelle (`resolve.ts:373-386`).
- **Apple Music**: ISRC + UPC zuverlässig, `recordLabel`, hat Storefront-Logik, breite Katalogabdeckung.
- **Tidal**: ISRC, Hi-Res-Coverage, getrennt von Spotify-Risiko.

Spotify wandert ans Ende der "großen" Adapter (vor den Long-Tail-Adaptern) — bleibt aktiv für:
- Spotify-URL-Resolves (URL-Detection muss zuerst greifen wenn Input ein Spotify-Link ist; `identifyService` matched `detectUrl` über alle aktiven, Reihenfolge-unabhängig — also hier kein Problem)
- Cross-Service-Links zu Spotify (jeder andere Resolver-Hit ergänzt Spotify als Link)
- Letzter Fallback bei ISRC-Misses anderer Adapter

### Risiko: `searchTrackWithCandidates` ist NUR Spotify

Aktueller Disambiguation-Pfad (`resolver.ts:541-595`):
```
for adapter of searchAdapters {
  if (adapter.searchTrackWithCandidates) { … return candidates }
  fallback adapter.searchTrack
}
```

Heute implementiert nur Spotify `searchTrackWithCandidates` (`adapter.ts:285`). Wenn Spotify ans Ende rutscht, wird der Disambiguation-Pfad fast nie erreicht — alle vorgelagerten Adapter scheitern an der Optional-Methode oder liefern via `searchTrack` direkt einen Auto-Resolve.

Optionen:
- **(a) Deezer/AppleMusic implementieren `searchTrackWithCandidates`.** Beide haben Such-Endpunkte mit Multi-Result-Listen, das ist überschaubar. **Empfohlen.** Reihenfolge ist dann konsistent: erster Adapter mit Kandidaten gewinnt.
- (b) Logik so ändern, dass `searchTrackWithCandidates` über alle Adapter aggregiert wird, statt am ersten Treffer zu stoppen. Verbessert Trefferqualität, kostet Latenz und Komplexität.

**Empfehlung: (a)**, mit Lieferung in dieser Phase nur für Deezer (priorisiert für Top-1-Position). Apple Music danach in Folge-Plan, falls Deezer-Kandidaten nicht ausreichen.

### [1] `album.label` — Deezer primär, Apple Music Fallback

Aktuelle Quelle: Spotify in `mapAlbum` (`spotify/adapter.ts:151`). Permanent weg.

Replace-Strategie: Im Album-Resolver wird der `label` aus dem Source-Adapter genommen, wenn vorhanden. Wenn Source-Adapter Spotify ist (oder ein Adapter ohne `label`), Cross-Lookup auf Deezer (via UPC oder Title+Artist) und übernehme `label` aus dem Deezer-Album. Apple Music als zweite Stufe wenn Deezer keinen Treffer liefert.

Code-Punkte:
- `apps/backend/src/services/album-resolver.ts` — beim Cross-Service-Resolve den Deezer-Treffer ohnehin schon vorhanden; in der "fill missing fields"-Phase (analog zur bestehenden Artwork-Backfill-Logik in `resolver.ts:451-477`) Label backfillen.
- `apps/backend/src/services/plugins/spotify/adapter.ts:151` — `label`-Read kann optional bleiben, ist aber post-Feb 2026 immer `undefined`. Lassen, schadet nicht.

### [2] `artist.popularity` + `artist.followers` — Last.fm + Deezer

Aktueller Code: `apps/backend/src/services/artist-info.ts:241-250`.

Neue Quellen:
- `popularity` ← Last.fm `artist.stats.listeners`. Last.fm wird bereits angefragt (Zeile 261-275), Wert wird heute aber nur als `scrobbles` (= `playcount`) abgegriffen. Zusätzlich `listeners` extrahieren. Field `popularity` (0–100) neu interpretieren oder umbenennen:
  - **Empfehlung:** `popularity` als Feld behalten, aber Wert ist jetzt `stats.listeners` (Integer, kein 0–100). Im Schema `popularity` von `0–100` auf "non-negative integer" lockern. UI-Labels passen.
  - Alternative: neues Feld `listeners` zusätzlich, `popularity` als deprecated mit `null`. Mehr Migrations-Aufwand für Frontend.
- `followers` ← **Deezer** `nb_fan` via `https://api.deezer.com/artist/{id}`. Dafür braucht es den Deezer-Artist-ID, der als Cross-Service-Link ohnehin im Resolver-Output liegt. Wenn Deezer-Adapter nicht aktiv oder Artist nicht gefunden → Last.fm `listeners` als Notfall-Surrogat (UI muss erkennen, dass die Zahlen nicht vergleichbar sind; ggf. Quelle in Tooltip nennen).

Code-Änderungen:
- `apps/backend/src/services/plugins/deezer/adapter.ts` — neue Methode `getArtist(deezerArtistId): Promise<NormalizedArtist & { nbFan?: number }>` oder eigene `getArtistFanCount(deezerArtistId): Promise<number | null>`. Adapter-Interface in `services/types.ts` erweitern oder ein eigenes Hilfsmodul `services/plugins/deezer/artist-fans.ts`.
- `apps/backend/src/services/artist-info.ts:241-250` — Deezer-Fan-Count holen wenn Deezer-Link existiert; sonst Last.fm-Listeners als Fallback. `popularity` aus Last.fm-Listeners.
- `apps/backend/src/schemas/openapi-schemas.ts:463` — `required` lockern (Felder bleiben `required` aber Werte können null/undefined sein wenn ALLE Quellen scheitern). Type-Range bei `popularity` anpassen.

### [3] ISRC/UPC live verification

Doku-Stand eindeutig (revertiert), aber vor Verlass auf den Revert in Staging verifizieren:

```
# ISRC auf bekanntem Track
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://api.spotify.com/v1/tracks/2WfaOiMkCvy7F5fcp2zZ8L" \
  | jq '.external_ids'
# erwartet: { "isrc": "GBUM71505078" }

# UPC auf bekanntem Album
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://api.spotify.com/v1/albums/6dVIqQ8qmQ5GBnJ9shOYGE" \
  | jq '.external_ids'
# erwartet: { "upc": "<known upc>" }
```

Bei Outage: Deezer + Apple Music liefern ISRC/UPC ebenfalls; Resolver-Reihenfolge fängt das automatisch ab, weil Spotify nicht mehr Top-1 ist.

Action: Curl-Snippets in `apps/backend/docs/spotify-runbook.md` (neu) ablegen + Pre-Deploy-Checkliste auf jeder Spotify-Changelog-Notiz neu ausführen.

### [4] `MAX_CANDIDATES` guardrail

`constants.ts:52`: `MAX_CANDIDATES = 8`. Spotify `/search` neu max 10. **Heute safe** (8 ≤ 10).

Hinzufügen:
```ts
/**
 * Hard cap from Spotify Web API /search (effective 2026-02-11).
 * MAX_CANDIDATES must stay ≤ this value or candidate lists will be
 * silently truncated upstream.
 */
export const SPOTIFY_SEARCH_LIMIT_MAX = 10;
```

Plus Module-Load-Assert in derselben Datei:
```ts
if (MAX_CANDIDATES > SPOTIFY_SEARCH_LIMIT_MAX) {
  throw new Error(`MAX_CANDIDATES (${MAX_CANDIDATES}) exceeds SPOTIFY_SEARCH_LIMIT_MAX (${SPOTIFY_SEARCH_LIMIT_MAX})`);
}
```

`apps/backend/src/services/plugins/spotify/adapter.ts:308` — Hardcode `limit=10` ersetzen durch `limit=${SPOTIFY_SEARCH_LIMIT_MAX}`.

### [5] Migration guide — read

Done. Erkenntnisse oben eingearbeitet.

## Files to add

- `apps/backend/src/services/plugins/deezer/artist-fans.ts` — `fetchDeezerFanCount(artistId): Promise<number | null>`
- `apps/backend/docs/spotify-runbook.md` — Pre-Deploy-Verifikation, Fallback-Matrix
- (optional, separater Plan) `searchTrackWithCandidates` in Deezer-Adapter

## Files to modify

- `apps/backend/src/services/plugins/registry.ts:86-107` — PLUGINS-Reihenfolge: Deezer, Apple Music, Tidal, YouTube, … Spotify ans Ende der grossen Adapter
- `apps/backend/src/services/artist-info.ts:241-250` — Deezer `nb_fan` für `followers`, Last.fm `listeners` für `popularity`
- `apps/backend/src/services/album-resolver.ts` — `label` backfill via Deezer / Apple Music wenn Source-Adapter keinen liefert
- `apps/backend/src/services/constants.ts` — `SPOTIFY_SEARCH_LIMIT_MAX` + Module-Load-Guardrail
- `apps/backend/src/services/plugins/spotify/adapter.ts:308` — `limit` aus Konstante
- `apps/backend/src/schemas/openapi-schemas.ts:463-469` — `popularity`-Range, ggf. nullbar
- `apps/backend/src/__tests__/artist-info.test.ts` — Fixtures: Deezer-Fan-Mock, Last.fm-Listeners-Mock

## Verification

1. **Live Spotify Re-Check (curl):** ISRC und UPC kommen wie erwartet zurück.
2. **Resolverkette:** Free-Text-Suche `radiohead creep` → Deezer ist Top-Treffer (in Backend-Log), Spotify-Link ist Cross-Link. Nicht andersrum.
3. **Album-Label:** Spotify-Album-URL für eine 4AD-Release einreichen → Response hat `album.label = "4AD"` (gefüllt aus Deezer/Apple, nicht aus Spotify).
4. **Artist-Info:** `GET /api/v1/artists/<deezer-mapped-id>` für Radiohead → `followers` = Deezer `nb_fan`, `popularity` = Last.fm `listeners`. Beide Werte > 0.
5. **Disambiguation (sobald Deezer-Variante implementiert):** Free-Text `shake it off` → Disambiguation-Liste mit ≤ 8 Kandidaten kommt von Deezer.
6. **MAX_CANDIDATES guardrail:** lokal `MAX_CANDIDATES = 11` setzen → Backend wirft beim Start. Revert vor Commit.
7. **Bestand:** kein Frontend-Element zeigt leere Felder anstelle von Werten, die heute angezeigt werden (Album-Label, Artist-Followers, Artist-Popularity).
8. **Tests:** `cd App/apps/backend && pnpm test` grün.

## Out of scope

- Discogs als Sekundär-Label-Quelle (nur falls Deezer + Apple Music Miss-Rate in Prod-Metriken auffällt)
- Web Playback SDK
- Spotify Dev-Mode 5-User-Limit + Premium-Pflicht (organisatorisch, vor 2026-03-09 klären)

## Completed

- **Date:** 2026-04-28
- **Commit:** `bae32dc7` — Feat: Mitigate Spotify Web API February 2026 changes
- **Delivered:**
  - Resolver chain reordered: Deezer, Apple Music, Tidal, YouTube, Spotify (registry.ts).
  - `album.label` backfill in three album-resolver paths via `pickLabelFromLinks` (Deezer primary, Apple Music fallback).
  - `artist.popularity` ← Last.fm `stats.listeners`; `artist.followers` ← Deezer `nb_fan` with Last.fm listeners as fallback.
  - `SPOTIFY_SEARCH_LIMIT_MAX = 10` constant + module-load guardrail; spotify adapter `/search` reads from constant.
  - New helper `services/plugins/deezer/artist-fans.ts` — `fetchDeezerFanCount(artistId)`.
  - `ArtistProfile.popularity`/`followers` now `number | null`; OpenAPI schema loosened, range removed.
  - Frontend `ArtistProfileSection` handles nullable `followers`.
  - `apps/backend/docs/spotify-runbook.md` with curl pre-deploy verification + fallback matrix.
- **Tests added:** 5 cases for `fetchArtistProfile`, 6 cases for `fetchDeezerFanCount` (733/733 ✓).
- **Out of scope (next plans):**
  - Deezer `searchTrackWithCandidates` (option (a) from §Disambiguation risk).
  - Live Spotify ISRC/UPC re-check against staging (needs token from user).
  - UI-Translation key `artist.spotifyFollowers` rename to source-aware label.

## Current Code Audit

2026-06-06. Verified against the current codebase, not the historical commit
hash. `bae32dc7` is not present in the current local Git history, but the
implementation is present in the current files listed below. The stale
source-label UI copy and missing runbook path were corrected during this audit.

## Checklist

- [x] Resolver chain starts with Deezer, Apple Music, Tidal, YouTube and keeps Spotify behind the major primary sources.
- [x] Spotify URL detection remains order-independent through adapter detection.
- [x] Album label backfill picks Deezer labels first, Apple Music labels second, then any other surfaced label.
- [x] Artist popularity is sourced from Last.fm listener counts through the artist-composition layer.
- [x] Artist followers are sourced from Deezer `nb_fan`, with Last.fm listeners as fallback.
- [x] Deezer fan-count helper exists and handles HTTP/API/fetch failures as `null`.
- [x] `ArtistProfile.popularity` and `ArtistProfile.followers` are nullable non-negative integers in OpenAPI.
- [x] Frontend artist profile copy no longer labels the fan-count value as Spotify-specific.
- [x] Spotify per-request search cap is represented by `SPOTIFY_SEARCH_LIMIT_MAX = 10`.
- [x] Spotify candidate search pages by `offset` instead of sending a request above the per-request cap.
- [x] Spotify runbook exists at `apps/backend/docs/spotify-runbook.md` with ISRC/UPC live-check snippets and fallback matrix.
- [x] Targeted backend tests for artist info, Deezer fan count, and artist composition pass.
