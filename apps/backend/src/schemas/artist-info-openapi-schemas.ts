/**
 * @file Public OpenAPI schemas for artist info, commercial and Creative Commons:
 * top tracks, profiles, events and related artists. They describe the
 * shapes in `@musiccloud/shared`'s `api.ts`, and `OPENAPI_SCHEMAS` registers
 * them with the rest.
 */

/** OpenAPI schema `ArtistTopTrack`: one of an artist's top commercial tracks. */
export const ArtistTopTrackSchema = {
  $id: "ArtistTopTrack",
  type: "object",
  description: "One of an artist's top commercial tracks, selected from the available artist metadata sources.",
  required: ["title", "artists", "albumName", "artworkUrl", "durationMs", "deezerUrl", "shortId"],
  additionalProperties: false,
  properties: {
    title: { type: "string", description: "Top-track title." },
    artists: {
      type: "array",
      items: { type: "string" },
      description: "Top-track artist display names in source order.",
    },
    albumName: {
      type: "string",
      nullable: true,
      description: "The key is always included. Its value is the containing album title, or `null` when unavailable.",
    },
    artworkUrl: {
      type: "string",
      nullable: true,
      format: "uri",
      description: "The key is always included. Its value is the artwork URL, or `null` when unavailable.",
    },
    durationMs: {
      type: "integer",
      nullable: true,
      minimum: 0,
      description: "The key is always included. Its value is the duration in milliseconds, or `null` when unavailable.",
    },
    deezerUrl: {
      type: "string",
      format: "uri",
      description:
        "Compatibility field containing a Deezer or Last.fm track URL. Send it as `query` to `POST /api/v1/resolve` for a full resolve; do not infer the provider from the key name.",
    },
    shortId: {
      type: "string",
      nullable: true,
      description:
        "The key is always included. Its value is a musiccloud share code accepted by `GET /api/v1/share/{shortId}`, or `null` when this top track has no persisted share.",
    },
  },
  example: {
    title: "Take on Me",
    artists: ["a-ha"],
    albumName: "Hunting High and Low",
    artworkUrl: "https://e-cdns-images.dzcdn.net/images/cover/abc123/500x500-000000-80-0-0.jpg",
    durationMs: 225280,
    deezerUrl: "https://www.deezer.com/track/14408535",
    shortId: "aBc123x",
  },
} as const;

/** OpenAPI schema `ArtistProfile`: the commercial artist profile assembled from public metadata sources. */
export const ArtistProfileSchema = {
  $id: "ArtistProfile",
  type: "object",
  description:
    "Commercial artist profile assembled from available public metadata. An object can contain only `null` values and empty arrays when an artist match exists but individual profile fields are unavailable.",
  required: ["imageUrl", "genres", "popularity", "followers", "bioSummary", "scrobbles", "similarArtists"],
  additionalProperties: false,
  properties: {
    imageUrl: {
      type: "string",
      nullable: true,
      format: "uri",
      description:
        "The key is always included. Its value is the best available artist image URL, or `null` when unavailable.",
    },
    genres: {
      type: "array",
      items: { type: "string" },
      maxItems: 3,
      description: "Up to `3` genre labels; an empty array means none are available.",
    },
    popularity: {
      type: "integer",
      nullable: true,
      minimum: 0,
      description:
        "The key is always included. Its value is a non-negative audience-reach count, or `null` when no source supplies one; it is not a `0`–`100` score.",
    },
    followers: {
      type: "integer",
      nullable: true,
      minimum: 0,
      description:
        "The key is always included. Its value is a non-negative fan or listener count, or `null` when unavailable.",
    },
    bioSummary: {
      type: "string",
      nullable: true,
      description: "The key is always included. Its value is a short artist biography, or `null` when unavailable.",
    },
    scrobbles: {
      type: "integer",
      nullable: true,
      minimum: 0,
      description: "The key is always included. Its value is the aggregate play count, or `null` when unavailable.",
    },
    similarArtists: {
      type: "array",
      items: { type: "string" },
      maxItems: 5,
      description: "Up to `5` related artist names; an empty array means no related artists are available.",
    },
  },
  example: {
    imageUrl: "https://i.scdn.co/image/ab6761610000e5eb6b3f4e4e2f8e4f6a3c8b2d0a",
    genres: ["synth-pop", "new wave", "pop rock"],
    popularity: 1840321,
    followers: 2840192,
    bioSummary:
      "a-ha are a Norwegian synth-pop band formed in Oslo in 1982. The band was founded by Morten Harket, Magne Furuholmen and Paul Waaktaar-Savoy.",
    scrobbles: 128340921,
    similarArtists: ["Morten Harket", "Magne Furuholmen", "Savoy"],
  },
} as const;

/** OpenAPI schema `ArtistEvent`: one upcoming live event from Bandsintown or Ticketmaster. */
export const ArtistEventSchema = {
  $id: "ArtistEvent",
  type: "object",
  description: "Upcoming live event sourced from Bandsintown or Ticketmaster.",
  required: ["date", "venueName", "city", "country", "ticketUrl", "source"],
  additionalProperties: false,
  properties: {
    date: { type: "string", format: "date", description: "Event date in `YYYY-MM-DD` format." },
    venueName: { type: "string", description: "Venue name supplied by the event provider." },
    city: { type: "string", description: "City in which the event takes place." },
    country: {
      type: "string",
      description:
        "Country supplied by the event source. It may be an ISO `3166-1 alpha-2` code such as `NO` or a country name; clients must support both forms.",
    },
    ticketUrl: {
      type: "string",
      nullable: true,
      format: "uri",
      description:
        "The key is always included. Its value is the ticket or event-details URL, or `null` when the event source exposes none.",
    },
    source: {
      type: "string",
      enum: ["bandsintown", "ticketmaster"],
      description: "Provider identifier: `bandsintown` or `ticketmaster`.",
    },
  },
  example: {
    date: "2026-07-18",
    venueName: "Oslo Spektrum",
    city: "Oslo",
    country: "NO",
    ticketUrl: "https://www.ticketmaster.no/event/a-ha-oslo-spektrum-18-jul-2026",
    source: "ticketmaster",
  },
} as const;

/** OpenAPI schema `SimilarArtistTrack`: one related artist with that artist's selected top track. */
export const SimilarArtistTrackSchema = {
  $id: "SimilarArtistTrack",
  type: "object",
  description:
    "One related artist and that artist's selected top track. The object is always present in `similarArtistTracks`; its `track` value can be `null`.",
  required: ["artistName", "track"],
  additionalProperties: false,
  properties: {
    artistName: { type: "string", description: "Similar artist's display name." },
    track: {
      anyOf: [{ $ref: "ArtistTopTrack#" }, { type: "null" }],
      description:
        "The key is always included. Its value is the related artist's selected top track, or `null` when no resolvable track is available.",
    },
  },
  example: {
    artistName: "Savoy",
    track: {
      title: "Velvet",
      artists: ["Savoy"],
      albumName: "Mountains of Time",
      artworkUrl: "https://e-cdns-images.dzcdn.net/images/cover/def456/500x500-000000-80-0-0.jpg",
      durationMs: 218000,
      deezerUrl: "https://www.deezer.com/track/987654",
      shortId: null,
    },
  },
} as const;

/** OpenAPI schema `ArtistInfo`: commercial artist metadata with top tracks, profile, events and related artists. */
export const ArtistInfoSchema = {
  $id: "ArtistInfo",
  type: "object",
  description:
    "Commercial artist metadata with selected tracks, profile data, and upcoming events. Every top-level key is included so clients can distinguish an empty list or `null` profile from a missing field.",
  required: ["artistName", "topTracks", "profile", "events", "similarArtistTracks"],
  additionalProperties: false,
  properties: {
    artistName: {
      type: "string",
      description:
        "Artist display name actually used for the lookup after input normalization and optional `shortId` alias resolution.",
    },
    topTracks: {
      type: "array",
      items: { $ref: "ArtistTopTrack#" },
      maxItems: 5,
      description:
        "Up to `5` selected top tracks. The key is always included; an empty array means no tracks were found.",
    },
    profile: {
      anyOf: [{ $ref: "ArtistProfile#" }, { type: "null" }],
      description:
        "The key is always included. Its value is the assembled profile, or `null` when no metadata source returned an artist match. Inspect the profile's individual nullable fields and arrays rather than assuming every field is populated.",
    },
    events: {
      type: "array",
      items: { $ref: "ArtistEvent#" },
      maxItems: 5,
      description: "Up to `5` upcoming events. The key is always included; an empty array means no events were found.",
    },
    similarArtistTracks: {
      type: "array",
      items: { $ref: "SimilarArtistTrack#" },
      maxItems: 5,
      description:
        "Top-track lookup for up to `5` related artists. The key is always included; an empty array means no related artists or tracks were found.",
    },
  },
  example: {
    artistName: "a-ha",
    topTracks: [
      {
        title: "Take on Me",
        artists: ["a-ha"],
        albumName: "Hunting High and Low",
        artworkUrl: "https://e-cdns-images.dzcdn.net/images/cover/abc123/500x500-000000-80-0-0.jpg",
        durationMs: 225280,
        deezerUrl: "https://www.deezer.com/track/14408535",
        shortId: "aBc123x",
      },
    ],
    profile: {
      imageUrl: "https://i.scdn.co/image/ab6761610000e5eb6b3f4e4e2f8e4f6a3c8b2d0a",
      genres: ["synth-pop", "new wave", "pop rock"],
      popularity: 1840321,
      followers: 2840192,
      bioSummary: "a-ha are a Norwegian synth-pop band formed in Oslo in 1982.",
      scrobbles: 128340921,
      similarArtists: ["Morten Harket", "Magne Furuholmen", "Savoy"],
    },
    events: [
      {
        date: "2026-07-18",
        venueName: "Oslo Spektrum",
        city: "Oslo",
        country: "NO",
        ticketUrl: "https://www.ticketmaster.no/event/a-ha-oslo-spektrum-18-jul-2026",
        source: "ticketmaster",
      },
    ],
    similarArtistTracks: [
      {
        artistName: "Savoy",
        track: {
          title: "Velvet",
          artists: ["Savoy"],
          albumName: "Mountains of Time",
          artworkUrl: "https://e-cdns-images.dzcdn.net/images/cover/def456/500x500-000000-80-0-0.jpg",
          durationMs: 218000,
          deezerUrl: "https://www.deezer.com/track/987654",
          shortId: null,
        },
      },
    ],
  },
} as const;

/** OpenAPI schema `CcArtistTopTrack`: one Jamendo track in Creative Commons artist metadata. */
export const CcArtistTopTrackSchema = {
  $id: "CcArtistTopTrack",
  type: "object",
  description: "One Jamendo track returned as Creative Commons artist metadata.",
  required: ["title", "artists", "albumName", "artworkUrl", "durationMs", "deezerUrl", "shortId"],
  additionalProperties: false,
  properties: {
    title: { type: "string", description: "Jamendo track title." },
    artists: { type: "array", items: { type: "string" }, description: "Jamendo artist display names in source order." },
    albumName: {
      anyOf: [{ type: "string" }, { type: "null" }],
      description: "The key is always included. Its value is the album title, or `null` when Jamendo supplies none.",
    },
    artworkUrl: {
      anyOf: [{ type: "string", format: "uri" }, { type: "null" }],
      description: "The key is always included. Its value is the artwork URL, or `null` when unavailable.",
    },
    durationMs: {
      anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }],
      description: "The key is always included. Its value is the duration in milliseconds, or `null` when unavailable.",
    },
    deezerUrl: {
      type: "string",
      pattern: "^jamendo:[0-9]+$",
      description:
        "Compatibility field containing an opaque `jamendo:<trackId>` candidate token, not a URL. Pass it as `selectedCandidate` to `POST /api/v1/cc/resolve`.",
    },
    shortId: {
      type: "string",
      nullable: true,
      description:
        "The key is always included and its value is always `null`; this response does not perform share-code lookup for its track rows. Resolve `deezerUrl` through `POST /api/v1/cc/resolve` to obtain a share code.",
    },
  },
  example: {
    title: "Creative Commons Track",
    artists: ["Jamendo Artist"],
    albumName: "Open Album",
    artworkUrl: "https://usercontent.jamendo.com/example.jpg",
    durationMs: 210000,
    deezerUrl: "jamendo:123456",
    shortId: null,
  },
} as const;

/** OpenAPI schema `CcArtistProfile`: the Jamendo artist profile, with unavailable counters as explicit `null` values. */
export const CcArtistProfileSchema = {
  $id: "CcArtistProfile",
  type: "object",
  description:
    "Jamendo artist profile with every compatibility key represented explicitly, including unavailable counters as `null`.",
  required: ["imageUrl", "genres", "popularity", "followers", "bioSummary", "scrobbles", "similarArtists"],
  additionalProperties: false,
  properties: {
    imageUrl: {
      anyOf: [{ type: "string", format: "uri" }, { type: "null" }],
      description: "The key is always included. Its value is the Jamendo artist image URL, or `null` when unavailable.",
    },
    genres: {
      type: "array",
      items: { type: "string" },
      maxItems: 3,
      description: "Up to `3` Jamendo genre labels; an empty array means none are available.",
    },
    popularity: {
      type: "integer",
      nullable: true,
      description:
        "The key is always included and its value is always `null`; Jamendo artist-info exposes no compatible reach count.",
    },
    followers: {
      type: "integer",
      nullable: true,
      description:
        "The key is always included and its value is always `null`; Jamendo artist-info exposes no compatible follower count.",
    },
    bioSummary: {
      anyOf: [{ type: "string" }, { type: "null" }],
      description: "The key is always included. Its value is the Jamendo biography, or `null` when unavailable.",
    },
    scrobbles: {
      type: "integer",
      nullable: true,
      description:
        "The key is always included and its value is always `null`; Jamendo exposes no compatible scrobble count.",
    },
    similarArtists: {
      type: "array",
      maxItems: 0,
      items: { type: "string" },
      description:
        "The key is always included as an empty array because this response carries related tracks separately.",
    },
  },
  example: {
    imageUrl: "https://usercontent.jamendo.com/example-artist.jpg",
    genres: ["ambient"],
    popularity: null,
    followers: null,
    bioSummary: null,
    scrobbles: null,
    similarArtists: [],
  },
} as const;

/** OpenAPI schema `CcSimilarArtistTrack`: one related Jamendo artist with a resolvable track by that artist. */
export const CcSimilarArtistTrackSchema = {
  $id: "CcSimilarArtistTrack",
  type: "object",
  description: "One related Jamendo artist and a resolvable Creative-Commons track by that artist.",
  required: ["artistName", "track"],
  additionalProperties: false,
  properties: {
    artistName: { type: "string", description: "Related Jamendo artist display name." },
    track: {
      allOf: [{ $ref: "CcArtistTopTrack#" }],
      description:
        "Resolvable related track. The key and object are always included for every item in `similarArtistTracks`.",
    },
  },
} as const;

/** OpenAPI schema `CcArtistInfo`: Creative Commons artist metadata derived from Jamendo. */
export const CcArtistInfoSchema = {
  $id: "CcArtistInfo",
  type: "object",
  description:
    "Creative Commons artist metadata derived from Jamendo. Every top-level key is included. `events` is always empty, while unavailable profile counters remain explicit `null` values.",
  required: ["artistName", "topTracks", "profile", "events", "similarArtistTracks"],
  additionalProperties: false,
  properties: {
    artistName: {
      type: "string",
      description: "Artist display label associated with the supplied Jamendo artist ID.",
    },
    topTracks: {
      type: "array",
      items: { $ref: "CcArtistTopTrack#" },
      description:
        "The key is always included. For `GET /api/v1/cc/artist-info` and `cc-artist` payloads it contains up to `20` tracks in descending Jamendo popularity order; for `cc-album` payloads it contains up to `50` album tracks in release order. An empty array means no tracks could be returned.",
    },
    profile: {
      anyOf: [{ $ref: "CcArtistProfile#" }, { type: "null" }],
      description:
        "The key is always included. Its value is the Jamendo profile, or `null` when no image, genre, or biography metadata can be returned.",
    },
    events: {
      type: "array",
      maxItems: 0,
      items: { $ref: "ArtistEvent#" },
      description: "The key is always included as an empty array because this CC response does not provide event data.",
    },
    similarArtistTracks: {
      type: "array",
      maxItems: 12,
      items: { $ref: "CcSimilarArtistTrack#" },
      description:
        "Up to `12` tracks by distinct related artists, excluding the requested artist. The key is always included; an empty array means no related tracks could be returned.",
    },
  },
  example: {
    artistName: "Jamendo Artist",
    topTracks: [
      {
        title: "Creative Commons Track",
        artists: ["Jamendo Artist"],
        albumName: "Open Album",
        artworkUrl: "https://usercontent.jamendo.com/example.jpg",
        durationMs: 210000,
        deezerUrl: "jamendo:123456",
        shortId: null,
      },
    ],
    profile: null,
    events: [],
    similarArtistTracks: [],
  },
} as const;
