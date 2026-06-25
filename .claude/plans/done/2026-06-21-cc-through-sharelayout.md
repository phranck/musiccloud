# CC-Views durch den kommerziellen ShareLayout — Implementation Plan

> **Grundprinzip (User, non-negotiable):** UI ist strikt von Logik/Daten getrennt. UI = nur Presentation. CC und kommerziell nutzen EXAKT dieselben Presentation-Komponenten (`ShareLayout`, `MediaSummaryCard`, `AnimatedArtistColumn` mit Popular Tracks / Events / Similar). Nur die Datenabfrage (Jamendo vs. kommerzielle APIs) unterscheidet sich. Einzige CC-spezifische UI: `CcInfoCard` (Lizenz/Attribution, ersetzt `ServicesCard`).

## Problem (gemeldete Symptome)

Der CC-Flow lief NICHT durch `ShareLayout`, sondern durch eigene Wrapper (`CcEntityLayout`, `CcTracksCard`, `CcMediaCard`, `CcResultView`/`CcResultCard`). Folge: kein Back-to-Genre-Button, keine Popular Tracks, keine Similar Artists, keine Events — alles Teile von `ShareLayout` / `AnimatedArtistColumn`, die CC nie erreicht hat. Doppelt gebaut.

## Ziel-Layout (rechte Spalte = `AnimatedArtistColumn`, Reihenfolge Profile → Tracks → Events → Similar)

| CC-Kind | links (Cover/Player + secondary) | rechts: „Popular Tracks"-Position | Events | Similar |
|---|---|---|---|---|
| cc-track | MediaSummaryCard (Player) + CcInfoCard | Popular Tracks des Track-Artists | leer→hidden | Similar Tracks |
| cc-album | MediaSummaryCard + CcInfoCard | Album-Trackliste (die Tracks des Albums) | leer→hidden | Similar Tracks |
| cc-artist | MediaSummaryCard + CcInfoCard | Popular Tracks des Artists | leer→hidden | Similar Tracks |

**Similar Tracks** (Entscheidung User): Jamendo hat keine Similar-Artists. Stattdessen `getSimilarCcTracks` (ähnliche Tracks von anderen Artists). Gefüttert in die kommerzielle `SimilarArtistsCard` als `SimilarArtistTrack[]` (`{ artistName, track }`).
**Events:** Jamendo liefert keine → `events: []` → `EventsCard` versteckt sich. Position bleibt (kommt automatisch, falls je Daten da wären).
**Profile:** Jamendo-Artist hat kaum Profil-Daten → `profile: null`. `ArtistProfileDesktopCard` muss bei leerem Profil sauber self-hiden (siehe Scheibe C, Risiko).

## Architektur

Datenschicht baut `ArtistInfoResponse` aus Jamendo, Presentation reicht sie durch:

- **Backend:** der CC-Resolve liefert pro Entity ein fertiges `artistInfo: ArtistInfoResponse` (topTracks je Kind = Album-Tracks bzw. Artist-Top-Tracks; `similarArtistTracks` aus `getSimilarCcTracks`; `events: []`; `profile` minimal/null). Kein neuer HTTP-Endpoint — kommt mit dem bestehenden `ccResolve`-Payload.
- **Frontend:** `ShareLayout` bekommt 4 Injection-Points mit kommerziellen Defaults: `artistData`, `skipArtistFetch`, `secondaryCard`, `onTrackResolve`. CC übergibt das fertige `artistInfo` (kein interner Fetch), die `CcInfoCard` als secondary, und den CC-Resolve-Handler.

## Scheiben

### Scheibe A: ShareLayout-Parametrisierung (kommerziell unverändert)
- 4 Props: `artistData?: ArtistInfoResponse | null`, `skipArtistFetch?: boolean`, `secondaryCard?: ReactNode`, `onTrackResolve?: (track: ArtistTopTrack) => Promise<void>`.
- Fetch-Effekt: früh `return` bei `skipArtistFetch`; bei `artistData` den `artistReducer` damit seeden.
- `secondaryCard` ersetzt das hartcodierte `<ServicesCard>` (Desktop + mobile `SharePageCard`); default = ServicesCard.
- `onTrackResolve` als Default `handleTrackResolve`; wenn Prop gesetzt, dieser.
- Commercial-Call-Sites (`ActiveShareResult`, `SharePageShell`) übergeben nichts → byte-identisch.

### Scheibe B: Backend — CC-Resolve liefert `artistInfo`
- Wire-Types: `ApiCcAlbum`/`ApiCcArtist`/`CcResolveSuccessResponse`-Familie + `artistInfo: ArtistInfoResponse`.
- Resolve baut `artistInfo` je Kind (topTracks, similar via `getSimilarCcTracks`, events []). Seed für Similar = erster Track der jeweiligen Top/Album-Liste.
- Alle Jamendo-Calls über die Drossel.

### Scheibe C: Frontend — CC durch ShareLayout + Delete
- LandingPage: `CcResultView`/`CcResultCard`-Zweig → ein `<ShareLayout>`-Aufruf je Kind (config, secondaryCard, artistData, skipArtistFetch, onTrackResolve, onBack/backLabel).
- `ccSummaryConfig` → parsers (`ccTrackToShareConfig`).
- DELETE: `CcEntityLayout.tsx`, `CcTracksCard.tsx`, `CcMediaCard.tsx`, `CcResultView`/`CcResultCard`.
- KEEP: `CcInfoCard.tsx`, alle CC-Parser/Resolve/Types.
- ggf. `ArtistProfileDesktopCard` null-Branch bei leerem Profil (Regression-Check kommerziell).
- Browser-Verify: kommerziell unverändert; CC track/album/artist = identisches Zwei-Spalten-Layout MIT Artist-Spalte (Popular/Album-Tracks + Similar) + funktionierendem Back-Button.

## Verified facts (Plan-write-time)
- `ShareLayoutProps` (ShareLayout.tsx) hat `onBack?`/`backLabel?` bereits — Back-Button ist nur eine Frage des Durchreichens.
- `getSimilarCcTracks` (services/cc/jamendo/client.ts:186), `getCcArtistTopTracks` (:286), `getCcAlbumTracks`, `getCcArtist` existieren.
- `ArtistInfoResponse` / `ArtistTopTrack` / `SimilarArtistTrack` in packages/shared/src/api.ts:349-395.
- `AnimatedArtistColumn` rendert ArtistProfileDesktopCard / PopularTracksCard / EventsCard / SimilarArtistsCard, getrieben von einer `ArtistInfoResponse`.
- CC-Resolve-Payload trägt heute schon die Tracks (`parseCcAlbumResolveResponse`/`parseCcArtistResolveResponse`).
