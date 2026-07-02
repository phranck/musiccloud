import { readFile } from "node:fs/promises";
import path from "node:path";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import swagger from "@fastify/swagger";
import Fastify from "fastify";
import { getRepository } from "./db/index.js";
import { runMigrations } from "./db/run-migrations.js";
import { finalizePublicOpenApiDocument } from "./docs/openapi-finalize.js";
import {
  getScalarApiReferenceHtml,
  getScalarReferenceFontCss,
  SCALAR_API_REFERENCE_CONTENT_SECURITY_POLICY,
  SCALAR_REFERENCE_FONT_FILES,
} from "./docs/scalar-reference.js";
import { assertRequiredBootEnv } from "./lib/boot-env.js";
import { requireEnvList } from "./lib/env.js";
import authPlugin from "./plugins/auth.js";
import adminAnalyticsRoutes from "./routes/admin-analytics.js";
import { adminApiAccessRoutes } from "./routes/admin-api-access.js";
import adminAuthRoutes from "./routes/admin-auth.js";
import adminContentRoutes from "./routes/admin-content.js";
import adminCrawlerRoutes from "./routes/admin-crawler.js";
import adminDataRoutes from "./routes/admin-data.js";
import adminEmailActionsRoutes from "./routes/admin-email-actions.js";
import adminEmailAssetsRoutes from "./routes/admin-email-assets.js";
import adminEmailBrandingRoutes from "./routes/admin-email-branding.js";
import adminEmailTemplateRoutes from "./routes/admin-email-templates.js";
import adminNavRoutes from "./routes/admin-nav.js";
import adminPluginsRoutes from "./routes/admin-plugins.js";
import adminSseRoutes from "./routes/admin-sse.js";
import adminUserRoutes from "./routes/admin-users.js";
import artistInfoRoutes from "./routes/artist-info.js";
import authRoutes from "./routes/auth.js";
import ccArtistInfoRoutes from "./routes/cc-artist-info.js";
import ccAudioRoutes from "./routes/cc-audio.js";
import ccBandcampRoutes from "./routes/cc-bandcamp.js";
import ccDownloadRoutes from "./routes/cc-download.js";
import ccGenreArtworkRoutes from "./routes/cc-genre-artwork.js";
import ccRandomExampleRoutes from "./routes/cc-random-example.js";
import ccResolveRoutes from "./routes/cc-resolve.js";
import { devApiAccessRoutes } from "./routes/dev-api-access.js";
import { devAuthRoutes } from "./routes/developer-auth.js";
import { devGitHubRoutes } from "./routes/developer-github.js";
import emailAssetServeRoutes from "./routes/email-assets.js";
import genreArtworkRoutes from "./routes/genre-artwork.js";
import linkRoutes from "./routes/link.js";
import publicContentNavRoutes from "./routes/public-content-nav.js";
import randomExampleRoutes from "./routes/random-example.js";
import resolveRoutes from "./routes/resolve.js";
import resolvePublicGetRoutes from "./routes/resolve-public-get.js";
import servicesPublicRoutes from "./routes/services-public.js";
import shareRoutes from "./routes/share.js";
import sharePreviewRoutes from "./routes/share-preview.js";
import { siteSettingsAdminRoutes, siteSettingsPublicRoutes } from "./routes/site-settings.js";
import telemetryAppErrorRoutes from "./routes/telemetry-app-error.js";
import { OPENAPI_SCHEMAS } from "./schemas/openapi-schemas.js";
import { isEmailProviderHealthy } from "./services/email-provider.js";
import { validateAdapters } from "./services/index.js";
import { warmAppleMusicToken } from "./services/plugins/apple-music/adapter.js";

const HOST = process.env.HOST ?? "0.0.0.0";
const PORT = Number(process.env.PORT ?? 4000);

// Parse TRUST_PROXY env var. Without this, `request.ip` behind a reverse
// proxy (Cloudflare / zerops ingress) resolves to the proxy's address, so
// every client shares the same rate-limit bucket and a handful of global
// requests trip the per-IP limits for everyone.
//   unset / ""           → false (direct exposure, dev default)
//   "true" / "false"     → boolean
//   integer ("1", "2")   → hop count (recommended for prod)
//   anything else        → forwarded as-is to Fastify (IP / CIDR list)
function parseTrustProxy(raw: string | undefined): boolean | number | string {
  if (raw === undefined || raw === "") return false;
  if (raw === "true") return true;
  if (raw === "false") return false;
  const n = Number(raw);
  if (Number.isInteger(n) && n >= 0) return n;
  return raw;
}

/** Timeout for the upstream-app liveness probes (`/health/frontend`, `/health/developer`, `/health/dashboard`). */
const UPSTREAM_HEALTH_TIMEOUT_MS = 5000;

/**
 * Liveness check for an upstream MusicCloud app (public site / developer portal /
 * dashboard), powering the `GET /health/frontend`, `/health/developer` and
 * `/health/dashboard` probes that the public status page monitors.
 *
 * Probing THROUGH the backend serves two ends: it keeps every service on the
 * consistent `api.musiccloud.io/health/<service>` URL, and it lets the IPv4-only
 * GitHub-Actions monitor reach the IPv6-only `developer.*` / `dashboard.*` Zerops
 * subdomains, which it cannot hit directly. Any non-5xx response within the
 * timeout means the app is serving (a 3xx login redirect still counts as up;
 * `fetch` follows it).
 *
 * @param url - the upstream origin to probe (from `PUBLIC_URL` / `DEVELOPER_URL` / `DASHBOARD_URL`)
 * @returns true when the upstream answers with a non-5xx status before the timeout
 */
async function isUpstreamReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(UPSTREAM_HEALTH_TIMEOUT_MS),
    });
    return res.status < 500;
  } catch {
    return false;
  }
}

/**
 * Tables added by recent migrations whose absence would crash a request handler.
 * Extend this whenever a new migration adds a table referenced by request-time SELECTs.
 */
const READINESS_EXPECTED_TABLES = [
  "tracks",
  "albums",
  "artist_profiles",
  "short_urls",
  "album_short_urls",
  "artist_short_urls",
  "service_links",
  "track_previews",
  "album_previews",
  "track_external_ids",
  "album_external_ids",
  "artist_external_ids",
  "artist_images",
];

/**
 * Readiness check behind `GET /health/db`: confirms the database is
 * reachable and every hot-path table exists.
 *
 * @returns `{ ok: true }` when ready, else `{ ok: false, body }` carrying the 503 payload.
 */
async function checkReadiness(): Promise<{ ok: true } | { ok: false; body: Record<string, unknown> }> {
  try {
    const repo = await getRepository();
    const missing = await repo.findMissingTables(READINESS_EXPECTED_TABLES);
    if (missing.length > 0) {
      return { ok: false, body: { status: "not_ready", missingTables: missing } };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, body: { status: "not_ready", error: (err as Error).message } };
  }
}

async function buildApp() {
  const app = Fastify({
    // Silence log noise under vitest — integration tests stay quiet.
    logger: process.env.VITEST === "true" ? false : { level: process.env.NODE_ENV === "production" ? "info" : "debug" },
    trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
    ajv: {
      // AJV strict mode rejects the OpenAPI-native `example` annotation we
      // embed in request-body schemas for Swagger UI. Whitelist it so AJV
      // silently ignores it during validation. `examples` is already a
      // built-in AJV vocabulary keyword and must NOT be re-registered.
      customOptions: {
        keywords: ["example"],
      },
    },
  });

  // Security & utility plugins
  await app.register(cors, {
    origin: requireEnvList("CORS_ORIGIN"),
    // The developer portal (developer.musiccloud.io) authenticates with the
    // httpOnly `mc_dev_session` cookie and calls these routes cross-origin with
    // `credentials: "include"`. Without `Access-Control-Allow-Credentials: true`
    // the browser refuses to send or store that cookie. Safe here because
    // `origin` is an explicit allow-list (never the `*` wildcard, which the spec
    // forbids combining with credentials).
    credentials: true,
  });
  await app.register(helmet, {
    // Relaxed CSP so the Scalar API reference at /docs can load its
    // bundle from jsDelivr and render its own inline styles/fonts.
    // Normal API responses are JSON and unaffected.
    //
    // worker-src is set explicitly because ReDoc instantiates a Web
    // Worker via `new Worker(URL.createObjectURL(blob))` from inlined
    // bundle code. CSP3 has Workers fall back through child-src ->
    // script-src -> default-src when worker-src is absent. iOS Safari
    // falls back to default-src (only `'self'`), which blocks blob:
    // Worker URLs and renders ReDoc as "The operation is insecure" with
    // a `Worker@[native code]` stack trace; macOS Safari is more lenient
    // and falls back to script-src instead, masking the issue. Listing
    // worker-src explicitly fixes iOS without weakening other directives.
    contentSecurityPolicy: {
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
        "style-src": ["'self'", "'unsafe-inline'", "https:"],
        "img-src": ["'self'", "data:", "https:"],
        "font-src": ["'self'", "data:", "https:"],
        "connect-src": ["'self'", "https:"],
        "worker-src": ["'self'", "blob:"],
      },
    },
    // Only emit the HSTS header in production. In dev the backend speaks
    // HTTP on localhost:4000; Safari caches the HSTS response and then
    // upgrades every future request to https://, which fails with a TLS
    // error. Leaving it off in dev keeps /docs and /redoc reachable.
    strictTransportSecurity: process.env.NODE_ENV === "production",
  });
  await app.register(sensible);

  // Global rate limit. Generous enough not to trip normal admin traffic,
  // strict enough to close the CodeQL `js/missing-rate-limiting` alerts
  // on public POST routes. Individual routes can override via
  // `config.rateLimit` (e.g. telemetry-app-error at 60/min).
  //
  // Buckets by `request.ip`, which requires `trustProxy` to be set in
  // production (see `parseTrustProxy` above). Prior incident: without
  // trust-proxy every client behind the Zerops ingress shared one bucket
  // and the limit tripped for everyone after a few total requests.
  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
    allowList: (request) => {
      // Admin SSE streams are long-lived and polled heavily by the dashboard;
      // the event buses fan out to every connected client so a pure request
      // counter would throttle legitimate multi-tab admins.
      return request.url.startsWith("/api/admin/events");
    },
  });

  // JWT plugin (used by auth routes and public API auth)
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error("JWT_SECRET environment variable is required");
  }
  await app.register(jwt, { secret: jwtSecret });

  // Auth decorators (authenticateInternal, authenticatePublic, authenticateAdmin,
  // authenticateDeveloper)
  await app.register(authPlugin);

  // Cookie parsing, required by the developer-portal session
  // (`authenticateDeveloper` reads the `mc_dev_session` httpOnly cookie).
  // Registered after the auth plugin and before any route group so handlers
  // and guards can read/write cookies.
  await app.register(cookie);

  // Shared error response shape, registered via `addSchema` so that BOTH
  // the AJV validator AND the fast-json-stringify serializer can resolve
  // `{ $ref: "ErrorResponse#" }` in route schemas. `@fastify/swagger`
  // picks this up automatically and re-publishes it under
  // `components.schemas.ErrorResponse` in the generated OpenAPI doc.
  app.addSchema({
    $id: "ErrorResponse",
    type: "object",
    description: "Standard error envelope returned by every v1 endpoint on a non-2xx response.",
    required: ["error"],
    properties: {
      error: {
        type: "string",
        description: "Machine-readable canonical MC error code (e.g. MC-URL-0003, MC-API-0003, MC-RES-0001).",
      },
      message: { type: "string", description: "Human-readable error detail." },
      context: {
        type: "object",
        additionalProperties: { anyOf: [{ type: "string" }, { type: "number" }] },
        description:
          "Optional structured values for clients that localize errors themselves. For `MC-API-0003` rate-limit responses this currently contains `limit`, `windowSeconds`, and `retryAfterSeconds`.",
        properties: {
          limit: {
            type: "number",
            description: "Maximum number of allowed requests in the active rate-limit window. Current value: 10.",
          },
          windowSeconds: {
            type: "number",
            description: "Length of the active rate-limit window in seconds. Current value: 60.",
          },
          retryAfterSeconds: {
            type: "number",
            description: "Seconds until the client can retry after a `429 Too Many Requests` response.",
          },
        },
      },
    },
    example: {
      error: "MC-API-0003",
      message:
        "Too many requests. You can make 10 requests per 60 seconds. Please try again in 42 seconds. (MC-API-0003)",
      context: {
        limit: 10,
        retryAfterSeconds: 42,
        windowSeconds: 60,
      },
    },
  });

  // Reusable response schemas for the public v1 API (Track, PlatformLink,
  // ResolveSuccess, SharePage, ArtistInfo, etc.). Registering them here
  // means routes can `$ref` them and the generated OpenAPI document lists
  // them under `components.schemas` instead of inlining large duplicates.
  for (const schema of OPENAPI_SCHEMAS) {
    app.addSchema(schema);
  }

  // OpenAPI spec collector. MUST be registered before routes so it sees
  // their `schema` blocks as they are declared. The `transform` filters
  // admin routes out of the public documentation.
  await app.register(swagger, {
    openapi: {
      openapi: "3.0.3",
      info: {
        title: "musiccloud API",
        description:
          "Public REST API for musiccloud.io. Resolve music URLs or text queries across 20+ streaming services and retrieve unified metadata.\n\n" +
          "## Authentication\n\n" +
          "Most endpoints require credentials. Endpoints declaring a `security` block (e.g. `POST /api/v1/resolve`, `GET /api/v1/link/:id`) " +
          "accept either an `X-API-Key` header (issued to first-party clients) or a `Bearer` JWT. " +
          "Public read-only endpoints — `GET /api/v1/share/:shortId`, `GET /api/v1/share/:shortId/preview`, " +
          "`GET /api/v1/artist/...`, `GET /api/v1/genre-artwork/:genreKey`, `GET /health/db` — are reachable without credentials.\n\n" +
          "**Getting a token (first-time integration):**\n\n" +
          '1. `POST /api/auth/token` with `{ client_id, client_secret, grant_type: "client_credentials" }`.\n' +
          "2. The response contains `access_token`, valid for 1 hour.\n" +
          "3. Send subsequent requests with `Authorization: Bearer <access_token>`.\n" +
          "4. Refresh by re-issuing the token call when it expires; there is no refresh-token flow.\n\n" +
          "Without valid credentials, protected endpoints return `401 Unauthorized` and the client never reaches the resolver.\n\n" +
          "## Rate limiting\n\n" +
          "All public endpoints (Resolve, Share, Auth, Link, Artist) are limited to **10 requests per 60 seconds per client IP**. " +
          "Exceeding the quota returns `429 Too Many Requests` with `error: MC-API-0003`, an English `message`, structured `context`, and a `Retry-After` header. " +
          "The asset endpoint `GET /api/v1/genre-artwork/:genreKey` is exempt from this per-IP quota because the frontend loads artwork tiles in parallel; " +
          "it is still bounded by a global 300 requests/minute ceiling shared with all routes.",
        version: "2.0.0",
      },
      servers: [{ url: "https://api.musiccloud.io", description: "Production" }],
      // Tag order here does not need to be alphabetical: the document is
      // sorted in finalizePublicOpenApiDocument before it is served, so groups
      // always render alphabetically regardless of this list's order.
      tags: [
        { name: "Resolve", description: "Resolve music URLs or text queries" },
        { name: "Share", description: "Fetch previously-resolved shares" },
        { name: "Links", description: "Link metadata" },
        { name: "Artist", description: "Artist info (Last.fm + Ticketmaster)" },
        { name: "CC", description: "Creative-Commons (Jamendo) resolve, audio, and metadata" },
        { name: "Services", description: "Active resolver plugins and examples" },
        { name: "Auth", description: "OAuth client-credentials token endpoint" },
        { name: "Health", description: "Per-service liveness and readiness probes" },
      ],
      components: {
        securitySchemes: {
          ApiKeyAuth: { type: "apiKey", in: "header", name: "X-API-Key" },
          BearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        },
      },
    },
    // Use the schema's `$id` as the component key, so `ErrorResponse`
    // shows up as `#/components/schemas/ErrorResponse` in the doc.
    refResolver: {
      buildLocalReference: (json, _baseUri, _fragment, i) => (typeof json.$id === "string" ? json.$id : `def-${i}`),
    },
    transform: ({ schema, url }) => {
      // Hide admin endpoints, the developer-portal account API, and internal
      // helpers (SSR-only routes, frontend-marquee data, Apple Testflight
      // ingest, landing-page teaser). The public API reference covers Health,
      // Resolve, Share, Auth, Link, Artist, and Genre-Artwork — everything
      // else is reachable but not advertised to external consumers.
      //
      // `/api/dev/*` is the developer.musiccloud.io account system (signup,
      // login, password reset, GitHub OAuth). It is a separate first-party
      // surface, not part of the public REST contract, so it must never
      // appear in the published OpenAPI document.
      const isInternal =
        url.startsWith("/api/admin") ||
        url.startsWith("/api/dev") ||
        url.startsWith("/api/v1/content") ||
        url.startsWith("/api/v1/nav") ||
        url.startsWith("/api/v1/site-settings") ||
        url.startsWith("/api/v1/services") ||
        url.startsWith("/api/v1/random") ||
        url.startsWith("/api/v1/telemetry");
      if (isInternal) {
        return { schema: { ...schema, hide: true }, url };
      }
      return { schema, url };
    },
  });

  // Expose the OpenAPI document so Scalar (and external consumers) can load
  // it. Uses `app.swagger()` per-request so the spec always reflects the full
  // route table after every plugin has registered, then finalizes it: orphan
  // schemas from hidden routes are pruned and tags/paths/schemas are sorted
  // alphabetically (see docs/openapi-finalize.ts).
  app.get(
    "/docs/json",
    {
      schema: { hide: true },
    },
    async () => finalizePublicOpenApiDocument(app.swagger()),
  );

  // Scalar API Reference UI at /docs. We render the same CDN-backed HTML
  // shell shape used by lmaa instead of registering a Fastify UI plugin:
  // the backend is bundled into apps/backend/dist, so runtime file lookups
  // inside UI plugins are fragile in the Zerops deploy artifact.
  app.get(
    "/docs",
    {
      schema: { hide: true },
    },
    async (_request, reply) => {
      reply.header("Cache-Control", "no-store");
      reply.header("Content-Security-Policy", SCALAR_API_REFERENCE_CONTENT_SECURITY_POLICY);
      reply.type("text/html").send(getScalarApiReferenceHtml());
    },
  );

  app.get(
    "/fonts/fonts.css",
    {
      schema: { hide: true },
    },
    async (_request, reply) => {
      reply.header("Cache-Control", "public, max-age=31536000, immutable");
      reply.type("text/css; charset=utf-8").send(getScalarReferenceFontCss());
    },
  );

  app.get<{ Params: { file: string } }>(
    "/fonts/:file",
    {
      schema: { hide: true },
    },
    async (request, reply) => {
      const contentType = SCALAR_REFERENCE_FONT_FILES.get(request.params.file);
      if (!contentType) {
        return reply.status(404).send({ error: "NOT_FOUND" });
      }

      try {
        const font = await readDocsFont(request.params.file);
        reply.header("Cache-Control", "public, max-age=31536000, immutable");
        return reply.type(contentType).send(font);
      } catch {
        return reply.status(404).send({ error: "NOT_FOUND" });
      }
    },
  );

  // Email subsystem readiness (no auth) — confirms the SMTP2GO transport is
  // configured and the provider host is reachable. Sends no mail and uses no
  // send quota, so it is safe on a per-minute monitoring cadence. Powers the
  // "Email" service on the public status page.
  app.get(
    "/health/email",
    {
      schema: {
        tags: ["Health"],
        summary: "Email subsystem readiness",
        description: "Returns 200 when the email provider is configured and reachable, else 503.",
      },
    },
    async (_request, reply) => {
      if (await isEmailProviderHealthy()) {
        return { status: "ok" };
      }
      return reply.status(503).send({ status: "unavailable" });
    },
  );

  // Developer-portal liveness (no auth). The status-page monitor (IPv4-only
  // GitHub Actions) cannot reach the IPv6-only developer.musiccloud.io, so it
  // probes it THROUGH the backend, which shares the dual-stack Zerops network.
  // Powers the "Developer Site" service on the public status page.
  app.get(
    "/health/developer",
    {
      schema: {
        tags: ["Health"],
        summary: "Developer portal liveness",
        description:
          "Returns 200 when the developer portal (developer.musiccloud.io) is reachable from the backend, else 503.",
      },
    },
    async (_request, reply) => {
      const url = process.env.DEVELOPER_URL;
      if (url && (await isUpstreamReachable(url))) {
        return { status: "ok" };
      }
      return reply.status(503).send({ status: "unavailable" });
    },
  );

  // Dashboard liveness (no auth). Same backend-proxy rationale as
  // /health/developer above — reaches the IPv6-only dashboard.musiccloud.io on
  // the monitor's behalf. Powers the "Dashboard" service on the status page.
  app.get(
    "/health/dashboard",
    {
      schema: {
        tags: ["Health"],
        summary: "Dashboard liveness",
        description:
          "Returns 200 when the admin dashboard (dashboard.musiccloud.io) is reachable from the backend, else 503.",
      },
    },
    async (_request, reply) => {
      const url = process.env.DASHBOARD_URL;
      if (url && (await isUpstreamReachable(url))) {
        return { status: "ok" };
      }
      return reply.status(503).send({ status: "unavailable" });
    },
  );

  // Frontend liveness (no auth). Probes the public site (PUBLIC_URL) from the
  // backend, completing the consistent api.musiccloud.io/health/<service> set the
  // status page monitors. Powers the "Frontend" service.
  app.get(
    "/health/frontend",
    {
      schema: {
        tags: ["Health"],
        summary: "Frontend liveness",
        description: "Returns 200 when the public site (musiccloud.io) is reachable from the backend, else 503.",
      },
    },
    async (_request, reply) => {
      const url = process.env.PUBLIC_URL;
      if (url && (await isUpstreamReachable(url))) {
        return { status: "ok" };
      }
      return reply.status(503).send({ status: "unavailable" });
    },
  );

  // Backend liveness (no auth). Returns 200 whenever the Fastify process is
  // alive and serving requests, under the consistent /health/<service> naming
  // the status page uses. Powers "Backend".
  app.get(
    "/health/backend",
    {
      schema: {
        tags: ["Health"],
        summary: "Backend liveness",
        description: "Returns 200 if the backend process is alive and serving requests.",
      },
    },
    async () => {
      return { status: "ok" };
    },
  );

  // Database readiness (no auth). Verifies the DB is reachable AND that every
  // table touched by the hot-path SELECTs exists. Catches the partially-migrated
  // state where a deploy ships code that queries tables a failed migration never
  // created (Apr 2026 outage: track_previews missing → all share URLs returned
  // 500). Returns 503 with the missing-table list so Zerops (this is the
  // container healthCheck in zerops.yml) and external monitoring can mark the
  // container un-ready. Powers the "Database" service on the status page.
  app.get(
    "/health/db",
    {
      schema: {
        tags: ["Health"],
        summary: "Database readiness",
        description: "Returns 200 when the database is reachable and the schema is complete, else 503.",
      },
    },
    async (_request, reply) => {
      const result = await checkReadiness();
      if (result.ok) return { status: "ok" };
      return reply.status(503).send(result.body);
    },
  );

  // Auth routes (no auth required)
  await app.register(authRoutes);

  // Admin auth routes (no auth required - login, setup, setup-status)
  await app.register(adminAuthRoutes);

  // Developer-portal auth routes (no auth required - signup, login, verify,
  // reset, logout; `/me` guards itself via authenticateDeveloper). The session
  // is the `mc_dev_session` cookie, parsed by the @fastify/cookie plugin
  // registered above.
  await app.register(devAuthRoutes);

  // Developer-portal GitHub OAuth routes (MC-065, public, root scope). `start`
  // mints the signed-state authorize URL; `exchange` trades the callback code
  // and issues the same `mc_dev_session` cookie as email login.
  await app.register(devGitHubRoutes);

  // Developer-portal self-service API-access routes (MC-025/MC-077):
  // submit a request, list the caller's own requests/clients, and
  // manage the caller's own tokens. Guarded by authenticateDeveloper as
  // this scope's preHandler, mirroring adminRoutes/protectedRoutes below.
  await app.register(async function devProtectedRoutes(devApp) {
    devApp.addHook("preHandler", devApp.authenticateDeveloper);
    await devApp.register(devApiAccessRoutes);
  });

  // Share endpoint (public, no auth - used for SSR)
  await app.register(shareRoutes);
  await app.register(sharePreviewRoutes);

  // CC audio proxy (public, no auth - the audio player streams CC tracks through it)
  await app.register(ccAudioRoutes);
  // CC download proxy (public, no auth - re-serves the audio as a named attachment)
  await app.register(ccDownloadRoutes);

  // Artist info endpoint (public, no auth - fetched by React island)
  await app.register(artistInfoRoutes);
  // CC artist column (public, no auth - the CC share page loads it async)
  await app.register(ccArtistInfoRoutes);
  // CC Bandcamp presence (public, no auth - the CC share page loads it async)
  await app.register(ccBandcampRoutes);
  await app.register(randomExampleRoutes);
  await app.register(ccRandomExampleRoutes);

  // Genre artwork endpoint (public, no auth - referenced from browse grid tiles)
  await app.register(genreArtworkRoutes);

  // Email asset serve endpoint (public, no auth - sent-email <img> tags are
  // fetched by the recipient's mail client, which has no admin JWT to
  // present; the matching admin-guarded UPLOAD route is registered
  // separately below, inside adminRoutes). See routes/email-assets.ts's file
  // header for the full rationale.
  await app.register(emailAssetServeRoutes);

  // CC genre artwork endpoint (public, no auth - referenced from CC browse grid
  // tiles). Same per-IP rate-limit exemption as the commercial route above: it
  // never calls `apiRateLimiter`, only the global 300/min ceiling applies.
  await app.register(ccGenreArtworkRoutes);

  // Site settings (public read for SSR)
  await app.register(siteSettingsPublicRoutes);

  // Active-services list (public read for SSR — marquee, resolve pages)
  await app.register(servicesPublicRoutes);

  // Public navigation + content pages (no auth - SSR'd by Astro frontend)
  await app.register(publicContentNavRoutes);

  // Public GET resolve endpoint (no auth - used for Shortcuts, etc.)
  await app.register(resolvePublicGetRoutes);

  // Apple-client telemetry ingest (public, no auth, Testflight-only caller)
  await app.register(telemetryAppErrorRoutes);

  // Protected API routes (X-API-Key or Bearer JWT)
  await app.register(async function protectedRoutes(protectedApp) {
    protectedApp.addHook("preHandler", protectedApp.authenticatePublic);

    await protectedApp.register(resolveRoutes);
    await protectedApp.register(ccResolveRoutes);
    await protectedApp.register(linkRoutes);
  });

  // Admin-protected API routes (Bearer JWT with role: "admin")
  await app.register(async function adminRoutes(adminApp) {
    adminApp.addHook("preHandler", adminApp.authenticateAdmin);
    await adminApp.register(adminAnalyticsRoutes);
    await adminApp.register(adminApiAccessRoutes);
    await adminApp.register(adminContentRoutes);
    await adminApp.register(adminDataRoutes);
    await adminApp.register(adminEmailActionsRoutes);
    await adminApp.register(adminEmailAssetsRoutes);
    await adminApp.register(adminEmailBrandingRoutes);
    await adminApp.register(adminEmailTemplateRoutes);
    await adminApp.register(adminNavRoutes);
    await adminApp.register(adminSseRoutes);
    await adminApp.register(adminUserRoutes);
    await adminApp.register(siteSettingsAdminRoutes);
    await adminApp.register(adminPluginsRoutes);
    await adminApp.register(adminCrawlerRoutes);
  });

  return app;
}

async function readDocsFont(file: string): Promise<Buffer> {
  const candidates = [path.join(__dirname, "fonts", file), path.join(__dirname, "..", "assets", "fonts", file)];

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return await readFile(candidate);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

async function start() {
  const app = await buildApp();

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  for (const signal of signals) {
    process.on(signal, async () => {
      app.log.info(`Received ${signal}, shutting down gracefully...`);
      await app.close();
      process.exit(0);
    });
  }

  try {
    // Crash the boot before opening the port if a boot-critical env var is
    // missing (see assertRequiredBootEnv) — a misconfigured CC path then shows
    // as a loud restart loop instead of a silent request-time MC-API-0004.
    assertRequiredBootEnv();
    await runMigrations();
    await app.listen({ host: HOST, port: PORT });
    app.log.info(`Backend listening on ${HOST}:${PORT}`);
    validateAdapters();
    // Pre-warm Apple Music developer token (avoids first-request latency)
    warmAppleMusicToken();
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Only auto-start when invoked as the entry point (`node dist/server.js` /
// `tsup --onSuccess`). Skip when imported by tests or other modules so
// buildApp can be unit-tested without spawning a real listener.
if (process.env.VITEST !== "true") {
  start();
}

export { buildApp };
