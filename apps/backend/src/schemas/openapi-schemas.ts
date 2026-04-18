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

export const TrackSchema = {
  $id: "Track",
  type: "object",
  description: "Canonical track metadata returned across the public API.",
  required: ["title", "artists"],
  additionalProperties: false,
  properties: {
    title: { type: "string", description: "Track title as reported by the origin service." },
    artists: {
      type: "array",
      items: { type: "string" },
      description: "Credited artists, ordered as the origin service returns them (primary first).",
    },
    albumName: { type: "string", description: "Containing album title, when known." },
    artworkUrl: { type: "string", format: "uri", description: "Absolute URL to the highest-quality artwork." },
    durationMs: { type: "integer", minimum: 0, description: "Track duration in milliseconds." },
    isrc: { type: "string", description: "International Standard Recording Code, when the service exposes one." },
    releaseDate: { type: "string", format: "date", description: "Original release date in ISO-8601 (YYYY-MM-DD)." },
    isExplicit: { type: "boolean", description: "True when the track carries an explicit-content advisory." },
    previewUrl: { type: "string", format: "uri", description: "Preview clip URL (typically ~30s MP3)." },
  },
  example: {
    title: "Take on Me",
    artists: ["a-ha"],
    albumName: "Hunting High and Low",
    artworkUrl: "https://i.scdn.co/image/ab67616d0000b273e58a0f7f1f2f8e4f6a3c8b2d",
    durationMs: 225280,
    isrc: "GBAYE8500114",
    releaseDate: "1985-06-01",
    isExplicit: false,
    previewUrl: "https://p.scdn.co/mp3-preview/7ae363b1bc5d7c6bd9cbca4d4f2ae6e3a8c7b0f5",
  },
} as const;

export const AlbumSchema = {
  $id: "Album",
  type: "object",
  description: "Album-level metadata, returned for album resolves and share pages.",
  required: ["title", "artists"],
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    artists: { type: "array", items: { type: "string" } },
    releaseDate: { type: "string", format: "date" },
    totalTracks: { type: "integer", minimum: 0 },
    artworkUrl: { type: "string", format: "uri" },
    label: { type: "string", description: "Record label, when known." },
    upc: { type: "string", description: "Universal Product Code, when known." },
    previewUrl: { type: "string", format: "uri" },
  },
  example: {
    title: "Hunting High and Low",
    artists: ["a-ha"],
    releaseDate: "1985-06-01",
    totalTracks: 10,
    artworkUrl: "https://i.scdn.co/image/ab67616d0000b273e58a0f7f1f2f8e4f6a3c8b2d",
    label: "Warner Records",
    upc: "075993257228",
    previewUrl: "https://p.scdn.co/mp3-preview/7ae363b1bc5d7c6bd9cbca4d4f2ae6e3a8c7b0f5",
  },
} as const;

export const ArtistSchema = {
  $id: "Artist",
  type: "object",
  description: "Minimal artist metadata used in artist resolves and share pages.",
  required: ["name"],
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    imageUrl: { type: "string", format: "uri" },
    genres: { type: "array", items: { type: "string" } },
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
    service: { type: "string", description: "Service id (e.g. 'spotify', 'appleMusic', 'deezer')." },
    displayName: { type: "string", description: "Human-friendly service name." },
    url: { type: "string", format: "uri", description: "Deep-link that opens the item on that service." },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
      description: "Match confidence in [0..1]. 1 == identity match, lower == fuzzy.",
    },
    matchMethod: {
      type: "string",
      enum: ["isrc", "search", "cache", "upc", "isrc-inference"],
      description: "How this link was located. `isrc`/`upc` are identity matches; `search` is fuzzy.",
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

export const DisambiguationCandidateSchema = {
  $id: "DisambiguationCandidate",
  type: "object",
  description: "A possible match returned when the query was ambiguous and the caller must pick one.",
  required: ["id", "title", "artists"],
  additionalProperties: false,
  properties: {
    id: { type: "string", description: "Opaque id; pass back as `selectedCandidate` to resolve this candidate." },
    title: { type: "string" },
    artists: { type: "array", items: { type: "string" } },
    albumName: { type: "string" },
    artworkUrl: { type: "string", format: "uri" },
  },
  example: {
    id: "spotify:track:2WfaOiMkCvy7F5fcp2zZ8L",
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
      service: "appleMusic",
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
    id: { type: "string", description: "Short id for the persisted resolve (used in share URLs)." },
    shortUrl: { type: "string", format: "uri", description: "Canonical share URL for this resolve." },
    track: { $ref: "Track#" },
    links: { type: "array", items: { $ref: "PlatformLink#" } },
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
    status: { type: "string", const: "disambiguation" },
    candidates: { type: "array", items: { $ref: "DisambiguationCandidate#" } },
  },
  example: {
    status: "disambiguation",
    candidates: [
      {
        id: "spotify:track:2WfaOiMkCvy7F5fcp2zZ8L",
        title: "Take on Me",
        artists: ["a-ha"],
        albumName: "Hunting High and Low",
        artworkUrl: "https://i.scdn.co/image/ab67616d0000b273e58a0f7f1f2f8e4f6a3c8b2d",
      },
      {
        id: "spotify:track:4VqPOruhp5EdPBeR92t6lQ",
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
    type: { type: "string", const: "album", description: "Discriminator: always `album` for this variant." },
    id: { type: "string" },
    shortUrl: { type: "string", format: "uri" },
    album: { $ref: "Album#" },
    links: { type: "array", items: { $ref: "PlatformLink#" } },
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
        service: "appleMusic",
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
    type: { type: "string", const: "artist", description: "Discriminator: always `artist` for this variant." },
    id: { type: "string" },
    shortUrl: { type: "string", format: "uri" },
    artist: { $ref: "Artist#" },
    links: { type: "array", items: { $ref: "PlatformLink#" } },
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
        service: "appleMusic",
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
    type: { type: "string", const: "track", description: "Discriminator: always `track` for this variant." },
    id: { type: "string" },
    shortUrl: { type: "string", format: "uri" },
    track: { $ref: "Track#" },
    links: { type: "array", items: { $ref: "PlatformLink#" } },
  },
  example: { type: "track", ...RESOLVE_SUCCESS_EXAMPLE },
} as const;

export const UnifiedResolveSuccessSchema = {
  $id: "UnifiedResolveSuccess",
  description:
    "Successful resolve, one of three shapes discriminated by `type`. Use `type` to decide whether to read `track`, `album`, or `artist`.",
  oneOf: [{ $ref: "TrackResolveSuccess#" }, { $ref: "AlbumResolveSuccess#" }, { $ref: "ArtistResolveSuccess#" }],
} as const;

export const OgMetaSchema = {
  $id: "OgMeta",
  type: "object",
  description: "Open-Graph meta tags used by the Astro share page for social previews.",
  required: ["title", "description", "url"],
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    image: { type: "string", format: "uri" },
    url: { type: "string", format: "uri" },
  },
  example: {
    title: "a-ha — Take on Me",
    description: "Listen on Spotify, Apple Music, Deezer, YouTube Music and 16+ more services.",
    image: "https://i.scdn.co/image/ab67616d0000b273e58a0f7f1f2f8e4f6a3c8b2d",
    url: "https://musiccloud.io/aBc123x",
  },
} as const;

export const SharePageSchema = {
  $id: "SharePage",
  type: "object",
  description: "Unified share-page payload: one of track/album/artist plus its cross-service links and OG meta.",
  required: ["type", "og", "links", "shortUrl"],
  additionalProperties: false,
  properties: {
    type: { type: "string", enum: ["track", "album", "artist"] },
    og: { $ref: "OgMeta#" },
    track: { $ref: "Track#" },
    album: { $ref: "Album#" },
    artist: { $ref: "Artist#" },
    links: { type: "array", items: { $ref: "PlatformLink#" } },
    shortUrl: { type: "string", format: "uri" },
  },
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
        service: "appleMusic",
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
  description: "One of an artist's top tracks, sourced from Deezer.",
  required: ["title", "artists", "albumName", "artworkUrl", "durationMs", "deezerUrl", "shortId"],
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    artists: { type: "array", items: { type: "string" } },
    albumName: { type: ["string", "null"] },
    artworkUrl: { type: ["string", "null"], format: "uri" },
    durationMs: { type: ["integer", "null"], minimum: 0 },
    deezerUrl: { type: "string", format: "uri", description: "Track URL on Deezer (click to re-resolve)." },
    shortId: {
      type: ["string", "null"],
      description: "musiccloud short-id when the track has already been resolved; null when it hasn't.",
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
  description: "Spotify + Last.fm enriched artist profile. Null when Spotify is not configured.",
  required: ["spotifyId", "imageUrl", "genres", "popularity", "followers", "bioSummary", "scrobbles", "similarArtists"],
  additionalProperties: false,
  properties: {
    spotifyId: { type: "string" },
    imageUrl: { type: ["string", "null"], format: "uri" },
    genres: { type: "array", items: { type: "string" }, maxItems: 3, description: "Up to 3 Spotify genres." },
    popularity: { type: "integer", minimum: 0, maximum: 100, description: "Spotify popularity score [0..100]." },
    followers: { type: "integer", minimum: 0, description: "Spotify follower count." },
    bioSummary: { type: ["string", "null"], description: "Short biography from Last.fm (null when unavailable)." },
    scrobbles: { type: ["integer", "null"], minimum: 0, description: "Last.fm playcount (null when unavailable)." },
    similarArtists: {
      type: "array",
      items: { type: "string" },
      maxItems: 3,
      description: "Up to 3 related artist names.",
    },
  },
  example: {
    spotifyId: "26dSoYclwsYLMAKD3tpOr4",
    imageUrl: "https://i.scdn.co/image/ab6761610000e5eb6b3f4e4e2f8e4f6a3c8b2d0a",
    genres: ["synth-pop", "new wave", "pop rock"],
    popularity: 70,
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
    date: { type: "string", format: "date", description: "Event date (YYYY-MM-DD)." },
    venueName: { type: "string" },
    city: { type: "string" },
    country: { type: "string", description: "ISO-3166-1 alpha-2 country code." },
    ticketUrl: { type: ["string", "null"], format: "uri" },
    source: { type: "string", enum: ["bandsintown", "ticketmaster"] },
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
  description: "A similar artist's top track (null when the similar artist has no resolvable top track).",
  required: ["artistName", "track"],
  additionalProperties: false,
  properties: {
    artistName: { type: "string" },
    track: {
      oneOf: [{ $ref: "ArtistTopTrack#" }, { type: "null" }],
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
  description: "Aggregated artist details: Deezer top tracks, Spotify/Last.fm profile, upcoming events.",
  required: ["artistName", "topTracks", "profile", "events"],
  additionalProperties: false,
  properties: {
    artistName: { type: "string" },
    topTracks: {
      type: "array",
      items: { $ref: "ArtistTopTrack#" },
      description: "Empty array when Deezer is unavailable.",
    },
    profile: {
      oneOf: [{ $ref: "ArtistProfile#" }, { type: "null" }],
      description: "Null when Spotify credentials are not configured.",
    },
    events: {
      type: "array",
      items: { $ref: "ArtistEvent#" },
      description: "Empty array when no upcoming events are found or when event API keys are not set.",
    },
    similarArtistTracks: {
      type: "array",
      items: { $ref: "SimilarArtistTrack#" },
      description: "Top track for each of up to 3 similar artists. Only present when Last.fm is configured.",
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
      spotifyId: "26dSoYclwsYLMAKD3tpOr4",
      imageUrl: "https://i.scdn.co/image/ab6761610000e5eb6b3f4e4e2f8e4f6a3c8b2d0a",
      genres: ["synth-pop", "new wave", "pop rock"],
      popularity: 70,
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

export const PublicContentPageSchema = {
  $id: "PublicContentPage",
  type: "object",
  description: "A published content page in the form the frontend renders.",
  required: ["slug", "title", "showTitle", "content", "contentHtml"],
  additionalProperties: false,
  properties: {
    slug: { type: "string", description: "URL-safe identifier; appears in the page URL." },
    title: { type: "string" },
    showTitle: { type: "boolean", description: "When false the frontend suppresses the <h1> header." },
    content: { type: "string", description: "Original Markdown source." },
    contentHtml: { type: "string", description: "Server-rendered HTML (safe subset)." },
  },
  example: {
    slug: "about",
    title: "About musiccloud",
    showTitle: true,
    content:
      "## Our mission\n\nOne URL, every streaming service. musiccloud.io is a free tool that helps you share music across platforms without friction.",
    contentHtml:
      "<h2>Our mission</h2>\n<p>One URL, every streaming service. musiccloud.io is a free tool that helps you share music across platforms without friction.</p>\n",
  },
} as const;

export const ContentPageSummarySchema = {
  $id: "ContentPageSummary",
  type: "object",
  description: "Lightweight content-page entry (no body) for list views.",
  required: ["slug", "title", "status", "showTitle", "createdAt"],
  additionalProperties: false,
  properties: {
    slug: { type: "string" },
    title: { type: "string" },
    status: { type: "string", enum: ["draft", "published", "hidden"] },
    showTitle: { type: "boolean" },
    createdByUsername: { type: ["string", "null"] },
    updatedByUsername: { type: ["string", "null"] },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: ["string", "null"], format: "date-time" },
  },
  example: {
    slug: "about",
    title: "About musiccloud",
    status: "published",
    showTitle: true,
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
    pageSlug: { type: ["string", "null"], description: "Set when the item links to a managed content page." },
    pageTitle: { type: ["string", "null"] },
    url: { type: ["string", "null"], format: "uri", description: "Set when the item is an external link." },
    target: { type: "string", enum: ["_self", "_blank"] },
    label: { type: ["string", "null"], description: "Override label; falls back to pageTitle when null." },
    position: { type: "integer", minimum: 0, description: "Sort order (ascending)." },
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

/** All schemas registered at app boot — the order matters: dependents last. */
export const OPENAPI_SCHEMAS = [
  TrackSchema,
  AlbumSchema,
  ArtistSchema,
  PlatformLinkSchema,
  DisambiguationCandidateSchema,
  OgMetaSchema,
  ResolveSuccessSchema,
  ResolveDisambiguationSchema,
  TrackResolveSuccessSchema,
  AlbumResolveSuccessSchema,
  ArtistResolveSuccessSchema,
  UnifiedResolveSuccessSchema,
  SharePageSchema,
  ArtistTopTrackSchema,
  ArtistProfileSchema,
  ArtistEventSchema,
  SimilarArtistTrackSchema,
  ArtistInfoSchema,
  PublicContentPageSchema,
  ContentPageSummarySchema,
  NavItemSchema,
  ActiveServiceSchema,
] as const;
