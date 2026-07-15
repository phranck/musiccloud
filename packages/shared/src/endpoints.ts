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
 * - Group structure mirrors URL segments: `ENDPOINTS.admin.artists.invalidateCache(shortId)`
 *   produces `/api/admin/artists/<shortId>/invalidate-cache`.
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

import type { JamendoAudioFormat } from "./audio-format.js";
import type { Locale } from "./locales.js";

// -----------------------------------------------------------------------------
// Concrete paths used by call sites (frontend / dashboard / backend handlers)
// -----------------------------------------------------------------------------

export const ENDPOINTS = {
  /** `/api/v1/...`: public, versioned API. */
  v1: {
    /** Resolve a music URL or text query. POST for full-feature, GET for read-only. */
    resolve: "/api/v1/resolve",
    ccResolve: "/api/v1/cc/resolve",
    /** GET `/api/v1/share/:shortId`: fetch a previously-resolved share. */
    share: (shortId: string) => `/api/v1/share/${shortId}`,
    /** GET `/api/v1/share/:shortId/preview`: refresh + return fresh preview URL.
     *  Separated from the main share endpoint so the hot path stays DB-only
     *  and the (slow) Deezer call is client-driven and async. */
    sharePreview: (shortId: string) => `/api/v1/share/${shortId}/preview`,
    /** GET `/api/v1/artist-info?…`: Last.fm + Ticketmaster aggregated artist info. */
    artistInfo: "/api/v1/artist-info",
    /** GET `/api/v1/random-example`: pick a random short URL (track or album). */
    randomExample: "/api/v1/random-example",
    /** GET `/api/v1/cc/random-example`: pick a random CC track short URL, for the
     *  landing page's live-example link in Creative-Commons mode. */
    ccRandomExample: "/api/v1/cc/random-example",
    /** GET `/api/v1/link/:id`: link metadata by id. */
    link: (id: string) => `/api/v1/link/${id}`,
    /** GET `/api/v1/genre-artwork/:genreKey`: procedurally generated genre cover. */
    genreArtwork: (genreKey: string) => `/api/v1/genre-artwork/${encodeURIComponent(genreKey)}`,
    /** GET `/api/v1/cc/genre-artwork/:genreKey`: procedurally generated CC genre cover,
     *  sourced from a Jamendo album cover. Mirrors {@link genreArtwork} but stays
     *  100% Jamendo so the Creative-Commons path never touches Last.fm. */
    ccGenreArtwork: (genreKey: string) => `/api/v1/cc/genre-artwork/${encodeURIComponent(genreKey)}`,
    /** GET `/api/v1/cc/audio/:jamendoId`: CORS-safe proxy of the full Jamendo
     *  stream (Range-forwarded). Lets the player load + analyse CC audio that
     *  Jamendo serves without the Range CORS preflight headers Web Audio needs.
     *  Optional `?format=` selects the delivery format (default {@link DEFAULT_STREAM_FORMAT}). */
    ccAudio: (jamendoId: string, format?: JamendoAudioFormat) =>
      `/api/v1/cc/audio/${encodeURIComponent(jamendoId)}${format ? `?format=${format}` : ""}`,
    /** GET `/api/v1/cc/download/:jamendoId`: same-origin download proxy. Re-serves
     *  the Jamendo audio as an attachment with a proper `Content-Disposition`
     *  filename (`Artist_Album_NN_Title.ext`), so the browser saves a correctly
     *  named audio file instead of the cross-origin Jamendo download page (which a
     *  bare `<a download>` cannot rename and saves as `.html`).
     *  Optional `?format=` selects the delivery format (default {@link DEFAULT_STREAM_FORMAT}). */
    ccDownload: (jamendoId: string, format?: JamendoAudioFormat) =>
      `/api/v1/cc/download/${encodeURIComponent(jamendoId)}${format ? `?format=${format}` : ""}`,
    /** GET `/api/v1/cc/artist-info?jamendoArtistId&artistName`: the CC artist
     *  column (Jamendo top + similar tracks + profile), loaded async by the share
     *  page so the core card renders immediately. */
    ccArtistInfo: "/api/v1/cc/artist-info",
    /** GET `/api/v1/cc/bandcamp/:jamendoId`: whether the CC track is also on
     *  Bandcamp (fuzzy search + confidence). Async + cached (incl. negative
     *  hits); the share page loads it after the core card renders. */
    ccBandcamp: (jamendoId: string) => `/api/v1/cc/bandcamp/${encodeURIComponent(jamendoId)}`,
    siteSettings: {
      /** GET: public site settings exposed to the frontend (currently: tracking flag). */
      tracking: "/api/v1/site-settings/tracking",
      /** GET: the validated, whitelisted design-token blob (glass material +
       *  night-sky shader). Consumed by the Astro frontend during SSR to seed
       *  the `:root` custom properties. Never exposes the raw stored string. */
      designTokens: "/api/v1/site-settings/design-tokens",
    },
    services: {
      /** GET: list of currently enabled + available resolve plugins.
       * Feeds the Marquee and resolve pages at SSR time. */
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
    telemetry: {
      /** POST: ingest an app-side error event from the Apple client (Testflight). */
      appError: "/api/v1/telemetry/app-error",
    },
    /** GET `/api/v1/tiers`: public tier list for the Developer Portal pricing page. */
    tiers: "/api/v1/tiers",
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
    /** POST: React components call this in CC mode; Astro forwards to `ENDPOINTS.v1.ccResolve`. */
    ccResolve: "/api/cc/resolve",
    /** GET: forwarded to `ENDPOINTS.v1.randomExample`. */
    randomExample: "/api/random-example",
    /** GET: forwarded to `ENDPOINTS.v1.artistInfo`. */
    artistInfo: "/api/artist-info",
    /** GET: forwarded to `ENDPOINTS.v1.sharePreview`. Client-side audio
     *  player calls this lazily to refresh expired Deezer preview URLs. */
    sharePreview: (shortId: string) => `/api/share-preview/${encodeURIComponent(shortId)}`,
    /** GET: forwarded to `ENDPOINTS.v1.genreArtwork`. */
    genreArtwork: (genreKey: string) => `/api/genre-artwork/${encodeURIComponent(genreKey)}`,
    /** GET: forwarded to `ENDPOINTS.v1.ccGenreArtwork`. CC genre tile cover (Jamendo-sourced). */
    ccGenreArtwork: (genreKey: string) => `/api/cc/genre-artwork/${encodeURIComponent(genreKey)}`,
    /** GET: forwarded to `ENDPOINTS.v1.ccAudio`. The audio player loads CC tracks
     *  through this same-origin proxy so no cross-origin Range request is made.
     *  Optional `?format=` selects the delivery format (default {@link DEFAULT_STREAM_FORMAT}). */
    ccAudio: (jamendoId: string, format?: JamendoAudioFormat) =>
      `/api/cc/audio/${encodeURIComponent(jamendoId)}${format ? `?format=${format}` : ""}`,
    /** GET: forwarded to `ENDPOINTS.v1.ccDownload`. The CC download button points
     *  here so the browser downloads a correctly named, same-origin audio file.
     *  Optional `?format=` selects the delivery format (default {@link DEFAULT_STREAM_FORMAT}). */
    ccDownload: (jamendoId: string, format?: JamendoAudioFormat) =>
      `/api/cc/download/${encodeURIComponent(jamendoId)}${format ? `?format=${format}` : ""}`,
    /** GET: forwarded to `ENDPOINTS.v1.ccArtistInfo`. The CC share page loads the
     *  artist column through this async, after the core card has rendered. */
    ccArtistInfo: "/api/cc/artist-info",
    /** GET: forwarded to `ENDPOINTS.v1.ccBandcamp`. The CC share page loads the
     *  Bandcamp presence through this async, after the core card has rendered. */
    ccBandcamp: (jamendoId: string) => `/api/cc/bandcamp/${encodeURIComponent(jamendoId)}`,
    /** GET: handled entirely by Astro (`pages/api/redirect.ts`): takes `?url=`,
     * calls `ENDPOINTS.v1.resolve`, then 302s to the resolved share page. */
    redirect: "/api/redirect",
    /** Umami analytics proxy prefix (script.js + event endpoint live beneath). */
    umami: "/api/mc",
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
    },

    albums: {
      /** GET: list / DELETE: bulk delete. */
      list: "/api/admin/albums",
    },

    artists: {
      /** GET: list / DELETE: bulk delete artist share profiles. */
      list: "/api/admin/artists",
      /** POST: mark this artist's cached resolution as stale. */
      invalidateCache: (shortId: string) => `/api/admin/artists/${shortId}/invalidate-cache`,
    },

    artistEntities: {
      /** GET: list normalized artist identity entities. */
      list: "/api/admin/artist-entities",
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

    emailAssets: {
      /** GET: list all asset metadata (admin) / POST: upload an image (data: URL body), returns { id }. */
      list: "/api/admin/email-assets",
      /** GET: serve an asset's bytes by id (public — mail clients have no admin JWT). */
      detail: (id: string) => `/api/admin/email-assets/${id}`,
    },
    emailBranding: {
      /** GET: read / PUT: update the global branding singleton. */
      base: "/api/admin/email-branding",
    },
    emailActions: {
      /** GET: list all code-defined actions + their bindings. */
      list: "/api/admin/email-actions",
      /** POST: bind a template to an action. Body: { actionKey, templateId }. */
      bindings: "/api/admin/email-actions/bindings",
      /** PATCH: toggle / DELETE: remove a binding by id. */
      binding: (id: string) => `/api/admin/email-actions/bindings/${id}`,
    },

    gdpr: {
      /** GET `?email=`: a subject's personal-data package (GDPR Art. 15/20) — also covers account-less submitters. */
      export: "/api/admin/gdpr/export",
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
      /** PUT: atomic save of pages, segments, page translations, and top-level order. */
      bulk: "/api/admin/pages/bulk",
      translations: {
        /** GET: list all translations (including default-locale) for a page + per-locale status. */
        list: (slug: string) => `/api/admin/pages/${slug}/translations`,
        /** GET: one translation / PUT: upsert {title, content} / DELETE: remove. */
        detail: (slug: string, locale: Locale) => `/api/admin/pages/${slug}/translations/${locale}`,
      },
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
    },

    crawler: {
      /** GET: list all crawler sources joined with registered metadata. */
      sources: "/api/admin/crawler/sources",
      /** PATCH: mutate one source's `enabled`, `intervalMinutes`, `config`, `cursor`, or `nextRunAt`. */
      sourceDetail: (id: string) => `/api/admin/crawler/sources/${id}`,
      /** POST: nudge a source's `next_run_at` to NOW(); heartbeat picks it up next minute. */
      sourceRunNow: (id: string) => `/api/admin/crawler/sources/${id}/run-now`,
      /** POST: clear a stale `running_since` lock so the next heartbeat can re-acquire. */
      sourceReleaseLock: (id: string) => `/api/admin/crawler/sources/${id}/release-lock`,
      /** GET: paginated `crawl_runs` history. Query: `?source=<id>&page=<n>&limit=<m>`. */
      runs: "/api/admin/crawler/runs",
    },

    developer: {
      apiAccess: {
        /** GET: overview — pending requests + active clients. Query: `?status=` filters requests. */
        overview: "/api/admin/developer/api-access",
        /** GET: a single request by id. */
        requestDetail: (id: string) => `/api/admin/developer/api-access/requests/${id}`,
        /** POST: approve a request; creates a new client linked to it. Body: `{ requestsPerMinute?, requestsPerDay? }`. */
        requestApprove: (id: string) => `/api/admin/developer/api-access/requests/${id}/approve`,
        /** POST: reject a request. Body: `{ reviewNote }` (required). */
        requestReject: (id: string) => `/api/admin/developer/api-access/requests/${id}/reject`,
        /** GET: a single client by id, including its tokens (never the hash). */
        clientDetail: (id: string) => `/api/admin/developer/api-access/clients/${id}`,
        /** PATCH: update a client's status/rate limits. Body: `{ status?, requestsPerMinute?, requestsPerDay? }`. */
        clientUpdate: (id: string) => `/api/admin/developer/api-access/clients/${id}`,
        /** POST: admin-issued token for a client (moderation/support case). Returns the raw token once. */
        clientCreateToken: (id: string) => `/api/admin/developer/api-access/clients/${id}/tokens`,
        /** POST: revoke a token. */
        /** POST: activate a previously revoked token. */
        tokenActivate: (id: string) => `/api/admin/developer/api-access/tokens/${id}/activate`,
        /** POST: deactivate (revoke) a token — stops API access. */
        tokenDeactivate: (id: string) => `/api/admin/developer/api-access/tokens/${id}/deactivate`,
      },
      /** GET: list all developer accounts with client counts. */
      accounts: "/api/admin/developer/accounts",
      /** GET: single developer account / PATCH: update. */
      accountDetail: (id: string) => `/api/admin/developer/accounts/${id}`,
      /** GET: list all tiers / POST: create. */
      tiers: "/api/admin/developer/tiers",
      /** PATCH / DELETE: single tier by id. */
      tierDetail: (id: string) => `/api/admin/developer/tiers/${id}`,
    },
  },

  /**
   * `/api/dev/...`: external developer-portal endpoints for
   * developer.musiccloud.io (MC-064). Separate account system from `admin`
   * above — self-service portal users, not dashboard administrators. The
   * session is an httpOnly `mc_dev_session` cookie, not a Bearer header, so
   * these paths are called by the portal with `credentials: "include"`.
   */
  dev: {
    auth: {
      /** POST: register a new developer account (unverified) + send verification email. Body: { email, password, displayName? }. */
      signup: "/api/dev/auth/signup",
      /** POST: redeem a verification token, marking the account's email verified. Body: { token }. */
      verifyEmail: "/api/dev/auth/verify-email",
      /** POST: log in with email + password (verified accounts only); sets the session cookie. Body: { email, password }. */
      login: "/api/dev/auth/login",
      /** POST: request a password-reset email. Always 200 (no account-existence leak). Body: { email }. */
      requestReset: "/api/dev/auth/request-reset",
      /** POST: redeem a reset token and set a new password. Body: { token, password }. */
      resetPassword: "/api/dev/auth/reset-password",
      /** POST: clear the session cookie. */
      logout: "/api/dev/auth/logout",
      /** GET: the currently authenticated developer account (cookie session). */
      me: "/api/dev/auth/me",
      /**
       * POST: permanently delete the caller's own developer account (cascades
       * to identities, tokens, API-access requests/clients) and clear the
       * session cookie. Body: `{ password }` — required only when the
       * account has a password set (omitted/ignored for GitHub-only accounts).
       */
      deleteAccount: "/api/dev/auth/delete-account",
      /** GET: the caller's complete personal-data package as a JSON download (GDPR Art. 15/20). */
      export: "/api/dev/auth/export",
      /** GitHub OAuth (MC-065). `start` returns the authorize URL + signed state; `exchange` redeems the callback code. */
      github: {
        /** GET: returns `{ authorizeUrl, state }` for the Astro app to redirect to. */
        start: "/api/dev/auth/github/start",
        /** POST: redeems `{ code, state }`, issues the session cookie, returns `{ account }`. */
        exchange: "/api/dev/auth/github/exchange",
      },
    },

    /**
     * Developer self-service API-access management (MC-025/MC-077).
     * Every route requires the `mc_dev_session` cookie; ownership is
     * enforced server-side (a developer can only ever see/mutate their
     * own requests, clients and tokens).
     */
    apiAccess: {
      /** POST: submit a new access request. Body: { appName, appDescription, estimatedRequestsPerDay }. */
      requestsCreate: "/api/dev/api-access/requests",
      /** GET: list the caller's own requests. */
      requestsList: "/api/dev/api-access/requests",
      /** GET: list the caller's own clients, including their tokens (never the hash). */
      clientsList: "/api/dev/api-access/clients",
      /** POST: create a new token for one of the caller's own clients. Returns the raw token once. */
      clientCreateToken: (id: string) => `/api/dev/api-access/clients/${id}/tokens`,
      /** POST: revoke one of the caller's own tokens. */
      tokenRevoke: (id: string) => `/api/dev/api-access/tokens/${id}/revoke`,
      /** POST: rotate one of the caller's own tokens. Returns the new raw token once. */
      tokenRotate: (id: string) => `/api/dev/api-access/tokens/${id}/rotate`,
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
    sharePreview: "/api/v1/share/:shortId/preview",
    link: "/api/v1/link/:id",
    genreArtwork: "/api/v1/genre-artwork/:genreKey",
    /** Route template for ENDPOINTS.v1.ccGenreArtwork (CC genre tile cover, Jamendo-sourced). */
    ccGenreArtwork: "/api/v1/cc/genre-artwork/:genreKey",
    /** Route template for ENDPOINTS.v1.ccAudio (CORS-safe Jamendo stream proxy).
     *  The `format` is an optional `?format=` query (validated against JamendoAudioFormat), not a path segment. */
    ccAudio: "/api/v1/cc/audio/:jamendoId",
    /** Route template for ENDPOINTS.v1.ccDownload (same-origin download proxy). */
    ccDownload: "/api/v1/cc/download/:jamendoId",
    /** Route template for ENDPOINTS.v1.ccBandcamp (Bandcamp presence lookup). */
    ccBandcamp: "/api/v1/cc/bandcamp/:jamendoId",
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
    },
    artists: {
      invalidateCache: "/api/admin/artists/:shortId/invalidate-cache",
    },
    plugins: {
      detail: "/api/admin/plugins/:id",
    },
    crawler: {
      sourceDetail: "/api/admin/crawler/sources/:id",
      sourceRunNow: "/api/admin/crawler/sources/:id/run-now",
      sourceReleaseLock: "/api/admin/crawler/sources/:id/release-lock",
    },
    developer: {
      apiAccess: {
        requestDetail: "/api/admin/developer/api-access/requests/:id",
        requestApprove: "/api/admin/developer/api-access/requests/:id/approve",
        requestReject: "/api/admin/developer/api-access/requests/:id/reject",
        clientDetail: "/api/admin/developer/api-access/clients/:id",
        clientUpdate: "/api/admin/developer/api-access/clients/:id",
        clientCreateToken: "/api/admin/developer/api-access/clients/:id/tokens",
        tokenActivate: "/api/admin/developer/api-access/tokens/:id/activate",
        tokenDeactivate: "/api/admin/developer/api-access/tokens/:id/deactivate",
      },
      accounts: "/api/admin/developer/accounts",
      accountDetail: "/api/admin/developer/accounts/:id",
      tierDetail: "/api/admin/developer/tiers/:id",
    },
    emailTemplates: {
      detail: "/api/admin/email-templates/:id",
      test: "/api/admin/email-templates/:id/test",
    },
    emailAssets: { detail: "/api/admin/email-assets/:id" },
    emailActions: { binding: "/api/admin/email-actions/bindings/:id" },
    invite: {
      state: "/api/admin/invite/:token",
    },
    navigations: {
      detail: "/api/admin/nav/:navId",
    },
    pages: {
      detail: "/api/admin/pages/:slug",
      /** Route template for ENDPOINTS.admin.pages.bulk. */
      bulk: "/api/admin/pages/bulk",
      /** Route template for ENDPOINTS.admin.pages.translations.list. */
      translationsList: "/api/admin/pages/:slug/translations",
      /** Route template for ENDPOINTS.admin.pages.translations.detail. */
      translationsDetail: "/api/admin/pages/:slug/translations/:locale",
    },
  },
  dev: {
    apiAccess: {
      clientCreateToken: "/api/dev/api-access/clients/:id/tokens",
      tokenRevoke: "/api/dev/api-access/tokens/:id/revoke",
      tokenRotate: "/api/dev/api-access/tokens/:id/rotate",
    },
  },
} as const;
