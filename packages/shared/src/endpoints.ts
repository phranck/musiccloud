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
 * new sub-group, add a new nested object: keep the path layout in the
 * registry matching the URL exactly so a code reader can grep both ways.
 */

// -----------------------------------------------------------------------------
// Concrete paths used by call sites (frontend / dashboard / backend handlers)
// -----------------------------------------------------------------------------

export const ENDPOINTS = {
  /** `/api/v1/...`: public, versioned API. */
  v1: {
    /** Resolve a music URL or text query. POST for full-feature, GET for read-only. */
    resolve: "/api/v1/resolve",
    /** GET `/api/v1/share/:shortId`: fetch a previously-resolved share. */
    share: (shortId: string) => `/api/v1/share/${shortId}`,
    /** GET `/api/v1/artist-info?…`: Last.fm + Ticketmaster aggregated artist info. */
    artistInfo: "/api/v1/artist-info",
    /** GET `/api/v1/random-example`: pick a random short URL (track or album). */
    randomExample: "/api/v1/random-example",
    /** GET `/api/v1/link/:id`: link metadata by id. */
    link: (id: string) => `/api/v1/link/${id}`,
    /** GET `/api/v1/genre-artwork/:genreKey`: procedurally generated genre cover. */
    genreArtwork: (genreKey: string) => `/api/v1/genre-artwork/${encodeURIComponent(genreKey)}`,
    siteSettings: {
      /** GET: public site settings exposed to the frontend (currently: tracking flag). */
      tracking: "/api/v1/site-settings/tracking",
    },
    services: {
      /** GET: list of currently enabled + available resolve plugins.
       * Feeds the Marquee and resolve/embed pages at SSR time. */
      active: "/api/v1/services/active",
    },
    /** GET `/api/v1/nav/:navId`: public navigation items for header / footer. */
    nav: (navId: "header" | "footer") => `/api/v1/nav/${navId}`,
    content: {
      /** GET: list all published content pages (slugs + titles only). */
      list: "/api/v1/content",
      /** GET `/api/v1/content/:slug`: a published content page with rendered HTML. */
      detail: (slug: string) => `/api/v1/content/${slug}`,
    },
  },

  /** `/api/auth/...`: public auth endpoints (machine-to-machine token issuance). */
  auth: {
    /** POST: exchange a long-lived secret for a short-lived JWT. */
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
    /** POST: React components call this; Astro forwards to `ENDPOINTS.v1.resolve`. */
    resolve: "/api/resolve",
    /** GET: forwarded to `ENDPOINTS.v1.randomExample`. */
    randomExample: "/api/random-example",
    /** GET: forwarded to `ENDPOINTS.v1.artistInfo`. */
    artistInfo: "/api/artist-info",
    /** GET: forwarded to `ENDPOINTS.v1.genreArtwork`. */
    genreArtwork: (genreKey: string) => `/api/genre-artwork/${encodeURIComponent(genreKey)}`,
    /** GET: handled entirely by Astro (`pages/api/redirect.ts`): takes `?url=`,
     * calls `ENDPOINTS.v1.resolve`, then 302s to the resolved share page. */
    redirect: "/api/redirect",
    /** Umami analytics proxy prefix (script.js + event endpoint live beneath). */
    umami: "/api/mc",
    /** GET: forwarded to `ENDPOINTS.v1.services.active`. */
    activeServices: "/api/services/active",
  },

  /** `/api/admin/...`: admin dashboard endpoints (JWT-protected). */
  admin: {
    auth: {
      /** GET: whether an admin account already exists. */
      setupStatus: "/api/admin/auth/setup-status",
      /** POST: create the initial admin account (one-time). */
      setup: "/api/admin/auth/setup",
      /** POST: log in with email + password. */
      login: "/api/admin/auth/login",
      /** GET: currently authenticated admin. */
      me: "/api/admin/auth/me",
      /** POST: refresh the JWT. */
      refresh: "/api/admin/auth/refresh",
    },

    invite: {
      /** GET: validate invite token and return invitee's username + email. */
      state: (token: string) => `/api/admin/invite/${token}`,
      /** POST: finalise the invite by setting the password. Body: { token, password }. */
      accept: "/api/admin/invite/accept",
    },

    users: {
      /** GET: list / POST: create. */
      list: "/api/admin/users",
      /** PATCH / DELETE: single user by id. */
      detail: (id: string) => `/api/admin/users/${id}`,
      /** POST: upload, PATCH: set, DELETE: remove a user's avatar. */
      avatar: (id: string) => `/api/admin/users/${id}/avatar`,
    },

    tracks: {
      /** GET: list / DELETE: bulk delete (ids in body). */
      list: "/api/admin/tracks",
      /** GET: fetch one / PATCH: update one. */
      detail: (id: string) => `/api/admin/tracks/${id}`,
      /** POST: mark this track's cached resolution as stale; share URL stays alive. */
      invalidateCache: (shortId: string) => `/api/admin/tracks/${shortId}/invalidate-cache`,
    },

    albums: {
      /** GET: list / DELETE: bulk delete. */
      list: "/api/admin/albums",
      /** POST: mark this album's cached resolution as stale. */
      invalidateCache: (shortId: string) => `/api/admin/albums/${shortId}/invalidate-cache`,
    },

    artists: {
      /** GET: list / DELETE: bulk delete. */
      list: "/api/admin/artists",
      /** POST: mark this artist's cached resolution as stale. */
      invalidateCache: (shortId: string) => `/api/admin/artists/${shortId}/invalidate-cache`,
    },

    cache: {
      /** POST: bulk: stale every track + album + artist. Share URLs stay alive. */
      invalidateAll: "/api/admin/cache/invalidate-all",
      /** POST: drop the artist-info (top tracks / profile / tour dates) cache. */
      artistClear: "/api/admin/artist-cache/clear",
      /** POST: drop all stored genre-browse artworks AND reset the in-memory browse-grid cache. */
      genreClear: "/api/admin/cache/genre/clear",
    },

    /** GET: counts of tracks / albums / artists in the DB. */
    dataCounts: "/api/admin/data-counts",
    /** POST: destructive: nuke all tracks, albums, artists, links, short URLs. */
    resetAll: "/api/admin/reset-all",
    /** GET: aggregated stats. */
    stats: "/api/admin/stats",
    /** GET: admin activity log (SSE). */
    events: "/api/admin/events",

    siteSettings: {
      /** GET: read all site settings / PATCH: update. */
      base: "/api/admin/site-settings",
    },

    plugins: {
      /** GET: list all installed resolve plugins with their runtime state. */
      list: "/api/admin/plugins",
      /** PATCH: toggle a plugin on/off. Body: { enabled: boolean }. */
      detail: (id: string) => `/api/admin/plugins/${id}`,
    },

    emailTemplates: {
      /** GET: list all / POST: create. */
      list: "/api/admin/email-templates",
      /** GET / PUT / DELETE: single template by numeric id. */
      detail: (id: number) => `/api/admin/email-templates/${id}`,
      /** POST: render preview HTML for editor iframe. */
      preview: "/api/admin/email-templates/preview",
      /** POST: import one template (create or overwrite). */
      import: "/api/admin/email-templates/import",
      /** GET: download all templates as a ZIP archive. */
      export: "/api/admin/email-templates/export",
      /** POST: send a test email rendered from this template to the caller. */
      test: (id: number) => `/api/admin/email-templates/${id}/test`,
    },

    navigations: {
      /** GET / PUT: managed navigation items for "header" or "footer". */
      detail: (navId: "header" | "footer") => `/api/admin/nav/${navId}`,
    },

    pages: {
      /** GET: list all content pages (admin) / POST: create. */
      list: "/api/admin/pages",
      /** GET / PATCH / DELETE: single content page by slug. */
      detail: (slug: string) => `/api/admin/pages/${slug}`,
    },

    analytics: {
      /** GET: overall stats summary (visitors, pageviews, bounce, duration). */
      stats: "/api/admin/analytics/stats",
      /** GET: pageviews timeline. */
      pageviews: "/api/admin/analytics/pageviews",
      /** GET: top metric (url / referrer / country / browser / etc.). Type via ?type=… */
      metrics: "/api/admin/analytics/metrics",
      /** GET: currently active visitors count. */
      active: "/api/admin/analytics/active",
      /** GET: realtime active visitors + top pages. */
      realtime: "/api/admin/analytics/realtime",
      events: {
        /** GET: track-resolve events (timeline). */
        resolves: "/api/admin/analytics/events/resolves",
        /** GET: track-resolve events (total count). */
        resolvesTotal: "/api/admin/analytics/events/resolves/total",
        /** GET: service-link-click events (timeline). */
        linkClicks: "/api/admin/analytics/events/link-clicks",
        /** GET: service-link-click events (total count). */
        linkClicksTotal: "/api/admin/analytics/events/link-clicks/total",
        /** GET: interactions (total count). */
        interactionsTotal: "/api/admin/analytics/events/interactions/total",
      },
    },
  },
} as const;

// -----------------------------------------------------------------------------
// Backend route templates: Fastify needs `:param` syntax for parameterised
// paths. Keeping these in lockstep with the function-form constants above
// guarantees both consumers point at the same URL.
// -----------------------------------------------------------------------------

export const ROUTE_TEMPLATES = {
  v1: {
    share: "/api/v1/share/:shortId",
    link: "/api/v1/link/:id",
    genreArtwork: "/api/v1/genre-artwork/:genreKey",
    nav: "/api/v1/nav/:navId",
    contentDetail: "/api/v1/content/:slug",
  },
  admin: {
    users: {
      detail: "/api/admin/users/:id",
      avatar: "/api/admin/users/:id/avatar",
    },
    tracks: {
      detail: "/api/admin/tracks/:id",
      invalidateCache: "/api/admin/tracks/:shortId/invalidate-cache",
    },
    albums: {
      invalidateCache: "/api/admin/albums/:shortId/invalidate-cache",
    },
    artists: {
      invalidateCache: "/api/admin/artists/:shortId/invalidate-cache",
    },
    plugins: {
      detail: "/api/admin/plugins/:id",
    },
    emailTemplates: {
      detail: "/api/admin/email-templates/:id",
      test: "/api/admin/email-templates/:id/test",
    },
    invite: {
      state: "/api/admin/invite/:token",
    },
    navigations: {
      detail: "/api/admin/nav/:navId",
    },
    pages: {
      detail: "/api/admin/pages/:slug",
    },
  },
} as const;
