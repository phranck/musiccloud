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

## Relation to other subsystems

- **Crawler layer.** Live since 2026-04-28. The crawler can emit
  `ArtistPartial`s tagged `__source: "musicbrainz"` (or another name)
  and plug into the same merge path with a strategy edit.
- **Static vs Dynamic Cache.** Independent. Static-cache tables hold
  fixed artist/album/track records; the composition layer feeds the
  dynamic `ArtistProfile` response. They do not interact.
