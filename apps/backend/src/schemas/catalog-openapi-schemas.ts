/**
 * @file Public OpenAPI schemas for the catalog building blocks: tracks, albums,
 * artists, artist credits, vinyl layouts, service links and Open Graph
 * metadata. They describe the shapes in `@musiccloud/shared`'s `api.ts`, and
 * `OPENAPI_SCHEMAS` registers them with the rest.
 */

/** OpenAPI schema `ArtistCredit`: one normalized artist entity reference in a track or album credit list. */
export const ArtistCreditSchema = {
  $id: "ArtistCredit",
  type: "object",
  description:
    "Normalized artist entity reference for one display credit. `artists` remains the compatibility display array.",
  required: ["artistEntityId", "name", "role", "position"],
  additionalProperties: false,
  properties: {
    artistEntityId: {
      type: "string",
      description:
        "Stable musiccloud artist entity ID. It links credits that refer to the same artist. Pass it as `artistEntityId` to `GET /api/v1/artist-info`, `GET /api/v1/artists/{artistEntityId}/members`, or `GET /api/v1/artists/{artistEntityId}/memberships`.",
    },
    name: { type: "string", description: "Display credit exactly as stored for this track or album." },
    role: {
      type: "string",
      enum: ["main", "featured", "remixer", "producer", "composer", "lyricist", "performer", "unknown"],
      description: "Role of this artist in the credited work; use `main` for the primary performer.",
    },
    position: { type: "integer", minimum: 0, description: "Zero-based display order within the artist credits." },
  },
  example: {
    artistEntityId: "artist_a_ha",
    name: "a-ha",
    role: "main",
    position: 0,
  },
} as const;

/** OpenAPI schema `Track`: canonical commercial track metadata, referenced by resolve, link and share responses. */
export const TrackSchema = {
  $id: "Track",
  type: "object",
  description: "Canonical track metadata returned across the public API.",
  required: ["title", "artists", "vinylLayout"],
  additionalProperties: false,
  properties: {
    title: { type: "string", description: "Track title as reported by the origin service." },
    artists: {
      type: "array",
      items: { type: "string" },
      description: "Credited artists, ordered as the origin service returns them (primary first).",
    },
    artistCredits: {
      type: "array",
      items: { $ref: "ArtistCredit#" },
      description:
        "Normalized artist entity credits in display order. The key is omitted when no normalized credits are stored for this track.",
    },
    albumName: {
      type: "string",
      description: "Containing album title. The key is omitted when no album title is available.",
    },
    artworkUrl: {
      type: "string",
      format: "uri",
      description: "Absolute artwork URL. The key is omitted when no artwork is available.",
    },
    durationMs: {
      type: "integer",
      minimum: 0,
      description: "Track duration in milliseconds. The key is omitted when the duration is unavailable.",
    },
    isrc: {
      type: "string",
      description: "International Standard Recording Code. The key is omitted when the source exposes no `ISRC`.",
    },
    releaseDate: {
      type: "string",
      format: "date",
      description: "Original release date in `YYYY-MM-DD` format. The key is omitted when unavailable.",
    },
    isExplicit: {
      type: "boolean",
      description:
        "Whether the track carries an explicit-content advisory. The key is omitted when the source gives no advisory state.",
    },
    previewUrl: {
      type: "string",
      format: "uri",
      description:
        "Preview audio URL, typically an MP3 clip. The key is omitted when no usable preview is currently available.",
    },
    previewRefreshable: {
      type: "boolean",
      description:
        "Set to `true` when `previewUrl` is absent but `GET /api/v1/share/{shortId}/preview` can attempt a refresh. The key is omitted otherwise.",
    },
    vinylLayout: {
      anyOf: [{ $ref: "VinylLayout#" }, { type: "null" }],
      description:
        "The key is always included on public track response objects. Its value is the Discogs-derived vinyl layout for the containing album, or `null` when no suitable pressing is available.",
    },
  },
  example: {
    title: "Take on Me",
    artists: ["a-ha"],
    artistCredits: [{ artistEntityId: "artist_a_ha", name: "a-ha", role: "main", position: 0 }],
    albumName: "Hunting High and Low",
    artworkUrl: "https://i.scdn.co/image/ab67616d0000b273e58a0f7f1f2f8e4f6a3c8b2d",
    durationMs: 225280,
    isrc: "GBAYE8500114",
    releaseDate: "1985-06-01",
    isExplicit: false,
    previewUrl: "https://p.scdn.co/mp3-preview/7ae363b1bc5d7c6bd9cbca4d4f2ae6e3a8c7b0f5",
    vinylLayout: null,
  },
} as const;

/** OpenAPI schema for one Discogs-derived vinyl track. */
export const VinylLayoutTrackSchema = {
  $id: "VinylLayoutTrack",
  type: "object",
  description: "One track on a physical vinyl side, including its Discogs position and duration.",
  required: ["position", "title", "durationMs"],
  additionalProperties: false,
  properties: {
    position: { type: "string", description: "Discogs position string, for example `A1` or `B2`." },
    title: { type: "string", description: "Track title printed for this physical release." },
    durationMs: { type: "integer", minimum: 0, description: "Track duration in milliseconds for this vinyl pressing." },
  },
  example: {
    position: "A1",
    title: "Take on Me",
    durationMs: 225280,
  },
} as const;

/** OpenAPI schema for one physical side of a vinyl release. */
export const VinylSideSchema = {
  $id: "VinylSide",
  type: "object",
  description: "One physical vinyl side with its tracks in play order.",
  required: ["label", "tracks"],
  additionalProperties: false,
  properties: {
    label: { type: "string", description: "Physical side label, for example `A` or `B`." },
    tracks: {
      type: "array",
      items: { $ref: "VinylLayoutTrack#" },
      description: "Tracks on this physical side in playback order.",
    },
  },
  example: {
    label: "A",
    tracks: [{ position: "A1", title: "Take on Me", durationMs: 225280 }],
  },
} as const;

/** OpenAPI schema for a normalized Discogs vinyl release layout. */
export const VinylLayoutSchema = {
  $id: "VinylLayout",
  type: "object",
  description: "Discogs-derived side and track timing data for a matched vinyl release.",
  required: ["discogsReleaseId", "sides"],
  additionalProperties: false,
  properties: {
    discogsReleaseId: {
      type: "string",
      description:
        "Numeric Discogs release ID used as the layout source. Append it to `https://www.discogs.com/release/` to link to that exact pressing.",
    },
    sides: {
      type: "array",
      items: { $ref: "VinylSide#" },
      description: "Physical vinyl sides with their ordered tracks.",
    },
  },
  example: {
    discogsReleaseId: "249504",
    sides: [{ label: "A", tracks: [{ position: "A1", title: "Take on Me", durationMs: 225280 }] }],
  },
} as const;

/** OpenAPI schema `Album`: album metadata, referenced by album resolves and share pages. */
export const AlbumSchema = {
  $id: "Album",
  type: "object",
  description: "Album-level metadata, returned for album resolves and share pages.",
  required: ["title", "artists", "vinylLayout"],
  additionalProperties: false,
  properties: {
    title: { type: "string", description: "Album title as reported by the origin service." },
    artists: { type: "array", items: { type: "string" }, description: "Credited album artists in source order." },
    artistCredits: {
      type: "array",
      items: { $ref: "ArtistCredit#" },
      description:
        "Normalized artist entity credits in display order. The key is omitted when no normalized credits are available.",
    },
    releaseDate: {
      type: "string",
      format: "date",
      description: "Original album release date in `YYYY-MM-DD` format. The key is omitted when unavailable.",
    },
    totalTracks: {
      type: "integer",
      minimum: 0,
      description: "Total number of tracks. The key is omitted when the source supplies no count.",
    },
    artworkUrl: {
      type: "string",
      format: "uri",
      description: "Absolute album-artwork URL. The key is omitted when no artwork is available.",
    },
    label: { type: "string", description: "Record-label name. The key is omitted when no label is available." },
    upc: { type: "string", description: "Universal Product Code. The key is omitted when no `UPC` is available." },
    previewUrl: {
      type: "string",
      format: "uri",
      description: "Preview audio URL. The key is omitted when no usable preview is available.",
    },
    previewRefreshable: {
      type: "boolean",
      description:
        "Set to `true` on a share page when `previewUrl` is absent but `GET /api/v1/share/{shortId}/preview` can attempt a refresh. The key is omitted otherwise.",
    },
    vinylLayout: {
      anyOf: [{ $ref: "VinylLayout#" }, { type: "null" }],
      description:
        "The key is always included on public album response objects. Its value is the Discogs-derived vinyl layout, or `null` when no suitable pressing is available.",
    },
  },
  example: {
    title: "Hunting High and Low",
    artists: ["a-ha"],
    artistCredits: [{ artistEntityId: "artist_a_ha", name: "a-ha", role: "main", position: 0 }],
    releaseDate: "1985-06-01",
    totalTracks: 10,
    artworkUrl: "https://i.scdn.co/image/ab67616d0000b273e58a0f7f1f2f8e4f6a3c8b2d",
    label: "Warner Records",
    upc: "075993257228",
    previewUrl: "https://p.scdn.co/mp3-preview/7ae363b1bc5d7c6bd9cbca4d4f2ae6e3a8c7b0f5",
    vinylLayout: {
      discogsReleaseId: "249504",
      sides: [{ label: "A", tracks: [{ position: "A1", title: "Take on Me", durationMs: 225280 }] }],
    },
  },
} as const;

/** OpenAPI schema `Artist`: minimal artist metadata, referenced by artist resolves and share pages. */
export const ArtistSchema = {
  $id: "Artist",
  type: "object",
  description: "Minimal artist metadata used in artist resolves and share pages.",
  required: ["name"],
  additionalProperties: false,
  properties: {
    name: { type: "string", description: "Artist display name as reported by the origin service." },
    imageUrl: {
      type: "string",
      format: "uri",
      description: "Absolute artist-image URL. The key is omitted when no image is available.",
    },
    genres: {
      type: "array",
      items: { type: "string" },
      description: "Genre labels supplied by the source. The key is omitted when the source supplies no genre list.",
    },
  },
  example: {
    name: "a-ha",
    imageUrl: "https://i.scdn.co/image/ab6761610000e5eb6b3f4e4e2f8e4f6a3c8b2d0a",
    genres: ["synth-pop", "new wave", "pop rock"],
  },
} as const;

/** OpenAPI schema `PlatformLink`: one streaming-service deep link with its match confidence and match method. */
export const PlatformLinkSchema = {
  $id: "PlatformLink",
  type: "object",
  description: "One streaming-service link for a resolved track/album/artist.",
  required: ["service", "displayName", "url", "confidence", "matchMethod"],
  additionalProperties: false,
  properties: {
    service: {
      type: "string",
      description: "Stable service identifier, for example `spotify`, `apple-music`, or `deezer`.",
    },
    displayName: { type: "string", description: "Human-friendly service name." },
    url: { type: "string", format: "uri", description: "Deep-link that opens the item on that service." },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
      description:
        "Match confidence in the inclusive range `0` to `1`. A value of `1` is an identity match; lower values are fuzzy matches.",
    },
    matchMethod: {
      type: "string",
      enum: ["isrc", "search", "cache", "upc", "isrc-inference", "search-fallback", "source"],
      description:
        "How this link was located: `isrc` and `upc` are direct identifier matches, `isrc-inference` derives an ISRC match from related metadata, `search` is a text search, and `cache` means a previously stored link was returned. `source` is the link the request arrived on, so it is the recording by definition. `search-fallback` is the exception to all of them: nothing was found on that service, and `url` opens a search for the recording rather than the recording itself. Skip those links to keep only real matches.\n\nThe number beside it is bounded by the method: an identifier match and `source` report `1`, whilst a text search is always below it and stops around `0.99`. A confidence of `1` therefore never comes from a search, which is the comparison to filter on.",
    },
  },
  example: {
    service: "spotify",
    displayName: "Spotify",
    url: "https://open.spotify.com/track/2WfaOiMkCvy7F5fcp2zZ8L",
    confidence: 1,
    matchMethod: "isrc",
  },
} as const;

/** OpenAPI schema `OgMeta`: Open Graph metadata for a share page and its social preview. */
export const OgMetaSchema = {
  $id: "OgMeta",
  type: "object",
  description: "Open Graph metadata for rendering a share page and its social preview.",
  required: ["title", "description", "image", "url"],
  additionalProperties: false,
  properties: {
    title: { type: "string", description: "Open-Graph title for the share page." },
    description: { type: "string", description: "Open-Graph description for the share page." },
    image: {
      type: "string",
      format: "uri",
      description:
        "Open-Graph image URL. The key is always included; a service fallback image is used when no artwork exists.",
    },
    url: { type: "string", format: "uri", description: "Canonical public URL represented by these Open-Graph tags." },
  },
  example: {
    title: "a-ha — Take on Me",
    description: "Listen on Spotify, Apple Music, Deezer, YouTube Music and 16+ more services.",
    image: "https://i.scdn.co/image/ab67616d0000b273e58a0f7f1f2f8e4f6a3c8b2d",
    url: "https://musiccloud.io/aBc123x",
  },
} as const;
