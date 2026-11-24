/**
 * @file Public OpenAPI schemas for the commercial resolve and the link lookup:
 * resolve successes, disambiguation and stored link metadata. They describe
 * the shapes in `@musiccloud/shared`'s `api.ts`, and `OPENAPI_SCHEMAS`
 * registers them with the rest.
 */

/** Metadata and public service links for one previously resolved track. */
export const LinkMetadataResponseSchema = {
  $id: "LinkMetadataResponse",
  type: "object",
  description: "Stored track metadata and public service links for one previously resolved track.",
  required: ["id", "track", "links"],
  additionalProperties: false,
  properties: {
    id: {
      type: "string",
      description:
        "Persisted musiccloud track ID echoed from the request path. Obtain it from the top-level `id` of a successful track resolve.",
    },
    track: { allOf: [{ $ref: "Track#" }], description: "Stored canonical metadata for the resolved track." },
    links: {
      type: "array",
      items: { $ref: "PlatformLink#" },
      description: "Available deep-links to the track on streaming services.",
    },
  },
  example: {
    id: "tr_01HZ8N2B6P7Q8W9E3R4T5Y6U7I",
    track: {
      title: "Take on Me",
      artists: ["a-ha"],
      vinylLayout: null,
    },
    links: [
      {
        service: "spotify",
        displayName: "Spotify",
        url: "https://open.spotify.com/track/2WfaOiMkCvy7F5fcp2zZ8L",
        confidence: 1,
        matchMethod: "cache",
      },
    ],
  },
} as const;

/** OpenAPI schema `DisambiguationCandidate`: one possible match the caller picks from when a resolve query is ambiguous. */
export const DisambiguationCandidateSchema = {
  $id: "DisambiguationCandidate",
  type: "object",
  description: "A possible match returned when the query was ambiguous and the caller must pick one.",
  required: ["id", "title", "artists"],
  additionalProperties: false,
  properties: {
    id: {
      type: "string",
      description:
        "Opaque candidate ID returned only for this selection flow. Pass it unchanged as `selectedCandidate` to the same `POST /api/v1/resolve` or `POST /api/v1/cc/resolve` operation that produced the list.",
    },
    title: { type: "string", description: "Candidate track title." },
    artists: { type: "array", items: { type: "string" }, description: "Candidate track artists in source order." },
    albumName: {
      type: "string",
      description: "Candidate album title. The key is omitted when the search result supplies no album.",
    },
    artworkUrl: {
      type: "string",
      format: "uri",
      description: "Candidate artwork URL. The key is omitted when the search result supplies no artwork.",
    },
  },
  example: {
    id: "spotify:2WfaOiMkCvy7F5fcp2zZ8L",
    title: "Take on Me",
    artists: ["a-ha"],
    albumName: "Hunting High and Low",
    artworkUrl: "https://i.scdn.co/image/ab67616d0000b273e58a0f7f1f2f8e4f6a3c8b2d",
  },
} as const;

/** Example track resolve payload shared by `ResolveSuccessSchema` and `TrackResolveSuccessSchema`, so both document the same resolve. */
const RESOLVE_SUCCESS_EXAMPLE = {
  id: "tr_01HZ8N2B6P7Q8W9E3R4T5Y6U7I",
  shortUrl: "https://musiccloud.io/aBc123x",
  track: {
    title: "Take on Me",
    artists: ["a-ha"],
    albumName: "Hunting High and Low",
    artworkUrl: "https://i.scdn.co/image/ab67616d0000b273e58a0f7f1f2f8e4f6a3c8b2d",
    durationMs: 225280,
    isrc: "GBAYE8500114",
    releaseDate: "1985-06-01",
    isExplicit: false,
    previewUrl: "https://p.scdn.co/mp3-preview/7ae363b1bc5d7c6bd9cbca4d4f2ae6e3a8c7b0f5",
    vinylLayout: null,
  },
  links: [
    {
      service: "spotify",
      displayName: "Spotify",
      url: "https://open.spotify.com/track/2WfaOiMkCvy7F5fcp2zZ8L",
      confidence: 1,
      matchMethod: "isrc",
    },
    {
      service: "apple-music",
      displayName: "Apple Music",
      url: "https://music.apple.com/us/album/take-on-me/1433036073?i=1433036081",
      confidence: 1,
      matchMethod: "isrc",
    },
    {
      service: "deezer",
      displayName: "Deezer",
      url: "https://www.deezer.com/track/14408535",
      confidence: 1,
      matchMethod: "isrc",
    },
    {
      service: "youtube",
      displayName: "YouTube",
      url: "https://www.youtube.com/watch?v=djV11Xbc914",
      confidence: 0.92,
      matchMethod: "search",
    },
  ],
} as const;

/** OpenAPI schema `ResolveSuccess`: a successful track resolve without the `type` discriminator. */
export const ResolveSuccessSchema = {
  $id: "ResolveSuccess",
  type: "object",
  description: "Successful track resolve: unified metadata plus per-service deep-links.",
  required: ["id", "shortUrl", "track", "links"],
  additionalProperties: false,
  properties: {
    id: {
      type: "string",
      description:
        "Persisted musiccloud track ID. Pass this exact value as `{id}` to `GET /api/v1/link/{id}` to retrieve the stored metadata and service links again.",
    },
    shortUrl: {
      type: "string",
      format: "uri",
      description:
        "Canonical public share URL. Its final path segment is the `shortId` accepted by `GET /api/v1/share/{shortId}` and `GET /api/v1/share/{shortId}/preview`.",
    },
    track: { allOf: [{ $ref: "Track#" }], description: "Unified metadata for the resolved track." },
    links: {
      type: "array",
      items: { $ref: "PlatformLink#" },
      description: "Cross-service deep-links for the resolved track.",
    },
  },
  example: RESOLVE_SUCCESS_EXAMPLE,
} as const;

/** OpenAPI schema `ResolveDisambiguation`: the candidate list returned when a resolve cannot pick one match. */
export const ResolveDisambiguationSchema = {
  $id: "ResolveDisambiguation",
  type: "object",
  description: "Resolve could not pick one match; the caller must choose from `candidates`.",
  required: ["status", "candidates"],
  additionalProperties: false,
  properties: {
    status: {
      type: "string",
      enum: ["disambiguation"],
      description: "Always `disambiguation`; choose one item from `candidates` before resolving again.",
    },
    candidates: {
      type: "array",
      items: { $ref: "DisambiguationCandidate#" },
      description: "Candidate matches to present to the user for selection.",
    },
  },
  example: {
    status: "disambiguation",
    candidates: [
      {
        id: "spotify:2WfaOiMkCvy7F5fcp2zZ8L",
        title: "Take on Me",
        artists: ["a-ha"],
        albumName: "Hunting High and Low",
        artworkUrl: "https://i.scdn.co/image/ab67616d0000b273e58a0f7f1f2f8e4f6a3c8b2d",
      },
      {
        id: "spotify:4VqPOruhp5EdPBeR92t6lQ",
        title: "Take on Me (MTV Unplugged)",
        artists: ["a-ha"],
        albumName: "MTV Unplugged — Summer Solstice",
        artworkUrl: "https://i.scdn.co/image/ab67616d0000b27309d2e5cb5e5a8f6a3c8b2d0a",
      },
    ],
  },
} as const;

/** OpenAPI schema `AlbumResolveSuccess`: the `album` variant of `UnifiedResolveSuccess`. */
export const AlbumResolveSuccessSchema = {
  $id: "AlbumResolveSuccess",
  type: "object",
  description: "Successful album resolve: unified album metadata plus per-service deep-links.",
  required: ["type", "id", "shortUrl", "album", "links"],
  additionalProperties: false,
  properties: {
    type: { type: "string", enum: ["album"], description: "Discriminator: always `album` for this variant." },
    id: {
      type: "string",
      description:
        "Persisted musiccloud album ID for correlation. No public endpoint accepts it; use the final path segment of `shortUrl` with `GET /api/v1/share/{shortId}` to fetch the share payload.",
    },
    shortUrl: { type: "string", format: "uri", description: "Canonical musiccloud share URL for this resolved album." },
    album: {
      allOf: [{ $ref: "Album#" }, { type: "object", required: ["vinylLayout"] }],
      description: "Resolved album metadata with a mandatory vinyl lookup state.",
    },
    links: {
      type: "array",
      items: { $ref: "PlatformLink#" },
      description: "Cross-service deep-links for the resolved album.",
    },
  },
  example: {
    type: "album",
    id: "al_01HZ8P3C7Q8R9S0T1U2V3W4X5Y",
    shortUrl: "https://musiccloud.io/dEf456y",
    album: {
      title: "Hunting High and Low",
      artists: ["a-ha"],
      releaseDate: "1985-06-01",
      totalTracks: 10,
      artworkUrl: "https://i.scdn.co/image/ab67616d0000b273e58a0f7f1f2f8e4f6a3c8b2d",
      label: "Warner Records",
      upc: "075993257228",
      vinylLayout: {
        discogsReleaseId: "249504",
        sides: [{ label: "A", tracks: [{ position: "A1", title: "Take on Me", durationMs: 225280 }] }],
      },
    },
    links: [
      {
        service: "spotify",
        displayName: "Spotify",
        url: "https://open.spotify.com/album/7svV5BWuNkkZrOlxRjKyLK",
        confidence: 1,
        matchMethod: "upc",
      },
      {
        service: "apple-music",
        displayName: "Apple Music",
        url: "https://music.apple.com/us/album/hunting-high-and-low/1433036073",
        confidence: 1,
        matchMethod: "upc",
      },
    ],
  },
} as const;

/** OpenAPI schema `ArtistResolveSuccess`: the `artist` variant of `UnifiedResolveSuccess`. */
export const ArtistResolveSuccessSchema = {
  $id: "ArtistResolveSuccess",
  type: "object",
  description: "Successful artist resolve: artist metadata plus per-service deep-links.",
  required: ["type", "id", "shortUrl", "artist", "links"],
  additionalProperties: false,
  properties: {
    type: { type: "string", enum: ["artist"], description: "Discriminator: always `artist` for this variant." },
    id: {
      type: "string",
      description:
        "Persisted musiccloud artist ID for correlation. No public endpoint accepts it; use the final path segment of `shortUrl` with `GET /api/v1/share/{shortId}` to fetch the share payload.",
    },
    shortUrl: {
      type: "string",
      format: "uri",
      description: "Canonical musiccloud share URL for this resolved artist.",
    },
    artist: { allOf: [{ $ref: "Artist#" }], description: "Unified metadata for the resolved artist." },
    links: {
      type: "array",
      items: { $ref: "PlatformLink#" },
      description: "Cross-service deep-links for the resolved artist.",
    },
  },
  example: {
    type: "artist",
    id: "ar_01HZ8Q4D8R9S0T1U2V3W4X5Y6Z",
    shortUrl: "https://musiccloud.io/gHi789z",
    artist: {
      name: "a-ha",
      imageUrl: "https://i.scdn.co/image/ab6761610000e5eb6b3f4e4e2f8e4f6a3c8b2d0a",
      genres: ["synth-pop", "new wave", "pop rock"],
    },
    links: [
      {
        service: "spotify",
        displayName: "Spotify",
        url: "https://open.spotify.com/artist/26dSoYclwsYLMAKD3tpOr4",
        confidence: 1,
        matchMethod: "search",
      },
      {
        service: "apple-music",
        displayName: "Apple Music",
        url: "https://music.apple.com/us/artist/a-ha/266892",
        confidence: 1,
        matchMethod: "search",
      },
    ],
  },
} as const;

/** OpenAPI schema `TrackResolveSuccess`: the `track` variant of `UnifiedResolveSuccess`. */
export const TrackResolveSuccessSchema = {
  $id: "TrackResolveSuccess",
  type: "object",
  description: "Successful track resolve (type-discriminated variant used inside `UnifiedResolveSuccess`).",
  required: ["type", "id", "shortUrl", "track", "links"],
  additionalProperties: false,
  properties: {
    type: { type: "string", enum: ["track"], description: "Discriminator: always `track` for this variant." },
    id: {
      type: "string",
      description:
        "Persisted musiccloud track ID accepted by `GET /api/v1/link/{id}`. It is distinct from the share code in the final path segment of `shortUrl`.",
    },
    shortUrl: { type: "string", format: "uri", description: "Canonical musiccloud share URL for this resolved track." },
    track: { allOf: [{ $ref: "Track#" }], description: "Unified metadata for the resolved track." },
    links: {
      type: "array",
      items: { $ref: "PlatformLink#" },
      description: "Cross-service deep-links for the resolved track.",
    },
  },
  example: { type: "track", ...RESOLVE_SUCCESS_EXAMPLE },
} as const;

/** OpenAPI schema `UnifiedResolveSuccess`: a successful resolve, one of the track, album and artist variants discriminated by `type`. */
export const UnifiedResolveSuccessSchema = {
  $id: "UnifiedResolveSuccess",
  description:
    "Successful resolve, one of three shapes discriminated by `type`. Use `type` to decide whether to read `track`, `album`, or `artist`.",
  oneOf: [{ $ref: "TrackResolveSuccess#" }, { $ref: "AlbumResolveSuccess#" }, { $ref: "ArtistResolveSuccess#" }],
} as const;
