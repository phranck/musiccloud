/**
 * @file Public OpenAPI schemas for genre search and browse, commercial and
 * Creative Commons side by side because their search and browse responses
 * share one shape. They describe the shapes in `@musiccloud/shared`'s
 * `api.ts`, and `OPENAPI_SCHEMAS` registers them with the rest.
 */

/** OpenAPI schema `GenreTrackCandidate`: one track row of a commercial genre search. */
export const GenreTrackCandidateSchema = {
  $id: "GenreTrackCandidate",
  type: "object",
  description: "Track row returned by a genre-search query.",
  required: ["id", "title", "artists", "webUrl"],
  additionalProperties: false,
  properties: {
    id: {
      type: "string",
      description:
        "Source identifier for correlating this row within the result. No public request accepts it; resolve the row by sending `webUrl` as `query` to `POST /api/v1/resolve`.",
    },
    title: { type: "string", description: "Track title returned by the genre search." },
    artists: { type: "array", items: { type: "string" }, description: "Track artists in source order." },
    albumName: {
      type: "string",
      description: "Album title. The key is omitted when the search result supplies no album.",
    },
    artworkUrl: {
      type: "string",
      format: "uri",
      description: "Artwork URL. The key is omitted when the search result supplies no artwork.",
    },
    durationMs: {
      type: "number",
      minimum: 0,
      description: "Track duration in milliseconds. The key is omitted when unavailable.",
    },
    webUrl: {
      type: "string",
      format: "uri",
      description:
        "Source URL accepted as `query` by `POST /api/v1/resolve`. Send it unchanged to persist the track and obtain `id`, `shortUrl`, metadata, and service links.",
    },
  },
} as const;

/** OpenAPI schema `GenreAlbumCandidate`: one album row of a commercial genre search. */
export const GenreAlbumCandidateSchema = {
  $id: "GenreAlbumCandidate",
  type: "object",
  description: "Album row returned by a genre-search query.",
  required: ["id", "title", "artists", "webUrl"],
  additionalProperties: false,
  properties: {
    id: {
      type: "string",
      description:
        "Source identifier for correlating this row within the result. No public request accepts it; resolve the row by sending `webUrl` as `query` to `POST /api/v1/resolve`.",
    },
    title: { type: "string", description: "Album title returned by the genre search." },
    artists: { type: "array", items: { type: "string" }, description: "Album artists in source order." },
    artworkUrl: {
      type: "string",
      format: "uri",
      description: "Artwork URL. The key is omitted when the search result supplies no artwork.",
    },
    webUrl: {
      type: "string",
      format: "uri",
      description:
        "Source URL accepted as `query` by `POST /api/v1/resolve`. Send it unchanged to persist the album and obtain `id`, `shortUrl`, metadata, and service links.",
    },
  },
} as const;

/** OpenAPI schema `GenreArtistCandidate`: one artist row of a commercial genre search. */
export const GenreArtistCandidateSchema = {
  $id: "GenreArtistCandidate",
  type: "object",
  description: "Artist row returned by a genre-search query.",
  required: ["id", "name", "webUrl"],
  additionalProperties: false,
  properties: {
    id: {
      type: "string",
      description:
        "Source identifier for correlating this row within the result. No public request accepts it; resolve the row by sending `webUrl` as `query` to `POST /api/v1/resolve`.",
    },
    name: { type: "string", description: "Artist display name returned by the genre search." },
    imageUrl: {
      type: "string",
      format: "uri",
      description: "Artist-image URL. The key is omitted when the search result supplies no image.",
    },
    webUrl: {
      type: "string",
      format: "uri",
      description:
        "Source URL accepted as `query` by `POST /api/v1/resolve`. Send it unchanged to persist the artist and obtain `id`, `shortUrl`, metadata, and service links.",
    },
  },
} as const;

/** OpenAPI schema `GenreTile`: one tile of the commercial genre browse grid. */
export const GenreTileSchema = {
  $id: "GenreTile",
  type: "object",
  description: "A single genre tile in the browse grid.",
  required: ["name", "displayName", "artworkUrl"],
  additionalProperties: false,
  properties: {
    name: { type: "string", description: "Genre tag to use in a follow-up `genre:<name>` query." },
    displayName: { type: "string", description: "Human-readable genre label suitable for display." },
    artworkUrl: {
      type: "string",
      description:
        "Root-relative public-site image path. Prefix it with `https://musiccloud.io`; do not resolve it against `https://api.musiccloud.io`.",
    },
    accentColor: {
      type: "string",
      pattern: "^#[0-9A-Fa-f]{6}$",
      description:
        "Dominant artwork color in `#RRGGBB` format. The key is omitted until a stable generated artwork has supplied a color.",
    },
  },
} as const;

/** OpenAPI schema `GenreSearchResponse`: the commercial resolve response for a query that starts with `genre:`. */
export const GenreSearchResponseSchema = {
  $id: "GenreSearchResponse",
  type: "object",
  description: "Genre-discovery response produced when a resolve query starts with `genre:`.",
  required: ["status", "query", "results", "warnings"],
  additionalProperties: false,
  properties: {
    status: {
      type: "string",
      enum: ["genre-search"],
      description: "Always `genre-search` for this response shape.",
    },
    query: {
      type: "object",
      description: "Normalized genre-search filters that produced these results.",
      required: ["genres", "vibe", "tracks", "albums", "artists"],
      additionalProperties: false,
      properties: {
        genres: { type: "array", items: { type: "string" }, description: "Requested normalized genre tags." },
        vibe: {
          type: "string",
          enum: ["hot", "mixed"],
          description:
            "Normalized ordering mode: `hot` selects the highest-ranked results, while `mixed` samples across the ranked result pool.",
        },
        tracks: {
          anyOf: [{ type: "number" }, { type: "null" }],
          description:
            "The key is always included. Its value is the requested track count, or `null` when tracks were not requested.",
        },
        albums: {
          anyOf: [{ type: "number" }, { type: "null" }],
          description:
            "The key is always included. Its value is the requested album count, or `null` when albums were not requested.",
        },
        artists: {
          anyOf: [{ type: "number" }, { type: "null" }],
          description:
            "The key is always included. Its value is the requested artist count, or `null` when artists were not requested.",
        },
      },
    },
    results: {
      type: "object",
      description: "Result lists grouped by the entity type requested in the query.",
      required: ["tracks", "albums", "artists"],
      additionalProperties: false,
      properties: {
        tracks: {
          anyOf: [{ type: "array", items: { $ref: "GenreTrackCandidate#" } }, { type: "null" }],
          description:
            "The key is always included. Its value is the track-candidate array, or `null` when tracks were not requested.",
        },
        albums: {
          anyOf: [{ type: "array", items: { $ref: "GenreAlbumCandidate#" } }, { type: "null" }],
          description:
            "The key is always included. Its value is the album-candidate array, or `null` when albums were not requested.",
        },
        artists: {
          anyOf: [{ type: "array", items: { $ref: "GenreArtistCandidate#" } }, { type: "null" }],
          description:
            "The key is always included. Its value is the artist-candidate array, or `null` when artists were not requested.",
        },
      },
    },
    warnings: {
      type: "array",
      items: { type: "string" },
      description: "Non-fatal query-normalization notes; an empty array means no adjustments were made.",
    },
  },
} as const;

/** OpenAPI schema `GenreBrowseResponse`: the commercial resolve response for the exact query `genre:?`. */
export const GenreBrowseResponseSchema = {
  $id: "GenreBrowseResponse",
  type: "object",
  description: "Genre browse-grid response produced when the query is exactly `genre:?`.",
  required: ["status", "genres"],
  additionalProperties: false,
  properties: {
    status: {
      type: "string",
      enum: ["genre-browse"],
      description: "Always `genre-browse` for this response shape.",
    },
    genres: {
      type: "array",
      items: { $ref: "GenreTile#" },
      description: "Popular genres available for a follow-up genre search.",
    },
  },
} as const;

/** OpenAPI schema `CcGenreTrackCandidate`: one track row of a Creative Commons genre search. */
export const CcGenreTrackCandidateSchema = {
  $id: "CcGenreTrackCandidate",
  type: "object",
  description: "Creative-Commons track row returned by a genre-search query.",
  required: ["id", "title", "artists"],
  additionalProperties: false,
  properties: {
    id: {
      type: "string",
      pattern: "^jamendo:[0-9]+$",
      description:
        "Opaque Jamendo track candidate token. Pass it unchanged as `selectedCandidate` to `POST /api/v1/cc/resolve`.",
    },
    title: { type: "string", description: "Track title returned by the Creative-Commons genre search." },
    artists: { type: "array", items: { type: "string" }, description: "Track artist display names in source order." },
    albumName: {
      type: "string",
      description: "Album title. The key is omitted when the source supplies no album name.",
    },
    artworkUrl: {
      type: "string",
      format: "uri",
      description: "Artwork URL. The key is omitted when no artwork is available.",
    },
    durationMs: {
      type: "number",
      minimum: 0,
      description: "Track duration in milliseconds. The key is omitted when unavailable.",
    },
    webUrl: {
      type: "string",
      format: "uri",
      description:
        "Canonical Jamendo page. The key is omitted when the source supplies no page URL; it is not used for the follow-up resolve.",
    },
  },
} as const;

/** OpenAPI schema `CcGenreAlbumCandidate`: one album row of a Creative Commons genre search. */
export const CcGenreAlbumCandidateSchema = {
  $id: "CcGenreAlbumCandidate",
  type: "object",
  description: "Creative-Commons album row returned by a genre-search query.",
  required: ["id", "title", "artists"],
  additionalProperties: false,
  properties: {
    id: {
      type: "string",
      pattern: "^jamendo-album:[0-9]+$",
      description:
        "Opaque Jamendo album candidate token. Pass it unchanged as `selectedCandidate` to `POST /api/v1/cc/resolve`.",
    },
    title: {
      type: "string",
      description:
        "Album title returned by the Creative Commons genre search. An empty string means the candidate has a Jamendo album ID but the track result supplied no album title.",
    },
    artists: { type: "array", items: { type: "string" }, description: "Album artist display names in source order." },
    artworkUrl: {
      type: "string",
      format: "uri",
      description: "Artwork URL. The key is omitted when no artwork is available.",
    },
    webUrl: {
      type: "string",
      format: "uri",
      description:
        "Canonical Jamendo page. The key is omitted when the source supplies no page URL; it is not used for the follow-up resolve.",
    },
  },
} as const;

/** OpenAPI schema `CcGenreArtistCandidate`: one artist row of a Creative Commons genre search. */
export const CcGenreArtistCandidateSchema = {
  $id: "CcGenreArtistCandidate",
  type: "object",
  description: "Creative-Commons artist row returned by a genre-search query.",
  required: ["id", "name"],
  additionalProperties: false,
  properties: {
    id: {
      type: "string",
      pattern: "^jamendo-artist:[0-9]+$",
      description:
        "Opaque Jamendo artist candidate token. Pass it unchanged as `selectedCandidate` to `POST /api/v1/cc/resolve`.",
    },
    name: { type: "string", description: "Artist display name returned by the Creative-Commons genre search." },
    imageUrl: {
      type: "string",
      format: "uri",
      description: "Artist image URL. The key is omitted when no image is available.",
    },
    webUrl: {
      type: "string",
      format: "uri",
      description:
        "Canonical Jamendo page. The key is omitted when the source supplies no page URL; it is not used for the follow-up resolve.",
    },
  },
} as const;

/** OpenAPI schema `CcGenreTile`: one tile of the Creative Commons genre browse grid. */
export const CcGenreTileSchema = {
  $id: "CcGenreTile",
  type: "object",
  description: "One selectable Creative-Commons genre tile.",
  required: ["name", "displayName", "artworkUrl"],
  additionalProperties: false,
  properties: {
    name: { type: "string", description: "Genre tag to use in a follow-up `genre:<name>` CC query." },
    displayName: { type: "string", description: "Human-readable genre label." },
    artworkUrl: {
      type: "string",
      description:
        "Root-relative public-site image path. Prefix it with `https://musiccloud.io`; do not resolve it against `https://api.musiccloud.io`.",
    },
  },
} as const;

/** OpenAPI schema `CcGenreSearchResponse`: the Creative Commons resolve response for a query that starts with `genre:`. */
export const CcGenreSearchResponseSchema = {
  $id: "CcGenreSearchResponse",
  type: "object",
  description:
    "Creative-Commons genre results. Select a row by sending its `id` as `selectedCandidate` to `POST /api/v1/cc/resolve`.",
  required: ["status", "query", "results", "warnings"],
  additionalProperties: false,
  properties: {
    status: { type: "string", enum: ["genre-search"], description: "Always `genre-search` for this response shape." },
    query: {
      type: "object",
      description: "Normalized genre filters used for this search.",
      required: ["genres", "vibe", "tracks", "albums", "artists"],
      additionalProperties: false,
      properties: {
        genres: { type: "array", items: { type: "string" }, description: "Requested normalized genre tags." },
        vibe: {
          type: "string",
          enum: ["hot", "mixed"],
          description:
            "Normalized ordering mode: `hot` selects the highest-ranked results, while `mixed` samples across the ranked result pool.",
        },
        tracks: {
          anyOf: [{ type: "number" }, { type: "null" }],
          description:
            "The key is always included. Its value is the requested track count, or `null` when tracks were not requested.",
        },
        albums: {
          anyOf: [{ type: "number" }, { type: "null" }],
          description:
            "The key is always included. Its value is the requested album count, or `null` when albums were not requested.",
        },
        artists: {
          anyOf: [{ type: "number" }, { type: "null" }],
          description:
            "The key is always included. Its value is the requested artist count, or `null` when artists were not requested.",
        },
      },
    },
    results: {
      type: "object",
      description: "Candidate lists grouped by requested resource type.",
      required: ["tracks", "albums", "artists"],
      additionalProperties: false,
      properties: {
        tracks: {
          anyOf: [{ type: "array", items: { $ref: "CcGenreTrackCandidate#" } }, { type: "null" }],
          description:
            "The key is always included. Its value is the track-candidate array, or `null` when tracks were not requested.",
        },
        albums: {
          anyOf: [{ type: "array", items: { $ref: "CcGenreAlbumCandidate#" } }, { type: "null" }],
          description:
            "The key is always included. Its value is the album-candidate array, or `null` when albums were not requested.",
        },
        artists: {
          anyOf: [{ type: "array", items: { $ref: "CcGenreArtistCandidate#" } }, { type: "null" }],
          description:
            "The key is always included. Its value is the artist-candidate array, or `null` when artists were not requested.",
        },
      },
    },
    warnings: {
      type: "array",
      items: { type: "string" },
      description: "Query-normalization notes; an empty array means no adjustment was needed.",
    },
  },
} as const;

/** OpenAPI schema `CcGenreBrowseResponse`: the Creative Commons resolve response for the exact query `genre:?`. */
export const CcGenreBrowseResponseSchema = {
  $id: "CcGenreBrowseResponse",
  type: "object",
  description: "Creative-Commons genre browse response returned for the exact query `genre:?`.",
  required: ["status", "genres"],
  additionalProperties: false,
  properties: {
    status: { type: "string", enum: ["genre-browse"], description: "Always `genre-browse` for this response shape." },
    genres: {
      type: "array",
      items: { $ref: "CcGenreTile#" },
      description: "Selectable genres for a follow-up `genre:<name>` CC query.",
    },
  },
} as const;
