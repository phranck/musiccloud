/**
 * Single source of truth for HTTP endpoint paths shared across all three apps
 * (backend / frontend / dashboard).
 *
 * ## Why
 *
 * Endpoint strings used to be magic literals scattered across `app.post(...)`
 * route definitions, `fetch(...)` call sites, and `api.post(...)` helpers in
 * three separate apps. A typo anywhere broke a flow silently; renaming a
 * route required a multi-app grep that easily missed cases.
 *
 * Instead, every URL lives here once. Backend routes register against the
 * same constant the frontend / dashboard call against:
 *
 *     app.post(ENDPOINTS.v1.resolve.post, …)               // backend
 *     fetch(ENDPOINTS.v1.resolve.post, { method: "POST" }) // frontend
 *     api.post(ENDPOINTS.admin.cache.invalidateAll)        // dashboard
 *
 * ## Conventions
 *
 * - Group structure mirrors URL segments: `ENDPOINTS.admin.tracks.invalidateCache(shortId)`
 *   produces `/api/admin/tracks/<shortId>/invalidate-cache`.
 * - Plain strings for static paths; functions for parameterised paths.
 * - Methods are encoded only when a single path serves multiple verbs (e.g.
 *   GET + POST on `/api/v1/resolve`). Otherwise the path is just a string.
 * - `:param` placeholders are kept in `ROUTE_TEMPLATES` for backend
 *   registration where Fastify needs the colon syntax (e.g.
 *   `/api/admin/tracks/:shortId`); the function form is used everywhere a
 *   real value is being interpolated.
 *
 * ## How to extend
 *
 * Add the entry here first, then use it at every call site. If you need a
 * new sub-group, add a new nested object — keep the path layout in the
 * registry matching the URL exactly so a code reader can grep both ways.
 */

// -----------------------------------------------------------------------------
// Concrete paths used by call sites (frontend / dashboard / backend handlers)
// -----------------------------------------------------------------------------

export const ENDPOINTS = {
  /** `/api/v1/...` — public, versioned API. */
  v1: {
    /** Resolve a music URL or text query. POST for full-feature, GET for read-only. */
    resolve: "/api/v1/resolve",
    /** GET `/api/v1/share/:shortId` — fetch a previously-resolved share. */
    share: (shortId: string) => `/api/v1/share/${shortId}`,
    /** GET `/api/v1/redirect?short=…` — short-link redirect. */
    redirect: "/api/v1/redirect",
    /** GET `/api/v1/artist-info?…` — Last.fm + Ticketmaster aggregated artist info. */
    artistInfo: "/api/v1/artist-info",
    /** GET `/api/v1/random-example` — pick a random featured track. */
    randomExample: "/api/v1/random-example",
    /** GET `/api/v1/link/:id` — link metadata by id. */
    link: (id: string) => `/api/v1/link/${id}`,
    siteSettings: {
      /** GET — public site settings exposed to the frontend (currently: tracking flag). */
      tracking: "/api/v1/site-settings/tracking",
    },
  },

  /** `/api/auth/...` — public auth endpoints (machine-to-machine token issuance). */
  auth: {
    /** POST — exchange a long-lived secret for a short-lived JWT. */
    token: "/api/auth/token",
  },

  /**
   * Astro-frontend proxy routes. The public site exposes a short-form
   * `/api/<name>` layer that the React islands call; the corresponding
   * Astro handler in `apps/frontend/src/pages/api/<name>.ts` forwards to
   * the real backend at `ENDPOINTS.v1.*`. Distinct constant set because
   * the URLs are different (no `/v1/` segment) and live on a different
   * origin from the backend in prod.
   */
  frontend: {
    /** POST — React components call this; Astro forwards to `ENDPOINTS.v1.resolve`. */
    resolve: "/api/resolve",
    /** GET — forwarded to `ENDPOINTS.v1.randomExample`. */
    randomExample: "/api/random-example",
    /** GET — forwarded to `ENDPOINTS.v1.artistInfo`. */
    artistInfo: "/api/artist-info",
    /** GET — forwarded to `ENDPOINTS.v1.redirect`. */
    redirect: "/api/redirect",
    /** Umami analytics proxy prefix (script.js + event endpoint live beneath). */
    umami: "/api/mc",
  },

  /** `/api/admin/...` — admin dashboard endpoints (JWT-protected). */
  admin: {
    auth: {
      /** GET — whether an admin account already exists. */
      setupStatus: "/api/admin/auth/setup-status",
      /** POST — create the initial admin account (one-time). */
      setup: "/api/admin/auth/setup",
      /** POST — log in with email + password. */
      login: "/api/admin/auth/login",
      /** GET — currently authenticated admin. */
      me: "/api/admin/auth/me",
      /** POST — refresh the JWT. */
      refresh: "/api/admin/auth/refresh",
    },

    users: {
      /** GET — list / POST — create. */
      list: "/api/admin/users",
      /** PATCH / DELETE — single user by id. */
      detail: (id: string) => `/api/admin/users/${id}`,
      /** POST — upload, PATCH — set, DELETE — remove a user's avatar. */
      avatar: (id: string) => `/api/admin/users/${id}/avatar`,
    },

    tracks: {
      /** GET — list / DELETE — bulk delete (ids in body). */
      list: "/api/admin/tracks",
      /** GET — fetch one / PATCH — update one. */
      detail: (id: string) => `/api/admin/tracks/${id}`,
      /** PATCH — toggle the featured flag for a single track. */
      setFeatured: (shortId: string) => `/api/admin/tracks/${shortId}/featured`,
      /** POST — mark this track's cached resolution as stale; share URL stays alive. */
      invalidateCache: (shortId: string) => `/api/admin/tracks/${shortId}/invalidate-cache`,
    },

    albums: {
      /** GET — list / DELETE — bulk delete. */
      list: "/api/admin/albums",
      /** PATCH — toggle the featured flag. */
      setFeatured: (shortId: string) => `/api/admin/albums/${shortId}/featured`,
      /** POST — mark this album's cached resolution as stale. */
      invalidateCache: (shortId: string) => `/api/admin/albums/${shortId}/invalidate-cache`,
    },

    artists: {
      /** GET — list / DELETE — bulk delete. */
      list: "/api/admin/artists",
      /** POST — mark this artist's cached resolution as stale. */
      invalidateCache: (shortId: string) => `/api/admin/artists/${shortId}/invalidate-cache`,
    },

    cache: {
      /** POST — bulk: stale every track + album + artist. Share URLs stay alive. */
      invalidateAll: "/api/admin/cache/invalidate-all",
      /** POST — drop the artist-info (top tracks / profile / tour dates) cache. */
      artistClear: "/api/admin/artist-cache/clear",
    },

    /** GET — counts of tracks / albums / artists in the DB. */
    dataCounts: "/api/admin/data-counts",
    /** POST — destructive: nuke all tracks, albums, artists, links, short URLs. */
    resetAll: "/api/admin/reset-all",
    /** GET — aggregated stats. */
    stats: "/api/admin/stats",
    /** GET — admin activity log (SSE). */
    events: "/api/admin/events",

    siteSettings: {
      /** GET — read all site settings / PATCH — update. */
      base: "/api/admin/site-settings",
    },

    analytics: {
      /** GET — overall stats summary (visitors, pageviews, bounce, duration). */
      stats: "/api/admin/analytics/stats",
      /** GET — pageviews timeline. */
      pageviews: "/api/admin/analytics/pageviews",
      /** GET — top metric (url / referrer / country / browser / etc.). Type via ?type=… */
      metrics: "/api/admin/analytics/metrics",
      /** GET — currently active visitors count. */
      active: "/api/admin/analytics/active",
      /** GET — realtime active visitors + top pages. */
      realtime: "/api/admin/analytics/realtime",
      events: {
        /** GET — track-resolve events (timeline). */
        resolves: "/api/admin/analytics/events/resolves",
        /** GET — track-resolve events (total count). */
        resolvesTotal: "/api/admin/analytics/events/resolves/total",
        /** GET — service-link-click events (timeline). */
        linkClicks: "/api/admin/analytics/events/link-clicks",
        /** GET — service-link-click events (total count). */
        linkClicksTotal: "/api/admin/analytics/events/link-clicks/total",
        /** GET — interactions (total count). */
        interactionsTotal: "/api/admin/analytics/events/interactions/total",
      },
    },
  },
} as const;

// -----------------------------------------------------------------------------
// Backend route templates — Fastify needs `:param` syntax for parameterised
// paths. Keeping these in lockstep with the function-form constants above
// guarantees both consumers point at the same URL.
// -----------------------------------------------------------------------------

export const ROUTE_TEMPLATES = {
  v1: {
    share: "/api/v1/share/:shortId",
    link: "/api/v1/link/:id",
  },
  admin: {
    users: {
      detail: "/api/admin/users/:id",
      avatar: "/api/admin/users/:id/avatar",
    },
    tracks: {
      detail: "/api/admin/tracks/:id",
      setFeatured: "/api/admin/tracks/:shortId/featured",
      invalidateCache: "/api/admin/tracks/:shortId/invalidate-cache",
    },
    albums: {
      setFeatured: "/api/admin/albums/:shortId/featured",
      invalidateCache: "/api/admin/albums/:shortId/invalidate-cache",
    },
    artists: {
      invalidateCache: "/api/admin/artists/:shortId/invalidate-cache",
    },
  },
} as const;
