/**
 * @file Public OpenAPI schemas for Creative Commons entities and their resolve:
 * Jamendo tracks, albums and artists, their classification and statistics,
 * the Bandcamp lookup and the random example. They describe the shapes in
 * `@musiccloud/shared`'s `api.ts`, and `OPENAPI_SCHEMAS` registers them with
 * the rest.
 */

/** Bandcamp availability result for one Creative Commons track. */
export const CcBandcampAvailabilityResponseSchema = {
  $id: "CcBandcampAvailabilityResponse",
  type: "object",
  description:
    "Bandcamp availability for one Creative Commons track. `bandcampUrl` is omitted when no confident matching listing exists.",
  additionalProperties: false,
  properties: {
    bandcampUrl: {
      type: "string",
      format: "uri",
      description:
        "Bandcamp track URL when a reliable listing is found. The key is omitted when the Jamendo ID is unknown or no safe match can be confirmed.",
    },
  },
  example: { bandcampUrl: "https://artist.bandcamp.com/track/take-on-me" },
} as const;

/** Random existing Creative Commons share identifier for a landing-page example. */
export const CcRandomExampleResponseSchema = {
  $id: "CcRandomExampleResponse",
  type: "object",
  description: "Random existing Creative Commons track share identifier.",
  required: ["shortId"],
  additionalProperties: false,
  properties: {
    shortId: {
      type: "string",
      description:
        "Existing Creative-Commons track share code. Pass it as `{shortId}` to `GET /api/v1/share/{shortId}` or append it to `https://musiccloud.io/`.",
    },
  },
  example: { shortId: "aBc123x" },
} as const;

/** Jamendo music classification included for Creative Commons tracks when available. */
export const CcMusicInfoSchema = {
  $id: "CcMusicInfo",
  type: "object",
  description: "Jamendo music classification for a Creative Commons track.",
  required: ["genres", "instruments", "vartags"],
  additionalProperties: false,
  properties: {
    genres: {
      type: "array",
      items: { type: "string" },
      description: "Jamendo genre tags for the track; an empty array means none were supplied.",
    },
    instruments: {
      type: "array",
      items: { type: "string" },
      description: "Jamendo instrument tags; an empty array means none were supplied.",
    },
    vartags: {
      type: "array",
      items: { type: "string" },
      description: "Jamendo mood and theme tags; an empty array means none were supplied.",
    },
    vocalInstrumental: {
      type: "string",
      description:
        "Jamendo vocal/instrumental classifier, such as `vocal` or `instrumental`. Treat the value as source-defined. The key is omitted when no classifier is supplied.",
    },
    gender: {
      type: "string",
      description:
        "Jamendo lead-vocal gender classifier. Treat the value as source-defined rather than as a fixed enum. The key is omitted when no classifier is supplied.",
    },
    speed: {
      type: "string",
      description:
        "Jamendo tempo classifier string. Treat it as source-defined rather than assuming a fixed enum. The key is omitted when unavailable.",
    },
    acousticElectric: {
      type: "string",
      description:
        "Jamendo acoustic/electric classifier. Treat the value as source-defined rather than as a fixed enum. The key is omitted when no classifier is supplied.",
    },
    lang: {
      type: "string",
      description:
        "Source-provided language code for the lyrics. Treat the value as source-defined rather than assuming one specific code standard. The key is omitted when unavailable.",
    },
  },
} as const;

/** Jamendo engagement counters included for Creative Commons tracks when available. */
export const CcTrackStatsSchema = {
  $id: "CcTrackStats",
  type: "object",
  description: "Jamendo engagement counters and user-rating data for a Creative Commons track.",
  required: ["listens", "downloads", "playlisted", "favorited", "likes", "dislikes", "avgNote", "notes"],
  additionalProperties: false,
  properties: {
    listens: { type: "number", minimum: 0, description: "Total Jamendo play count." },
    downloads: { type: "number", minimum: 0, description: "Total Jamendo download count." },
    playlisted: { type: "number", minimum: 0, description: "Number of Jamendo playlists that include the track." },
    favorited: { type: "number", minimum: 0, description: "Number of Jamendo users who favorited the track." },
    likes: { type: "number", minimum: 0, description: "Jamendo thumbs-up count." },
    dislikes: { type: "number", minimum: 0, description: "Jamendo thumbs-down count." },
    avgNote: {
      type: "number",
      minimum: 0,
      description:
        "Source-provided average Jamendo rating. Interpret it together with `notes`; do not assume a fixed rating scale.",
    },
    notes: { type: "number", minimum: 0, description: "Number of ratings contributing to `avgNote`." },
  },
} as const;

/** Full wire representation of one Creative Commons track from Jamendo. */
export const CcTrackSchema = {
  $id: "CcTrack",
  type: "object",
  description: "Creative Commons track metadata, playback URLs, and Jamendo-specific attributes.",
  required: ["jamendoId", "title", "artistName", "jamendoArtistId", "streamUrl", "downloadAllowed"],
  additionalProperties: false,
  properties: {
    jamendoId: {
      type: "string",
      pattern: "^[0-9]+$",
      description:
        "Numeric Jamendo track ID. Pass it as `{jamendoId}` to `GET /api/v1/cc/audio/{jamendoId}`, `GET /api/v1/cc/download/{jamendoId}`, or `GET /api/v1/cc/bandcamp/{jamendoId}`.",
    },
    title: { type: "string", description: "Track title reported by Jamendo." },
    artistName: { type: "string", description: "Jamendo artist display name for this track." },
    jamendoArtistId: {
      type: "string",
      pattern: "^[0-9]+$",
      description:
        "Numeric Jamendo artist ID. Pass it as `jamendoArtistId` to `GET /api/v1/cc/artist-info` together with this track's `artistName`.",
    },
    albumName: {
      type: "string",
      description: "Containing album title. The key is omitted when Jamendo supplies no album name.",
    },
    artworkUrl: {
      type: "string",
      format: "uri",
      description: "Absolute Jamendo artwork URL. The key is omitted when no artwork is available.",
    },
    durationMs: {
      type: "integer",
      minimum: 0,
      description: "Track duration in milliseconds. The key is omitted when Jamendo supplies no duration.",
    },
    releaseDate: {
      type: "string",
      format: "date",
      description: "Jamendo release date in `YYYY-MM-DD` format. The key is omitted when unavailable.",
    },
    licenseCcurl: {
      type: "string",
      format: "uri",
      description:
        "Exact Creative Commons license URL governing this track. The key is omitted when Jamendo supplies no license URL.",
    },
    streamUrl: {
      type: "string",
      format: "uri",
      description:
        "Permanent full-track Jamendo audio URL. For browser playback, byte ranges, and an API-controlled media type, use `GET /api/v1/cc/audio/{jamendoId}` instead of depending on this source URL directly.",
    },
    downloadUrl: {
      type: "string",
      format: "uri",
      description:
        "Direct Jamendo audio URL. The key is omitted when Jamendo supplies no URL. Use it only when `downloadAllowed` is `true`; prefer `GET /api/v1/cc/download/{jamendoId}` when a named attachment and an explicit `403` permission response are required.",
    },
    downloadAllowed: {
      type: "boolean",
      description:
        "Whether the track can be downloaded. Only offer `GET /api/v1/cc/download/{jamendoId}` when this value is `true`; otherwise that endpoint returns `403`.",
    },
    waveform: {
      type: "string",
      description:
        "JSON-encoded string. Call `JSON.parse(waveform)` to obtain an object shaped as `{ peaks: number[] }`. The key is omitted when Jamendo supplies no waveform.",
    },
    shareUrl: {
      type: "string",
      format: "uri",
      description: "Canonical Jamendo page for this track. The key is omitted when Jamendo supplies no page URL.",
    },
    musicInfo: {
      allOf: [{ $ref: "CcMusicInfo#" }],
      description:
        "Jamendo music classification. The key is omitted when the source supplies no classification object.",
    },
    stats: {
      allOf: [{ $ref: "CcTrackStats#" }],
      description: "Jamendo engagement counters. The key is omitted when the source supplies no statistics object.",
    },
    proLicensing: {
      type: "boolean",
      description:
        "Always `true` when included, indicating that Jamendo Pro offers commercial licensing. The key is omitted when commercial licensing is not advertised.",
    },
    proUrl: {
      type: "string",
      format: "uri",
      description: "Jamendo Pro licensing page. The key is omitted when Jamendo supplies no commercial-licensing URL.",
    },
    vinylLayout: {
      anyOf: [{ $ref: "VinylLayout#" }, { type: "null" }],
      description:
        "Discogs vinyl-layout lookup state. The key is included only on the top-level track of a resolve or share response. The key is omitted from nested track lists.",
    },
  },
} as const;

/** Creative Commons album with its independently playable Jamendo tracks. */
export const CcAlbumSchema = {
  $id: "CcAlbum",
  type: "object",
  description: "Creative Commons album metadata and its Jamendo track list.",
  required: ["jamendoId", "name", "artistName", "tracks", "vinylLayout"],
  additionalProperties: false,
  properties: {
    jamendoId: {
      type: "string",
      pattern: "^[0-9]+$",
      description:
        "Numeric Jamendo album ID used to correlate this album with Jamendo. No public request parameter accepts the bare album ID; use the result's `shortUrl` to fetch the persisted share.",
    },
    name: { type: "string", description: "Album title reported by Jamendo." },
    artistName: { type: "string", description: "Jamendo artist display name for the album." },
    artworkUrl: {
      type: "string",
      format: "uri",
      description: "Absolute Jamendo album-artwork URL. The key is omitted when no artwork is available.",
    },
    releaseDate: {
      type: "string",
      format: "date",
      description: "Jamendo album release date in `YYYY-MM-DD` format. The key is omitted when unavailable.",
    },
    zipUrl: {
      type: "string",
      format: "uri",
      description: "Full-album ZIP download URL. The key is omitted when Jamendo does not permit or expose it.",
    },
    shareUrl: {
      type: "string",
      format: "uri",
      description: "Canonical Jamendo page for this album. The key is omitted when Jamendo supplies no page URL.",
    },
    tracks: {
      type: "array",
      maxItems: 50,
      items: { $ref: "CcTrack#" },
      description:
        "Up to `50` album tracks in release order. Use each item's `jamendoId` with the CC audio or download endpoint.",
    },
    vinylLayout: {
      anyOf: [{ $ref: "VinylLayout#" }, { type: "null" }],
      description:
        "The key is always included on public `CcAlbum` objects. Its value is the Discogs-derived vinyl layout, or `null` when no suitable pressing is available.",
    },
  },
} as const;

/** Creative Commons artist with its most-popular Jamendo tracks. */
export const CcArtistSchema = {
  $id: "CcArtist",
  type: "object",
  description: "Creative Commons artist metadata and the artist's popular Jamendo tracks.",
  required: ["jamendoId", "name", "topTracks"],
  additionalProperties: false,
  properties: {
    jamendoId: {
      type: "string",
      pattern: "^[0-9]+$",
      description:
        "Numeric Jamendo artist ID. Pass it as `jamendoArtistId` to `GET /api/v1/cc/artist-info` together with this artist's `name`.",
    },
    name: { type: "string", description: "Artist display name reported by Jamendo." },
    website: {
      type: "string",
      format: "uri",
      description: "Artist-owned website. The key is omitted when Jamendo supplies none.",
    },
    imageUrl: {
      type: "string",
      format: "uri",
      description: "Absolute Jamendo artist-image URL. The key is omitted when no image is available.",
    },
    shareUrl: {
      type: "string",
      format: "uri",
      description: "Canonical Jamendo page for this artist. The key is omitted when Jamendo supplies no page URL.",
    },
    topTracks: {
      type: "array",
      maxItems: 20,
      items: { $ref: "CcTrack#" },
      description: "Up to `20` Creative Commons tracks in descending Jamendo popularity order.",
    },
  },
} as const;

/** OpenAPI schema `CcTrackResolveSuccess`: the `cc-track` variant of `CcResolveSuccess`. */
export const CcTrackResolveSuccessSchema = {
  $id: "CcTrackResolveSuccess",
  type: "object",
  description: "Successful Creative Commons track resolve.",
  required: ["type", "id", "shortUrl", "track"],
  additionalProperties: false,
  properties: {
    type: {
      type: "string",
      enum: ["cc-track"],
      description: "Discriminator: always `cc-track` for this response shape.",
    },
    id: {
      type: "string",
      description:
        "Persisted musiccloud CC-track ID for correlation. No public endpoint accepts it; use the final path segment of `shortUrl` with `GET /api/v1/share/{shortId}`.",
    },
    shortUrl: {
      type: "string",
      format: "uri",
      description: "Canonical musiccloud share URL for this Creative Commons track.",
    },
    track: {
      allOf: [{ $ref: "CcTrack#" }, { type: "object", required: ["vinylLayout"] }],
      description: "Resolved Jamendo track with its vinyl-layout lookup state.",
    },
  },
} as const;

/** OpenAPI schema `CcAlbumResolveSuccess`: the `cc-album` variant of `CcResolveSuccess`. */
export const CcAlbumResolveSuccessSchema = {
  $id: "CcAlbumResolveSuccess",
  type: "object",
  description: "Successful Creative Commons album resolve.",
  required: ["type", "id", "shortUrl", "album", "artistInfo"],
  additionalProperties: false,
  properties: {
    type: {
      type: "string",
      enum: ["cc-album"],
      description: "Discriminator: always `cc-album` for this response shape.",
    },
    id: {
      type: "string",
      description:
        "Persisted musiccloud CC-album ID for correlation. No public endpoint accepts it; use the final path segment of `shortUrl` with `GET /api/v1/share/{shortId}`.",
    },
    shortUrl: {
      type: "string",
      format: "uri",
      description: "Canonical musiccloud share URL for this Creative Commons album.",
    },
    album: {
      allOf: [{ $ref: "CcAlbum#" }, { type: "object", required: ["vinylLayout"] }],
      description: "Resolved Jamendo album with its vinyl-layout lookup state.",
    },
    artistInfo: {
      allOf: [{ $ref: "CcArtistInfo#" }],
      description: "Jamendo-derived profile, album tracks, and related-artist tracks for the album artist.",
    },
  },
} as const;

/** OpenAPI schema `CcArtistResolveSuccess`: the `cc-artist` variant of `CcResolveSuccess`. */
export const CcArtistResolveSuccessSchema = {
  $id: "CcArtistResolveSuccess",
  type: "object",
  description: "Successful Creative Commons artist resolve.",
  required: ["type", "id", "shortUrl", "artist", "artistInfo"],
  additionalProperties: false,
  properties: {
    type: {
      type: "string",
      enum: ["cc-artist"],
      description: "Discriminator: always `cc-artist` for this response shape.",
    },
    id: {
      type: "string",
      description:
        "Persisted musiccloud CC-artist ID for correlation. No public endpoint accepts it; use the final path segment of `shortUrl` with `GET /api/v1/share/{shortId}`.",
    },
    shortUrl: {
      type: "string",
      format: "uri",
      description: "Canonical musiccloud share URL for this Creative Commons artist.",
    },
    artist: {
      allOf: [{ $ref: "CcArtist#" }],
      description: "Resolved Jamendo artist and popular Creative Commons tracks.",
    },
    artistInfo: {
      allOf: [{ $ref: "CcArtistInfo#" }],
      description: "Jamendo-derived profile, popular tracks, and related-artist tracks for the resolved artist.",
    },
  },
} as const;

/** OpenAPI schema `CcResolveSuccess`: a successful Creative Commons resolve, one of the track, album and artist variants discriminated by `type`. */
export const CcResolveSuccessSchema = {
  $id: "CcResolveSuccess",
  description: "Successful Creative Commons resolve, discriminated by `type` into track, album, or artist payloads.",
  oneOf: [{ $ref: "CcTrackResolveSuccess#" }, { $ref: "CcAlbumResolveSuccess#" }, { $ref: "CcArtistResolveSuccess#" }],
} as const;
