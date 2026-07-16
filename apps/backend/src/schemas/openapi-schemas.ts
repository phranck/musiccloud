/**
 * Reusable OpenAPI / AJV schemas for the public v1 API. Registered via
 * `app.addSchema(...)` in `server.ts` so every route can reference them
 * with `{ $ref: "<Name>#" }` and `@fastify/swagger` re-publishes them
 * under `components.schemas.<Name>` in the generated OpenAPI document.
 *
 * Keep the shapes in sync with the TypeScript interfaces in
 * `@musiccloud/shared` (`packages/shared/src/api.ts` + `content.ts` +
 * `plugins.ts`). Changing a shape here without updating the shared type
 * (or vice versa) produces silently drifting docs.
 *
 * Every schema carries an `example` so Swagger UI renders a realistic
 * payload for Try-It-Out and code-sample generation. Examples use
 * "Take on Me" by a-ha throughout for visual consistency.
 */

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
        "Stable musiccloud artist-correlation ID. It links credits that refer to the same artist; no public request parameter currently accepts this value.",
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

/** Standard availability response returned by public health probes. */
export const HealthStatusResponseSchema = {
  $id: "HealthStatusResponse",
  type: "object",
  description: "Standard availability response returned when a public health probe is ready.",
  required: ["status"],
  additionalProperties: false,
  properties: {
    status: { type: "string", enum: ["ok"], description: "Always `ok` when the probe completed successfully." },
  },
  example: { status: "ok" },
} as const;

/** Error response returned by public readiness probes while a dependency is unavailable. */
export const HealthUnavailableResponseSchema = {
  $id: "HealthUnavailableResponse",
  type: "object",
  description:
    "Readiness failure with the standard public error envelope. Internal dependency diagnostics are available only in backend logs correlated by `errorId`.",
  required: ["error", "message", "errorId"],
  additionalProperties: false,
  properties: {
    error: { type: "string", description: "Stable musiccloud error code for programmatic handling." },
    message: {
      type: "string",
      description: "Safe English failure detail. The final parenthesized value repeats `error`.",
    },
    errorId: {
      type: "string",
      format: "uuid",
      description: "Unique incident identifier to include when reporting the failure to musiccloud support.",
    },
    context: {
      type: "object",
      additionalProperties: { anyOf: [{ type: "string" }, { type: "number" }] },
      description: "Optional structured values associated with the error code. The key is omitted when none apply.",
    },
    status: {
      type: "string",
      enum: ["unavailable"],
      description:
        "Optional compatibility status used by non-database service probes when their dependency is unavailable.",
    },
  },
  example: {
    error: "MC-API-0001",
    message: "Database readiness could not be confirmed. Please try again later. (MC-API-0001)",
    errorId: "3d39ea9f-27ea-4f61-862e-c92547bd538c",
  },
} as const;

/** Public API plan shown by the Developer Portal pricing page. */
export const PublicTierSchema = {
  $id: "PublicTier",
  type: "object",
  description: "One public API plan, including its request limits, pricing, availability, and presentation metadata.",
  required: [
    "id",
    "name",
    "requestsPerMinute",
    "requestsPerDay",
    "attributionRequired",
    "price",
    "priceYearly",
    "color",
    "icon",
    "buttonLabel",
    "description",
    "enabled",
    "disableReason",
    "recommended",
    "sortOrder",
    "features",
    "createdAt",
    "updatedAt",
  ],
  additionalProperties: false,
  properties: {
    id: {
      type: "string",
      description:
        "Stable opaque plan identifier. It is returned for account-selection and billing correlation; no public API parameter currently accepts it.",
    },
    name: { type: "string", description: "Human-readable plan name." },
    requestsPerMinute: {
      type: "integer",
      minimum: 1,
      description: "Maximum authenticated requests in a rolling `60`-second window.",
    },
    requestsPerDay: {
      type: "integer",
      minimum: 1,
      description: "Maximum authenticated requests in a rolling `24`-hour window.",
    },
    attributionRequired: {
      type: "boolean",
      description: "Whether applications on this plan must show musiccloud attribution.",
    },
    price: {
      anyOf: [{ type: "string" }, { type: "null" }],
      description: "Monthly euro price as a decimal string, or `null` when no monthly paid price applies.",
    },
    priceYearly: {
      anyOf: [{ type: "string" }, { type: "null" }],
      description: "Yearly euro price as a decimal string, or `null` when yearly billing is not offered.",
    },
    color: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$", description: "Plan accent color as `#RRGGBB`." },
    icon: {
      anyOf: [{ type: "string" }, { type: "null" }],
      description:
        "The key is always included. Its value is an Iconsax icon identifier used for presentation, or `null` when no icon is assigned.",
    },
    buttonLabel: {
      anyOf: [{ type: "string" }, { type: "null" }],
      description:
        "The key is always included. Its value is a custom call-to-action label, or `null` when no custom label is published.",
    },
    description: {
      type: "string",
      description: "Short plan description; an empty string means no description is published.",
    },
    enabled: { type: "boolean", description: "Whether new accounts can currently select this plan." },
    disableReason: {
      type: "string",
      description: "Reason an unavailable plan cannot be selected; an empty string means no reason is published.",
    },
    recommended: { type: "boolean", description: "Whether this plan is highlighted as the recommended option." },
    sortOrder: { type: "integer", description: "Ascending display order used by the pricing page." },
    features: {
      type: "array",
      items: { type: "string" },
      description: "Ordered feature labels; an empty array means none are listed.",
    },
    createdAt: { type: "integer", minimum: 0, description: "Plan creation time as Unix epoch milliseconds." },
    updatedAt: { type: "integer", minimum: 0, description: "Last plan update time as Unix epoch milliseconds." },
  },
  example: {
    id: "tier_free",
    name: "Free",
    requestsPerMinute: 60,
    requestsPerDay: 10000,
    attributionRequired: true,
    price: null,
    priceYearly: null,
    color: "#64748b",
    icon: null,
    buttonLabel: null,
    description: "For evaluation and small personal projects.",
    enabled: true,
    disableReason: "",
    recommended: false,
    sortOrder: 0,
    features: ["10,000 requests per day"],
    createdAt: 1784138400000,
    updatedAt: 1784138400000,
  },
} as const;

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

/** Refreshed Deezer preview URL for a commercial track share. */
export const SharePreviewResponseSchema = {
  $id: "SharePreviewResponse",
  type: "object",
  description: "Refreshed Deezer preview URL for a commercial track share.",
  required: ["previewUrl"],
  additionalProperties: false,
  properties: {
    previewUrl: {
      anyOf: [{ type: "string", format: "uri" }, { type: "null" }],
      description:
        "The key is always included. Its value is a currently usable preview URL, or `null` when no preview can be produced for the track.",
    },
  },
  example: { previewUrl: "https://cdn.example.com/previews/take-on-me.mp3" },
} as const;

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
      enum: ["isrc", "search", "cache", "upc", "isrc-inference"],
      description:
        "How this link was located: `isrc` and `upc` are direct identifier matches, `isrc-inference` derives an ISRC match from related metadata, `search` is a text search, and `cache` means a previously stored link was returned.",
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

export const UnifiedResolveSuccessSchema = {
  $id: "UnifiedResolveSuccess",
  description:
    "Successful resolve, one of three shapes discriminated by `type`. Use `type` to decide whether to read `track`, `album`, or `artist`.",
  oneOf: [{ $ref: "TrackResolveSuccess#" }, { $ref: "AlbumResolveSuccess#" }, { $ref: "ArtistResolveSuccess#" }],
} as const;

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

export const CcResolveSuccessSchema = {
  $id: "CcResolveSuccess",
  description: "Successful Creative Commons resolve, discriminated by `type` into track, album, or artist payloads.",
  oneOf: [{ $ref: "CcTrackResolveSuccess#" }, { $ref: "CcAlbumResolveSuccess#" }, { $ref: "CcArtistResolveSuccess#" }],
} as const;

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

export const CommercialTrackSharePageResponseSchema = {
  $id: "CommercialTrackSharePageResponse",
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

export const CommercialAlbumSharePageResponseSchema = {
  $id: "CommercialAlbumSharePageResponse",
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

export const CommercialArtistSharePageResponseSchema = {
  $id: "CommercialArtistSharePageResponse",
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

export const SharePageSchema = {
  $id: "SharePage",
  description:
    "Unified share payload discriminated by `type`. Commercial `track`, `album`, and `artist` variants carry the matching entity, `links`, `og`, and `shortUrl`. `cc-track` carries only `track`, `og`, and `shortUrl`; `cc-album` and `cc-artist` additionally carry `artistInfo`. Creative Commons variants never carry `links`.",
  oneOf: [
    { $ref: "CommercialTrackSharePageResponse#" },
    { $ref: "CommercialAlbumSharePageResponse#" },
    { $ref: "CommercialArtistSharePageResponse#" },
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

export const PublicPageSegmentSchema = {
  $id: "PublicPageSegment",
  type: "object",
  description: "One segment of a segmented public content page — carries the target page's rendered body.",
  required: ["label", "targetSlug", "title", "showTitle", "content", "contentHtml"],
  additionalProperties: false,
  properties: {
    label: { type: "string", description: "Segmented-control label shown above the body." },
    targetSlug: { type: "string", description: "Slug of the default content page that supplies the body." },
    title: { type: "string" },
    showTitle: { type: "boolean" },
    content: { type: "string", description: "Original Markdown source of the target page." },
    contentHtml: { type: "string", description: "Server-rendered HTML of the target page." },
  },
  example: {
    label: "Overview",
    targetSlug: "about-overview",
    title: "Overview",
    showTitle: true,
    content: "…",
    contentHtml: "<p>…</p>",
  },
} as const;

export const PublicContentPageSchema = {
  $id: "PublicContentPage",
  type: "object",
  description: "A published content page in the form the frontend renders.",
  required: [
    "slug",
    "title",
    "showTitle",
    "titleAlignment",
    "pageType",
    "displayMode",
    "overlayWidth",
    "content",
    "contentHtml",
    "segments",
  ],
  additionalProperties: false,
  properties: {
    slug: { type: "string", description: "URL-safe identifier; appears in the page URL." },
    title: { type: "string" },
    showTitle: { type: "boolean", description: "When false the frontend suppresses the <h1> header." },
    titleAlignment: { type: "string", enum: ["left", "center", "right"] },
    pageType: { type: "string", enum: ["default", "segmented"] },
    displayMode: { type: "string", enum: ["fullscreen", "embossed", "translucent"] },
    overlayWidth: { type: "string", enum: ["small", "regular", "big"] },
    content: { type: "string", description: "Original Markdown source." },
    contentHtml: { type: "string", description: "Server-rendered HTML (safe subset)." },
    segments: {
      type: "array",
      items: { $ref: "PublicPageSegment#" },
      description: "Empty for default pages; populated for segmented pages.",
    },
  },
  example: {
    slug: "about",
    title: "About musiccloud",
    showTitle: true,
    titleAlignment: "left",
    pageType: "default",
    displayMode: "fullscreen",
    overlayWidth: "regular",
    content:
      "## Our mission\n\nOne URL, every streaming service. musiccloud.io is a free tool that helps you share music across platforms without friction.",
    contentHtml:
      "<h2>Our mission</h2>\n<p>One URL, every streaming service. musiccloud.io is a free tool that helps you share music across platforms without friction.</p>\n",
    segments: [],
  },
} as const;

export const ContentPageSummarySchema = {
  $id: "ContentPageSummary",
  type: "object",
  description: "Lightweight content-page entry (no body) for list views.",
  required: [
    "slug",
    "title",
    "status",
    "showTitle",
    "titleAlignment",
    "pageType",
    "displayMode",
    "overlayWidth",
    "createdAt",
  ],
  additionalProperties: false,
  properties: {
    slug: { type: "string" },
    title: { type: "string" },
    status: { type: "string", enum: ["draft", "published", "hidden"] },
    showTitle: { type: "boolean" },
    titleAlignment: { type: "string", enum: ["left", "center", "right"] },
    pageType: { type: "string", enum: ["default", "segmented"] },
    displayMode: { type: "string", enum: ["fullscreen", "embossed", "translucent"] },
    overlayWidth: { type: "string", enum: ["small", "regular", "big"] },
    createdByUsername: { type: "string", nullable: true },
    updatedByUsername: { type: "string", nullable: true },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", nullable: true, format: "date-time" },
  },
  example: {
    slug: "about",
    title: "About musiccloud",
    status: "published",
    showTitle: true,
    titleAlignment: "left",
    pageType: "default",
    displayMode: "fullscreen",
    overlayWidth: "regular",
    createdByUsername: "admin",
    updatedByUsername: "admin",
    createdAt: "2026-02-14T08:17:03.000Z",
    updatedAt: "2026-04-18T19:25:41.000Z",
  },
} as const;

export const NavItemSchema = {
  $id: "NavItem",
  type: "object",
  description: "One entry in a managed navigation (header or footer).",
  required: ["id", "navId", "target", "position"],
  additionalProperties: false,
  properties: {
    id: { type: "integer" },
    navId: { type: "string", enum: ["header", "footer"] },
    pageSlug: { type: "string", nullable: true, description: "Set when the item links to a managed content page." },
    pageTitle: { type: "string", nullable: true },
    url: { type: "string", nullable: true, format: "uri", description: "Set when the item is an external link." },
    target: { type: "string", enum: ["_self", "_blank"] },
    label: { type: "string", nullable: true, description: "Override label; falls back to pageTitle when null." },
    position: { type: "integer", minimum: 0, description: "Sort order (ascending)." },
    pageType: {
      type: "string",
      nullable: true,
      enum: ["default", "segmented", null],
      description: "Display hint for nav-click interception; null for external-URL items.",
    },
    pageDisplayMode: {
      type: "string",
      nullable: true,
      enum: ["fullscreen", "embossed", "translucent", null],
    },
    pageOverlayWidth: {
      type: "string",
      nullable: true,
      enum: ["small", "regular", "big", null],
    },
  },
  example: {
    id: 7,
    navId: "footer",
    pageSlug: "about",
    pageTitle: "About musiccloud",
    url: null,
    target: "_self",
    label: null,
    position: 0,
    pageType: "default",
    pageDisplayMode: "fullscreen",
    pageOverlayWidth: "regular",
  },
} as const;

export const ActiveServiceSchema = {
  $id: "ActiveService",
  type: "object",
  description: "Public-facing entry for an enabled streaming service (used by the landing-page marquee).",
  required: ["id", "displayName", "color"],
  additionalProperties: false,
  properties: {
    id: { type: "string", description: "Stable service id (e.g. 'spotify', 'tidal')." },
    displayName: { type: "string" },
    color: { type: "string", description: "Brand accent colour as a hex string." },
  },
  example: {
    id: "spotify",
    displayName: "Spotify",
    color: "#1db954",
  },
} as const;

/**
 * All schemas registered at app boot — the order matters: dependents last.
 *
 * `NavItemSchema`, `PublicContentPageSchema`, and `ContentPageSummarySchema`
 * are included because the internal SSR helper routes (`/api/v1/nav`,
 * `/api/v1/content`, `/api/v1/content/:slug`) still need them for runtime
 * response serialization. Those routes themselves are hidden from the
 * public API reference by the `transform` filter in `server.ts`.
 */
export const OPENAPI_SCHEMAS = [
  ArtistCreditSchema,
  HealthStatusResponseSchema,
  HealthUnavailableResponseSchema,
  PublicTierSchema,
  CcBandcampAvailabilityResponseSchema,
  CcRandomExampleResponseSchema,
  SharePreviewResponseSchema,
  TrackSchema,
  VinylLayoutTrackSchema,
  VinylSideSchema,
  VinylLayoutSchema,
  AlbumSchema,
  ArtistSchema,
  PlatformLinkSchema,
  LinkMetadataResponseSchema,
  DisambiguationCandidateSchema,
  OgMetaSchema,
  ResolveSuccessSchema,
  ResolveDisambiguationSchema,
  TrackResolveSuccessSchema,
  AlbumResolveSuccessSchema,
  ArtistResolveSuccessSchema,
  UnifiedResolveSuccessSchema,
  GenreTrackCandidateSchema,
  GenreAlbumCandidateSchema,
  GenreArtistCandidateSchema,
  GenreTileSchema,
  GenreSearchResponseSchema,
  GenreBrowseResponseSchema,
  CcGenreTrackCandidateSchema,
  CcGenreAlbumCandidateSchema,
  CcGenreArtistCandidateSchema,
  CcGenreTileSchema,
  CcGenreSearchResponseSchema,
  CcGenreBrowseResponseSchema,
  ArtistTopTrackSchema,
  ArtistProfileSchema,
  ArtistEventSchema,
  SimilarArtistTrackSchema,
  ArtistInfoSchema,
  CcArtistTopTrackSchema,
  CcArtistProfileSchema,
  CcSimilarArtistTrackSchema,
  CcArtistInfoSchema,
  CcMusicInfoSchema,
  CcTrackStatsSchema,
  CcTrackSchema,
  CcAlbumSchema,
  CcArtistSchema,
  CcTrackResolveSuccessSchema,
  CcAlbumResolveSuccessSchema,
  CcArtistResolveSuccessSchema,
  CcResolveSuccessSchema,
  CommercialTrackSharePageResponseSchema,
  CommercialAlbumSharePageResponseSchema,
  CommercialArtistSharePageResponseSchema,
  CcTrackSharePageResponseSchema,
  CcAlbumSharePageResponseSchema,
  CcArtistSharePageResponseSchema,
  SharePageSchema,
  PublicPageSegmentSchema,
  PublicContentPageSchema,
  ContentPageSummarySchema,
  NavItemSchema,
  ActiveServiceSchema,
] as const;
