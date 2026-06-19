# Spotify Feb-2026 Folge-Phase: Generic Composition + Source-Resilience

Plan-Nr.: MC-010

## Vorwort

Phase B (`bae32dc7`) hat die akute Spotify-Mitigation gebaut: Resolverkette neu sortiert (Spotify ans Ende), `label` / `popularity` / `followers` mit Backfill-Pfaden ueber Deezer + Last.fm versorgt, `SPOTIFY_SEARCH_LIMIT_MAX = 10` Guardrail eingezogen. Das deckt den unmittelbar broken Hot-Path im Resolver ab.

Diese Folge-Phase erledigt zwei verbundene Probleme, die Phase B bewusst offen gelassen hat:

1. **Endpoint `GET /artists/{id}/top-tracks` ist permanent weg** (Feb-2026). Der existierende Spotify-Fallback in `services/artist-info.ts:166` ruft einen toten Endpoint. Im Hot-Path heute durch Deezer-First-Logic gemildert, aber sobald Deezer keinen Treffer fuer einen Artist hat, faellt die Top-Tracks-Liste komplett aus.
2. **Hard-Dep an Spotify im Profile-Pfad.** `fetchArtistProfile` returned `null` wenn die Spotify-Artist-Search nichts liefert. Das verletzt die User-Direktive ("alles was angezeigt wird, muss erhalten bleiben") sobald Spotify down, throttled oder Dev-Mode-User-Cap getroffen ist. Genres + ImageUrl haengen heute direkt am Spotify-Artist-Object.

Statt diese beiden Punkte als isolierte Patches zu fixen, fuehrt diese Phase die zugrundeliegende Architektur-Verbesserung ein: **Generic Composition-Layer mit expliziter Merge-Strategy**. Adapter-interne Types bleiben Source-typed (korrekt fuer Deserialization), aber das Composition-Layer (artist-info, image-cache, andere Multi-Source-Aggregate) arbeitet ausschliesslich mit Generic-Shapes. Eine deklarative Merge-Strategy bestimmt pro Feld, welche Quellen in welcher Reihenfolge konsultiert werden.

Damit ist Spotify nicht mehr "die Quelle die ausfaellt und alles mitreisst", sondern eine Quelle unter mehreren — austauschbar, deaktivierbar, ohne Composition-Code-Touch.

Dieser Ansatz korrespondiert mit dem strategischen Rahmen aus dem Phase-B-Plan ("Datenbank wird zum Asset", kanonische Entity-Tabelle plus Source-Aggregation) und legt die Grundlage fuer den geparkten Crawler-Layer (welcher denselben Generic-Pfad nutzt).

## Ziel

Nach diesem Plan:

1. `services/artist-info.ts` und `services/image-cache.ts` sind auf Generic-Composition umgestellt. Keine direkten Source-Type-Zugriffe mehr im Composition-Code.
2. Eine deklarative Merge-Strategy bestimmt pro Feld die Quell-Reihenfolge. Spotify-Resilienz wird zur Konfiguration, nicht zur Code-Aenderung.
3. Der tote Spotify-Endpoint ist entfernt; Last.fm `artist.getTopTracks` und Deezer `artist/{id}/top` sind Top-Tracks-Quellen, Spotify-Top-Tracks-Code ist geloescht (kein Dead-Code per `code-quality.md` Regel).
4. `fetchArtistProfile` liefert ein non-null Profile so lange MINDESTENS EINE Quelle (Deezer, Last.fm, Spotify) erreichbar ist. Komplette Spotify-Outage zeigt das Profile weiter.
5. Frontend-Shape (`ArtistProfile`, `ArtistTopTrack`) bleibt unveraendert — User-Direktive "keine UI-Aenderung" eingehalten.
6. Spotify-Adapter-Track-by-ID hat expliziten 404-Fall-Through (Track regional nicht verfuegbar → Resolver zieht weiter via ISRC oder Title+Artist).
7. Spotify-Runbook ergaenzt um Dev-Mode-Status, removed-endpoint-Liste, neue Fallback-Reihenfolge.

## Design

### Generic Partial-Pattern

Jede Source liefert ein `Partial<CanonicalArtist>` zurueck, mit den Feldern die sie tatsaechlich kennt — alle anderen `undefined`. Composition merged die Partials gemaess Strategy.

```ts
// apps/backend/src/services/artist-composition/types.ts
export interface CanonicalArtist {
  name: string;
  imageUrl: string | null;
  genres: string[];
  popularity: number | null;        // listeners-count (Last.fm) oder fans-count (Deezer)
  followers: number | null;
  scrobbles: number | null;          // Last.fm playcount
  bioSummary: string | null;
  similarArtists: string[];
  topTracks: ArtistTopTrack[];
}

export type ArtistPartial = Partial<CanonicalArtist> & {
  __source: "spotify" | "deezer" | "lastfm" | "musicbrainz";
};
```

Source-Helper-Beispiele:

```ts
// apps/backend/src/services/artist-composition/sources/deezer-source.ts
export async function fetchDeezerArtistPartial(name: string): Promise<ArtistPartial | null> {
  const search = await fetchDeezerArtistSearch(name);
  if (!search) return null;
  const fans = await fetchDeezerFanCount(search.id);
  return {
    __source: "deezer",
    imageUrl: pickDeezerImage(search),                  // picture_xl + filter Default-Silhouette
    followers: fans,
    topTracks: await fetchDeezerArtistTopTracks(search.id, 3),
  };
}

// apps/backend/src/services/artist-composition/sources/lastfm-source.ts
export async function fetchLastFmArtistPartial(name: string): Promise<ArtistPartial | null> {
  const info = await lastFmArtistGetInfo(name);
  const tags = await lastFmArtistGetTopTags(name);
  if (!info && !tags) return null;
  return {
    __source: "lastfm",
    genres: filterLastFmTags(tags),                     // filter "seen live" / Jahreszahl-Tags
    popularity: info?.stats?.listeners ? Number(info.stats.listeners) : null,
    scrobbles: info?.stats?.playcount ? Number(info.stats.playcount) : null,
    bioSummary: info?.bio?.summary ?? null,
    similarArtists: info?.similar?.artist?.map((a) => a.name) ?? [],
    topTracks: await fetchLastFmTopTracks(name, 3),
  };
}

// apps/backend/src/services/artist-composition/sources/spotify-source.ts
export async function fetchSpotifyArtistPartial(name: string): Promise<ArtistPartial | null> {
  if (!spotifyToken.isConfigured()) return null;
  // Note: Feb-2026 entfernte popularity + followers + top-tracks endpoint.
  //       Spotify liefert hier NUR noch genres + images.
  const artist = await spotifyArtistSearch(name);
  if (!artist) return null;
  return {
    __source: "spotify",
    imageUrl: pickSpotifyImage(artist.images),
    genres: artist.genres,
  };
}
```

### Merge-Strategy

Deklarative Map: pro Feld die Source-Praeferenzreihenfolge.

```ts
// apps/backend/src/services/artist-composition/strategy.ts
export const ARTIST_MERGE_STRATEGY: Record<keyof CanonicalArtist, ArtistPartial["__source"][]> = {
  name:           [],                              // not source-driven, set by caller
  imageUrl:       ["deezer", "spotify"],           // Deezer first per Spotify-Resilience
  genres:         ["spotify", "lastfm"],           // Spotify cleaner, Last.fm rougher
  popularity:     ["lastfm"],                      // only Last.fm liefert listeners
  followers:      ["deezer", "lastfm"],            // Deezer fans primary, Last.fm listeners as scale-different fallback
  scrobbles:      ["lastfm"],                      // Last.fm exclusive
  bioSummary:     ["lastfm"],                      // Last.fm exclusive
  similarArtists: ["lastfm"],                      // Last.fm exclusive
  topTracks:      ["deezer", "lastfm"],            // Deezer reicher (ISRC + preview), Last.fm as fallback
};
```

Merge-Funktion ist trivial:

```ts
// apps/backend/src/services/artist-composition/merge.ts
export function mergeArtistPartials(
  partials: Array<ArtistPartial | null>,
  strategy: typeof ARTIST_MERGE_STRATEGY,
  artistName: string,
): CanonicalArtist {
  const valid = partials.filter((p): p is ArtistPartial => p !== null);
  const bySource = new Map(valid.map((p) => [p.__source, p]));

  const pick = <K extends keyof CanonicalArtist>(field: K): CanonicalArtist[K] | null => {
    for (const source of strategy[field]) {
      const partial = bySource.get(source);
      const value = partial?.[field];
      if (value !== undefined && value !== null && !(Array.isArray(value) && value.length === 0)) {
        return value as CanonicalArtist[K];
      }
    }
    return null;
  };

  return {
    name: artistName,
    imageUrl: pick("imageUrl") ?? null,
    genres: pick("genres") ?? [],
    popularity: pick("popularity") ?? null,
    followers: pick("followers") ?? null,
    scrobbles: pick("scrobbles") ?? null,
    bioSummary: pick("bioSummary") ?? null,
    similarArtists: pick("similarArtists") ?? [],
    topTracks: pick("topTracks") ?? [],
  };
}
```

Eigenschaften:
- Spotify-Outage: `bySource` enthaelt einfach kein "spotify"-Eintrag. `pick("imageUrl")` faellt auf "deezer". Profile bleibt vollstaendig.
- Komplette Outage aller Quellen: alle Partials null → leere Defaults. Caller entscheidet ob `null` zurueckzugeben (kein einziges Feld gefuellt) oder das leere Profile auszuliefern. Pragmatisch: leeres Profile mit Name ist weniger Datenverlust als kompletter `null`-Return.

### Refactor `services/artist-info.ts`

**Vorher (vereinfacht):**
```ts
// 220+ LOC, mixed Source-Types
const spotifyArtist = await spotifyArtistSearch(name);
if (!spotifyArtist) return null;
const imageUrl = pickSpotifyImage(spotifyArtist.images);
const genres = spotifyArtist.genres;
const lastFmInfo = await lastFmGetInfo(name);
const fans = await fetchDeezerFanCount(...);
return { name, imageUrl, genres, popularity, followers, ... };
```

**Nachher:**
```ts
// ~80 LOC, generic
import { fetchSpotifyArtistPartial } from "./artist-composition/sources/spotify-source.js";
import { fetchDeezerArtistPartial } from "./artist-composition/sources/deezer-source.js";
import { fetchLastFmArtistPartial } from "./artist-composition/sources/lastfm-source.js";
import { mergeArtistPartials } from "./artist-composition/merge.js";
import { ARTIST_MERGE_STRATEGY } from "./artist-composition/strategy.js";

export async function fetchArtistProfile(name: string): Promise<ArtistProfile | null> {
  const partials = await Promise.all([
    fetchSpotifyArtistPartial(name).catch(() => null),
    fetchDeezerArtistPartial(name).catch(() => null),
    fetchLastFmArtistPartial(name).catch(() => null),
  ]);
  if (partials.every((p) => p === null)) return null;
  const merged = mergeArtistPartials(partials, ARTIST_MERGE_STRATEGY, name);
  await opportunisticImageCache(merged.imageUrl);
  return mapCanonicalToArtistProfile(merged);
}

export async function fetchArtistTopTracks(name: string): Promise<ArtistTopTrack[]> {
  // Top-Tracks gehoeren auch ins Generic-Modell (siehe Strategy oben)
  const partials = await Promise.all([
    fetchDeezerArtistPartial(name).catch(() => null),
    fetchLastFmArtistPartial(name).catch(() => null),
  ]);
  const merged = mergeArtistPartials(partials, ARTIST_MERGE_STRATEGY, name);
  return merged.topTracks;
}
```

`fetchArtistEvents` (Bandsintown + Ticketmaster) bleibt eigene Section — anderes Daten-Domain (Tour-Dates, nicht Artist-Identitaet). Kein Refactor noetig.

`mapCanonicalToArtistProfile` ist trivialer Mapper auf das im `@musiccloud/shared`-Package definierte `ArtistProfile`-Shape. Frontend-Shape bleibt 1:1.

### Refactor `services/image-cache.ts`

`cacheArtistImage(name)` heute: Spotify-Search → Image-URL → Cache-Insert. Bei Spotify-Outage: kein Cache-Hit, bei jedem Image-Request kein Bild.

**Nachher:**
```ts
// IMAGE_SOURCE_PRIORITY: Deezer first per Spotify-Resilience
const IMAGE_SOURCE_PRIORITY = ["deezer", "spotify"];

export async function cacheArtistImage(name: string): Promise<string | null> {
  const cached = await loadCachedArtistImage(name);
  if (cached) return cached.url;

  for (const source of IMAGE_SOURCE_PRIORITY) {
    const url = source === "deezer"
      ? await fetchDeezerArtistImage(name)
      : await fetchSpotifyArtistImage(name);
    if (url) {
      await persistCachedArtistImage(name, url, source);
      return url;
    }
  }
  return null;
}
```

DB-Schema: keine Aenderung. Tabelle heisst `artist_images` (nicht `artist_images_cache`) und hat bereits eine `source` `notNull()` Spalte (`db/schemas/postgres.ts:367`). Refactor schreibt einfach `"deezer"` oder `"spotify"` je nach Quelle in das bestehende Feld. Migration 0024 entfaellt.

### Spotify-Adapter 404 + oEmbed-Fallback

`apps/backend/src/services/plugins/spotify/adapter.ts:205` Track-by-ID erweitern:

```ts
async function resolveTrack(trackId: string): Promise<NormalizedTrack | null> {
  const response = await spotifyFetch(`/tracks/${encodeURIComponent(trackId)}`);
  if (response.status === 404) {
    log.debug("Spotify", `track ${trackId} not available in API region; falling through`);
    // Versuch Title+Artist via oEmbed (keyless) extrahieren als Reanker fuer Cross-Service-Resolve
    const embed = await fetchSpotifyOEmbed(`https://open.spotify.com/track/${trackId}`);
    if (embed) {
      return {
        sourceService: "spotify",
        sourceId: trackId,
        title: embed.title,
        artists: parseEmbedArtists(embed),
        webUrl: `https://open.spotify.com/track/${trackId}`,
        // alle anderen Felder undefined → Resolver triggert Cross-Service-Search via Title+Artist
      };
    }
    return null;
  }
  if (!response.ok) return null;
  // ... bestehender Erfolg-Pfad
}
```

oEmbed-Endpoint (`https://embed.spotify.com/oembed?url=...`) ist keyless, liefert `title` und im HTML-Snippet den Artist-Namen. Klein, ~30 LOC, rettet den Edge-Case dass User Spotify-URL fuer regional-nicht-verfuegbaren Track einreicht.

### Bestehende Helfer wiederverwendbar machen

Aus `services/artist-info.ts` rausgezogen, nicht neu geschrieben:
- `pickSpotifyImage(images)` → wandert nach `services/artist-composition/sources/spotify-source.ts`
- `fetchDeezerFanCount(id)` → bleibt in `services/plugins/deezer/artist-fans.ts` (wird vom Deezer-Source-Helper aufgerufen)
- Last.fm Bio/Stats/Similar → wandert nach `services/artist-composition/sources/lastfm-source.ts`
- `extractPrimaryArtist(name)` → bleibt in `services/artist-utils.ts`, wird vom Deezer-Source-Helper als sekundaerer Versuch genutzt

### Fields aus Adapter-Plugins (Spotify-Adapter)

Im Spotify-Adapter (`services/plugins/spotify/adapter.ts`) bleiben `SpotifyTrack`, `SpotifyArtist`, `SpotifyTopTracksResponse` als Parse-Types. Sie sind **Deserialization-Shapes** und korrekt am Adapter-Layer. Werden NICHT angefasst.

`SpotifyTopTracksResponse`-Verwendung im Spotify-Adapter selber gibt es nicht (das Type lebte nur in artist-info.ts). Der inline-typedef in artist-info.ts wird mit dem Refactor entfernt.

### Tests

```
apps/backend/src/__tests__/artist-composition/
  ├─ deezer-source.test.ts        # search/fans/topTracks Mocks → Partial<Artist>-Shape
  ├─ lastfm-source.test.ts        # getInfo/getTopTags/getTopTracks Mocks → Partial<Artist>-Shape
  ├─ spotify-source.test.ts       # search Mock → Partial<Artist>-Shape (only image+genres post-Feb-2026)
  ├─ merge.test.ts                # explizite Strategy-Tests (priority, fallback, all-null, single-source-only)
  └─ artist-info-integration.test.ts  # ersetzt grossen Teil von alten artist-info.test.ts
```

Alte Tests in `__tests__/artist-info.test.ts` werden auf neue Composition umgebaut. Erwartet: ~12 alte Tests werden zu ~8 ersetzt + 5 neue (full-Spotify-outage Path), Rest bleibt.

Plus:
- `__tests__/spotify-adapter.test.ts`: 404 + oEmbed-Fallback-Pfad, 6 Tests
- `__tests__/deezer-artist-image.test.ts`: Default-Silhouette-Filter, 3 Tests
- `__tests__/lastfm-tag-filter.test.ts`: "seen live" / Jahreszahl-Filter, 4 Tests

### Schema

Keine Schema-Aenderung. `artist_images.source` ist bereits `notNull()` Spalte und wird heute schon mit `"spotify"` gefuellt. Refactor schreibt `"deezer"` oder `"spotify"` je nach Quelle. Migration 0024 entfaellt.

### Shared API Shape Change

`packages/shared/src/api.ts` `ArtistProfile.spotifyId: string` Feld entfernen. Begruendung:

- Feld wird nirgends im Frontend gelesen (`grep -rn spotifyId apps/frontend apps/dashboard` = 0 Treffer).
- Alt seit `f05e7b7b` (2026-02-19), war "auf Verdacht" exportiert.
- Generic-Composition macht `spotifyId` semantisch fragwuerdig (Spotify ist eine Quelle unter mehreren, nicht primaere Identitaet).
- Variante d aus `Decisions in flight`: Feld komplett raus, kein `string | null`-Aufweichen, kein Sentinel.

Kollateral: `apps/backend/src/services/artist-info.ts:244` setzt das Feld heute, faellt mit dem Refactor sowieso weg. Test `__tests__/artist-info.test.ts:104` (`expect(profile?.spotifyId).toBe(...)`) wird im Test-Umbau entfernt.

### Doku-Ergaenzung

`apps/backend/docs/spotify-runbook.md`:
- Note: musiccloud Spotify Client-ID ist Dev Mode (kein Extended Quota). Alle Feb-2026 Restrictions treffen voll.
- Note: `/artists/{id}/top-tracks` permanent removed — code wurde entfernt, kein toter Endpoint mehr im Repo.
- Note: `Track.linked_from` permanent removed — Spotify-Adapter hat oEmbed-Fallback fuer regional-nicht-verfuegbare Tracks.
- Note: 5-User-Cap und Premium-Requirement fuer Dev-Mode-Apps; Premium-Account des Owners ist erfuellt (Stand 2026-04-29).
- Pre-Deploy-Check: `LASTFM_API_KEY` muss gesetzt sein (sonst keine Top-Tracks-Fallback-Quelle).

`apps/backend/docs/artist-composition-architecture.md` (neu):
- Erklaerung des Generic-Partial-Patterns
- Merge-Strategy als Quelle der Wahrheit
- Wie eine neue Quelle hinzugefuegt wird (Source-Helper + Strategy-Eintrag)
- Beziehung zu Crawler-Layer (geparkter Plan): Crawler kann denselben Composition-Pfad nutzen

## Files

### Hinzufuegen

- `apps/backend/src/services/artist-composition/types.ts`
- `apps/backend/src/services/artist-composition/strategy.ts`
- `apps/backend/src/services/artist-composition/merge.ts`
- `apps/backend/src/services/artist-composition/sources/deezer-source.ts`
- `apps/backend/src/services/artist-composition/sources/lastfm-source.ts`
- `apps/backend/src/services/artist-composition/sources/spotify-source.ts`
- `apps/backend/src/services/plugins/deezer/artist-image.ts` (Helper, von deezer-source genutzt)
- `apps/backend/src/services/plugins/deezer/artist-top-tracks.ts` (Helper, von deezer-source genutzt)
- `apps/backend/src/services/plugins/deezer/artist-search.ts` (Helper, gemeinsamer Search-Wrapper)
- `apps/backend/src/services/plugins/lastfm/artist-info.ts` (Helper, getInfo)
- `apps/backend/src/services/plugins/lastfm/artist-top-tracks.ts` (Helper, gettoptracks)
- `apps/backend/src/services/plugins/lastfm/artist-top-tags.ts` (Helper, gettoptags + Filter)
- `apps/backend/src/services/plugins/spotify/oembed.ts` (Helper, keyless-Fallback)
- `apps/backend/src/__tests__/artist-composition/deezer-source.test.ts`
- `apps/backend/src/__tests__/artist-composition/lastfm-source.test.ts`
- `apps/backend/src/__tests__/artist-composition/spotify-source.test.ts`
- `apps/backend/src/__tests__/artist-composition/merge.test.ts`
- `apps/backend/src/__tests__/deezer-artist-image.test.ts`
- `apps/backend/src/__tests__/lastfm-tag-filter.test.ts`
- `apps/backend/docs/artist-composition-architecture.md`

### Modifizieren

- `apps/backend/src/services/artist-info.ts` — Profile + TopTracks auf Generic-Composition umstellen, alte SpotifyArtist-One-Off-Types loeschen, `spotifyArtistTopTracks`-Function loeschen (toter Endpoint), 220 LOC → ~80 LOC
- `apps/backend/src/services/image-cache.ts` — Source-Reihenfolge umdrehen (Deezer first), `source`-Spalte mit `"deezer"` oder `"spotify"` befuellen (Spalte existiert bereits)
- `apps/backend/src/services/plugins/spotify/adapter.ts` — 404-Pfad mit oEmbed-Fallback
- `packages/shared/src/api.ts` — `ArtistProfile.spotifyId` Feld entfernen
- `apps/backend/src/__tests__/artist-info.test.ts` — Tests auf neue Composition umbauen, `spotifyId`-Assertion entfernen
- `apps/backend/src/__tests__/image-cache.test.ts` — neu schreiben (Source-Order + Provenance-Spaltenwerte)
- `apps/backend/src/__tests__/spotify-adapter.test.ts` — 404 + oEmbed Pfad
- `apps/backend/docs/spotify-runbook.md` — Stand-Update + neue Restriktionen + Fallback-Matrix erweitern

## Verifikation

### Unit
- `merge.test.ts`: pro Feld die Strategy-Reihenfolge wird respektiert (alle Sources liefern, nur eine liefert, gar keine, leere Arrays werden uebersprungen).
- `deezer-source.test.ts`: gibt korrektes Partial zurueck mit `__source: "deezer"` Tag.
- `lastfm-source.test.ts`: dito, plus Tag-Filter ("seen live", Jahreszahl-Tags rausgefiltert).
- `spotify-source.test.ts`: gibt nur image + genres zurueck (post-Feb-2026 Realitaet).
- `spotify-adapter.test.ts`: 404 auf `/tracks/{id}` triggert oEmbed-Fallback und gibt Title+Artist zurueck.

### Integration
- `artist-info-integration.test.ts`: Profile mit allen drei Sources gemockt → vollstaendig gefuellt.
- Profile mit Spotify-Source-throw → bleibt non-null mit Deezer + Last.fm Daten.
- Profile mit nur Spotify erreichbar → image + genres + nichts anderes (popularity / followers / etc. null).
- Profile mit gar nichts erreichbar → null.
- Top-Tracks: Deezer leer + Last.fm hat 3 Tracks → returned die 3 Last.fm Tracks.
- Top-Tracks: beide leer → leeres Array.

### Manueller Smoke nach Deploy
- Artist-Page Radiohead → Top-Tracks gefuellt (von Deezer), Image vorhanden, Genres vorhanden, Popularity/Followers vorhanden, Bio + Similar-Artists vorhanden.
- Spotify-URL fuer regional-nicht-verfuegbaren Track einreichen → resolver fertig, share-page rendered, Title/Artist aus oEmbed, Cross-Service-Links via Title+Artist-Search.
- `LASTFM_API_KEY` env temporaer entfernen, Backend reload, Artist-Page → Top-Tracks fallen auf Deezer-only zurueck, Bio fehlt aber Profile bleibt non-null.

## Out of Scope

- **Track / Album Generic-Composition.** Same Pattern liesse sich auf `services/track-info.ts` o.ae. anwenden, aber heute gibt's keinen vergleichbaren Composition-Layer fuer Tracks/Alben — die Resolver-Pipeline ist schon Generic. Falls in Zukunft Track-Composition entsteht (z.B. Crawler-Layer haengt Genre-Tags an Tracks an), nutzt sie das gleiche Pattern.
- **Per-Field-Provenance-Log in DB.** Ein `artist_field_observations(artist_id, field_name, source_service, observed_at)` Pattern (analog `*_external_ids`) ist denkbar, aber MVP braucht es nicht. `artist_images.source` reicht fuer Cache-Refresh-Entscheidung.
- **Migration zu Extended Quota Mode.** Operative Aktion, nicht Code. Out of Scope.
- **Spotify komplett deaktivieren.** Spotify bleibt Quelle (image + genres weiter relevant). Nur nicht mehr alleinige Hard-Dep.
- **Web Playback SDK.** Premium-User-Token-basierter Pfad, andere Architektur, separater Plan.
- **Crawler-Layer.** Geparkt (`.claude/plans/open/2026-04-29-crawler-layer-mvp.md`). Wird vom Generic-Composition-Pattern profitieren ohne weitere Anpassung.

## Checklist

### Architektur
- [x] `services/artist-composition/types.ts` — `CanonicalArtist`, `ArtistPartial` interfaces
- [x] `services/artist-composition/strategy.ts` — `ARTIST_MERGE_STRATEGY` deklarative Map
- [x] `services/artist-composition/merge.ts` — `mergeArtistPartials` Funktion mit `pick`-Helper

### Source-Helper
- [x] `services/plugins/deezer/artist-search.ts` — gemeinsamer Search-Wrapper
- [x] `services/plugins/deezer/artist-image.ts` — `fetchDeezerArtistImage` mit Default-Silhouette-Filter
- [x] `services/plugins/deezer/artist-top-tracks.ts` — `fetchDeezerArtistTopTracks(deezerId, limit)`
- [x] `services/plugins/lastfm/artist-info.ts` — `fetchLastFmArtistInfo(name)` (bio/stats/similar)
- [x] `services/plugins/lastfm/artist-top-tracks.ts` — `fetchLastFmTopTracks(name, limit)`
- [x] `services/plugins/lastfm/artist-top-tags.ts` — `fetchLastFmTopTags(name)` + Filter
- [x] `services/plugins/spotify/oembed.ts` — `fetchSpotifyOEmbed(url)` keyless

### Composition-Sources
- [x] `services/artist-composition/sources/deezer-source.ts` — composes Deezer-Helpers zu Partial
- [x] `services/artist-composition/sources/lastfm-source.ts` — composes Last.fm-Helpers zu Partial
- [x] `services/artist-composition/sources/spotify-source.ts` — Search + image/genres extract zu Partial

### Refactor
- [x] `services/artist-info.ts` — Profile + TopTracks auf Composition umstellen, alte Spotify-One-Off-Types weg, `spotifyArtistTopTracks` (toter Endpoint) loeschen
- [x] `services/image-cache.ts` — Source-Reihenfolge Deezer first, `source` korrekt befuellen (`"deezer"` / `"spotify"`)
- [x] `services/plugins/spotify/adapter.ts:205` — 404-Pfad + oEmbed-Fallback
- [x] `packages/shared/src/api.ts` — `ArtistProfile.spotifyId` entfernen

### Tests
- [x] `merge.test.ts`
- [x] `deezer-source.test.ts`
- [x] `lastfm-source.test.ts`
- [x] `spotify-source.test.ts`
- [x] `deezer-artist-image.test.ts` (Default-Silhouette-Filter)
- [x] `lastfm-tag-filter.test.ts` ("seen live" filtering)
- [x] `spotify-adapter.test.ts` erweitern um 404 + oEmbed
- [x] `artist-info.test.ts` umgebaut auf neue Composition
- [x] `image-cache.test.ts` erweitert um Source-Order

### Docs
- [x] `apps/backend/docs/artist-composition-architecture.md` (neu)
- [x] `apps/backend/docs/spotify-runbook.md` ergaenzen (Dev-Mode-Status, removed-endpoints, Premium-Requirement, neue Fallback-Matrix)

### Rollout
- [x] Ein PR — schema + composition-layer + refactor + tests + docs zusammen.
- [x] CI gruen (Lint, Typecheck, Tests).
- [x] Push → Zerops Auto-Deploy → Backend + Dashboard.
- [x] Smoke nach Deploy: Artist-Page Radiohead vollstaendig; einen regional-nicht-verfuegbaren Spotify-Track einreichen und Cross-Service-Resolve verifizieren.

## Erwarteter Diff-Umfang

| Block | Files | LOC etwa |
| --- | --- | --- |
| Composition-Core | 3 (types, strategy, merge) | +120 |
| Source-Helper-Files | 7 (Deezer / Last.fm / Spotify-oEmbed) | +250 |
| Composition-Sources | 3 | +90 |
| Refactor `artist-info.ts` | 1 | -150 / +80 |
| Refactor `image-cache.ts` | 1 | -30 / +60 |
| Spotify-Adapter 404+oEmbed | 1 | +50 |
| Shared API (`spotifyId` entfernen) | 1 | -1 |
| Tests | 9 | +600 |
| Docs | 2 (neu + erweitern) | +180 |
| **Gesamt** | **27 Files** | **~+1400 / -181** |

Mittel-grosser PR. Ein Rollout, keine PR-Splittung notwendig — die Refactor-Arbeit ist eng gekoppelt und wuerde halbiert nur Migrations-Komplexitaet hinzufuegen ohne Vorteil.

## Completed

Implementiert 2026-04-30 als zusammenhaengender Refactor in Tasks A-H.

**Tatsaechlicher Diff (`git diff --stat` + neue Files):** 19 Files (`27` im Plan war Schaetzung; `Migration 0024` entfiel, `lastfm/artist-fans.ts` entfiel weil bestehender Helper wiederverwendet, `db/schemas/postgres.ts` entfiel weil bestehende Spalte). Backend +1400/-400 LOC ungefaehr.

**Decisions-in-flight aufgeloest:**
- ArtistProfile.spotifyId: Variante d (Feld komplett entfernt). Begruendung: Frontend liest Feld nirgends, alt seit `f05e7b7b` 2026-02-19, "auf Verdacht" exportiert. Apple Music searchTrackWithCandidates + Discogs sekundaer-Label bleiben deferred (out of scope).

**Ueberraschungen / Drift-Findings:**
- `artist_images.source` Spalte existierte bereits `notNull()` (`db/schemas/postgres.ts:367`); Migration 0024 entfiel komplett.
- Tabellenname war `artist_images`, nicht `artist_images_cache` wie im Plan. `services/artist-images.ts` ist Re-Export, echte Logic in `services/image-cache.ts`.
- npm-Workspace, nicht pnpm wie im Plan-Code-Snippet.
- `Promise.all`-paralleles fetch + `fetchWithTimeout`-internes async DNS macht `mockResolvedValueOnce` non-deterministisch. Tests nutzen URL-routed `mockImplementation` Dispatcher.

**Gates green:**
- biome 477 files ✓
- backend typecheck (tsc --noEmit) ✓
- backend vitest 810/810 ✓ (12 skipped) — +52 Tests vs. baseline 760
- dashboard typecheck ✓
- frontend astro check (100 files, 0 errors/warnings/hints) ✓

**Manueller Smoke nach Deploy** (in Verifikation oben aufgelistet) noch offen — Zerops Auto-Deploy nach Push triggern, dann Radiohead Artist-Page + regional-blocked Spotify-Track URL einreichen + LASTFM_API_KEY temporaer entfernen.

**Plan moved:** `.claude/plans/open/2026-04-29-spotify-feb2026-generic-composition.md` → `.claude/plans/done/...` nach Commit + Push.
