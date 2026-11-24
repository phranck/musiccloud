/**
 * @file Public OpenAPI schemas for share pages: the six share page variants, their
 * union and the preview refresh. They describe the shapes in
 * `@musiccloud/shared`'s `api.ts`, and `OPENAPI_SCHEMAS` registers them with
 * the rest.
 */

/** Refreshed Deezer preview URL for a commercial track or album share. */
export const SharePreviewResponseSchema = {
  $id: "SharePreviewResponse",
  type: "object",
  description: "Refreshed Deezer preview URL for a commercial track or album share.",
  required: ["previewUrl"],
  additionalProperties: false,
  properties: {
    previewUrl: {
      anyOf: [{ type: "string", format: "uri" }, { type: "null" }],
      description:
        "The key is always included. Its value is a currently usable preview URL, or `null` when no preview can be produced for the track or album.",
    },
  },
  example: { previewUrl: "https://cdn.example.com/previews/take-on-me.mp3" },
} as const;

/** OpenAPI schema `TrackSharePageResponse`: the commercial `track` variant of `SharePage`. */
export const TrackSharePageResponseSchema = {
  $id: "TrackSharePageResponse",
  type: "object",
  description: "Commercial share-page payload for one resolved track.",
  required: ["type", "og", "track", "links", "shortUrl"],
  additionalProperties: false,
  properties: {
    type: { type: "string", enum: ["track"], description: "Always `track` for this response shape." },
    og: { allOf: [{ $ref: "OgMeta#" }], description: "Open-Graph metadata for rendering and social sharing." },
    track: { allOf: [{ $ref: "Track#" }], description: "Stored canonical track metadata." },
    links: {
      type: "array",
      items: { $ref: "PlatformLink#" },
      description: "Stored cross-service deep-links for this track.",
    },
    shortUrl: { type: "string", format: "uri", description: "Canonical musiccloud share URL for this track." },
  },
} as const;

/** OpenAPI schema `AlbumSharePageResponse`: the commercial `album` variant of `SharePage`. */
export const AlbumSharePageResponseSchema = {
  $id: "AlbumSharePageResponse",
  type: "object",
  description: "Commercial share-page payload for one resolved album.",
  required: ["type", "og", "album", "links", "shortUrl"],
  additionalProperties: false,
  properties: {
    type: { type: "string", enum: ["album"], description: "Always `album` for this response shape." },
    og: { allOf: [{ $ref: "OgMeta#" }], description: "Open-Graph metadata for rendering and social sharing." },
    album: { allOf: [{ $ref: "Album#" }], description: "Stored canonical album metadata." },
    links: {
      type: "array",
      items: { $ref: "PlatformLink#" },
      description: "Stored cross-service deep-links for this album.",
    },
    shortUrl: { type: "string", format: "uri", description: "Canonical musiccloud share URL for this album." },
  },
} as const;

/** OpenAPI schema `ArtistSharePageResponse`: the commercial `artist` variant of `SharePage`. */
export const ArtistSharePageResponseSchema = {
  $id: "ArtistSharePageResponse",
  type: "object",
  description: "Commercial share-page payload for one resolved artist.",
  required: ["type", "og", "artist", "links", "shortUrl"],
  additionalProperties: false,
  properties: {
    type: { type: "string", enum: ["artist"], description: "Always `artist` for this response shape." },
    og: { allOf: [{ $ref: "OgMeta#" }], description: "Open-Graph metadata for rendering and social sharing." },
    artist: { allOf: [{ $ref: "Artist#" }], description: "Stored canonical artist metadata." },
    links: {
      type: "array",
      items: { $ref: "PlatformLink#" },
      description: "Stored cross-service deep-links for this artist.",
    },
    shortUrl: { type: "string", format: "uri", description: "Canonical musiccloud share URL for this artist." },
  },
} as const;

/** OpenAPI schema `CcTrackSharePageResponse`: the Creative Commons `cc-track` variant of `SharePage`. */
export const CcTrackSharePageResponseSchema = {
  $id: "CcTrackSharePageResponse",
  type: "object",
  description: "Creative Commons share-page payload for one Jamendo track.",
  required: ["type", "og", "shortUrl", "track"],
  additionalProperties: false,
  properties: {
    type: {
      type: "string",
      enum: ["cc-track"],
      description: "Discriminator: always `cc-track` for this response shape.",
    },
    og: { allOf: [{ $ref: "OgMeta#" }], description: "Open-Graph metadata for rendering and social sharing." },
    shortUrl: {
      type: "string",
      format: "uri",
      description: "Canonical musiccloud share URL for this Creative Commons track.",
    },
    track: {
      allOf: [{ $ref: "CcTrack#" }, { type: "object", required: ["vinylLayout"] }],
      description: "Persisted Jamendo track with its vinyl-layout lookup state.",
    },
  },
} as const;

/** OpenAPI schema `CcAlbumSharePageResponse`: the Creative Commons `cc-album` variant of `SharePage`. */
export const CcAlbumSharePageResponseSchema = {
  $id: "CcAlbumSharePageResponse",
  type: "object",
  description: "Creative Commons share-page payload for one Jamendo album.",
  required: ["type", "og", "shortUrl", "album", "artistInfo"],
  additionalProperties: false,
  properties: {
    type: {
      type: "string",
      enum: ["cc-album"],
      description: "Discriminator: always `cc-album` for this response shape.",
    },
    og: { allOf: [{ $ref: "OgMeta#" }], description: "Open-Graph metadata for rendering and social sharing." },
    shortUrl: {
      type: "string",
      format: "uri",
      description: "Canonical musiccloud share URL for this Creative Commons album.",
    },
    album: {
      allOf: [{ $ref: "CcAlbum#" }, { type: "object", required: ["vinylLayout"] }],
      description: "Persisted Jamendo album with its vinyl-layout lookup state.",
    },
    artistInfo: {
      allOf: [{ $ref: "CcArtistInfo#" }],
      description: "Jamendo-derived profile, album tracks, and related-artist tracks for the album artist.",
    },
  },
} as const;

/** OpenAPI schema `CcArtistSharePageResponse`: the Creative Commons `cc-artist` variant of `SharePage`. */
export const CcArtistSharePageResponseSchema = {
  $id: "CcArtistSharePageResponse",
  type: "object",
  description: "Creative Commons share-page payload for one Jamendo artist.",
  required: ["type", "og", "shortUrl", "artist", "artistInfo"],
  additionalProperties: false,
  properties: {
    type: {
      type: "string",
      enum: ["cc-artist"],
      description: "Discriminator: always `cc-artist` for this response shape.",
    },
    og: { allOf: [{ $ref: "OgMeta#" }], description: "Open-Graph metadata for rendering and social sharing." },
    shortUrl: {
      type: "string",
      format: "uri",
      description: "Canonical musiccloud share URL for this Creative Commons artist.",
    },
    artist: {
      allOf: [{ $ref: "CcArtist#" }],
      description: "Persisted Jamendo artist and the artist's popular Creative Commons tracks.",
    },
    artistInfo: {
      allOf: [{ $ref: "CcArtistInfo#" }],
      description: "Jamendo-derived profile, popular tracks, and related-artist tracks for this artist.",
    },
  },
} as const;

/** OpenAPI schema `SharePage`: the unified share payload, one of six commercial and Creative Commons variants discriminated by `type`. */
export const SharePageSchema = {
  $id: "SharePage",
  description:
    "Unified share payload discriminated by `type`. Commercial `track`, `album`, and `artist` variants carry the matching entity, `links`, `og`, and `shortUrl`. `cc-track` carries only `track`, `og`, and `shortUrl`; `cc-album` and `cc-artist` additionally carry `artistInfo`. Creative Commons variants never carry `links`.",
  oneOf: [
    { $ref: "TrackSharePageResponse#" },
    { $ref: "AlbumSharePageResponse#" },
    { $ref: "ArtistSharePageResponse#" },
    { $ref: "CcTrackSharePageResponse#" },
    { $ref: "CcAlbumSharePageResponse#" },
    { $ref: "CcArtistSharePageResponse#" },
  ],
  example: {
    type: "track",
    og: {
      title: "a-ha — Take on Me",
      description: "Listen on Spotify, Apple Music, Deezer, YouTube Music and 16+ more services.",
      image: "https://i.scdn.co/image/ab67616d0000b273e58a0f7f1f2f8e4f6a3c8b2d",
      url: "https://musiccloud.io/aBc123x",
    },
    track: {
      title: "Take on Me",
      artists: ["a-ha"],
      albumName: "Hunting High and Low",
      artworkUrl: "https://i.scdn.co/image/ab67616d0000b273e58a0f7f1f2f8e4f6a3c8b2d",
      durationMs: 225280,
      isrc: "GBAYE8500114",
      releaseDate: "1985-06-01",
      isExplicit: false,
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
      {
        service: "apple-music",
        displayName: "Apple Music",
        url: "https://music.apple.com/us/album/take-on-me/1433036073?i=1433036081",
        confidence: 1,
        matchMethod: "cache",
      },
    ],
    shortUrl: "https://musiccloud.io/aBc123x",
  },
} as const;
