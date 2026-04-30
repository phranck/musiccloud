# Artist Composition Architecture

## What this is

A small layer in `apps/backend/src/services/artist-composition/` that
aggregates artist data from multiple sources (Spotify, Deezer, Last.fm,
later: MusicBrainz, crawler-layer) into one canonical artist record.
A trivial mapper translates that record into the public `ArtistProfile`
shape from `@musiccloud/shared`.

Goal: Spotify is one source among several. An outage on any single
source — including Spotify — never blanks the profile. The merge
strategy is declarative; adding a new source is a one-line strategy
edit, not a refactor.

## The four pieces

```
artist-composition/
├── types.ts        # CanonicalArtist + ArtistPartial (with __source tag)
├── strategy.ts     # ARTIST_MERGE_STRATEGY: per-field source priority
├── merge.ts        # mergeArtistPartials + pickSourceForField
└── sources/
    ├── deezer-source.ts    # composes Deezer helpers into a Partial
    ├── lastfm-source.ts    # composes Last.fm helpers into a Partial
    └── spotify-source.ts   # composes Spotify search into a Partial
```

### types.ts

`CanonicalArtist` is the union of every field that any source could
ever produce. Source-typed shapes live at the adapter layer
(`services/plugins/<source>/`); they never bleed into composition.

`ArtistPartial = Partial<CanonicalArtist> & { __source: ArtistSource }`.
The `__source` tag is what the merge function dispatches on. A source
sets only the fields it actually knows; the rest stay `undefined`.

### strategy.ts

`ARTIST_MERGE_STRATEGY: Record<keyof CanonicalArtist, ArtistSource[]>`.
Per field, an ordered list of sources to try. Reading top-to-bottom
gives a strict priority chain. Empty arrays mean "not source-driven"
(e.g., `name` is set by the caller, not picked from a partial).

### merge.ts

`mergeArtistPartials(partials, strategy, name) -> CanonicalArtist`.
For each field: walk the strategy's source list, pick the value from
the highest-priority source whose partial has a non-empty value.
Treats `null`, `undefined`, and empty arrays as "missing" so the next
source gets a chance.

`pickSourceForField(partials, strategy, field) -> ArtistSource | null`.
Companion: returns *which* source supplied the value. Used by
`fetchArtistProfile` to write the cached image with the correct
`source` tag.

### sources/

Each source-helper takes the artist name and returns
`Promise<ArtistPartial | null>`. `null` means "this source has nothing
for this artist". Sources catch their own errors and never throw out
of `fetchArtistProfile`'s `Promise.all`.

## How it plugs into the API

`services/artist-info.ts::fetchArtistProfile`:

```ts
const partials = await Promise.all([
  fetchSpotifyArtistPartial(name).catch(() => null),
  fetchDeezerArtistPartial(name).catch(() => null),
  fetchLastFmArtistPartial(name).catch(() => null),
]);
if (partials.every(p => p === null)) return null;

const merged = mergeArtistPartials(partials, ARTIST_MERGE_STRATEGY, name);

if (merged.imageUrl) {
  const source = pickSourceForField(partials, ARTIST_MERGE_STRATEGY, "imageUrl");
  cacheArtistImage(name, merged.imageUrl, source!).catch(() => {});
}

return mapCanonicalToArtistProfile(merged);
```

`fetchArtistTopTracks` is the same pattern with two sources (Deezer +
Last.fm) and returns `merged.topTracks`.

`fetchArtistEvents` does **not** use composition: tour dates are a
separate domain (event listings, not artist identity), and the merge
rules there are date+venue dedup, not source priority.

## Adding a new source

1. Add the name to `ArtistSource` in `types.ts`.
2. Create `services/plugins/<source>/...` adapter helpers if not
   already present.
3. Create `services/artist-composition/sources/<source>-source.ts`:
   compose helpers into a `Partial<CanonicalArtist>` tagged
   `__source: "<source>"`.
4. Include the source name in `ARTIST_MERGE_STRATEGY` for whichever
   fields it produces. Position determines priority.
5. Add the new partial fetch to `gatherArtistPartials` in
   `services/artist-info.ts`.

No `merge.ts` change needed.

## Test layout

- `__tests__/artist-composition/merge.test.ts` — pure-function tests
  for the priority/fallback/missing-detection rules.
- `__tests__/artist-composition/<source>-source.test.ts` — per-source
  HTTP-mock tests; assert returned `Partial` shape.
- `__tests__/artist-info.test.ts` — integration: profile + top-tracks
  with all three sources mocked, plus outage paths.

URL-routed mock dispatchers are used instead of
`mockResolvedValueOnce` chains because `Promise.all` parallelism makes
fetch ordering non-deterministic when `fetchWithTimeout` involves an
async DNS check.

## Relation to other plans

- **Crawler-layer (parked)** —
  `.claude/plans/open/2026-04-29-crawler-layer-mvp.md`. A crawler can
  emit `ArtistPartial`s tagged `__source: "musicbrainz"` (or another
  name) and plug into the same merge path with a strategy edit.
- **Static vs Dynamic Cache** — independent. Static-cache tables hold
  fixed artist/album/track records; the composition layer feeds the
  dynamic `ArtistProfile` response. They do not interact.
