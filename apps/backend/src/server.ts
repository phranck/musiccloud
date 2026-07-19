import { randomUUID } from "node:crypto";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import swagger from "@fastify/swagger";
import { ENDPOINTS, ROUTE_TEMPLATES } from "@musiccloud/shared";
import Fastify, { type FastifyLoggerOptions } from "fastify";
import { runMigrations } from "./db/run-migrations.js";
import {
  closeRuntimeDatabaseReadinessPool,
  getRuntimeDatabaseReadinessReport,
} from "./db/runtime-database-readiness.js";
import { finalizePublicOpenApiDocument } from "./docs/openapi-finalize.js";
import {
  createPublicErrorResponseSchema,
  publicHealthSuccessResponse,
  publicHealthUnavailableResponse,
} from "./docs/public-response-schema.js";
import { assertRequiredBootEnv } from "./lib/boot-env.js";
import { requireEnvList } from "./lib/env.js";
import { registerApiErrorHandling, setApiFailureDiagnostic } from "./lib/infra/api-error-handler.js";
import { createApiErrorResponse, sanitizeErrorForLog } from "./lib/infra/api-errors.js";
import authPlugin from "./plugins/auth.js";
import { adminApiAccessRoutes } from "./routes/admin-api-access.js";
import adminAuthRoutes from "./routes/admin-auth.js";
import adminContentRoutes from "./routes/admin-content.js";
import adminCrawlerRoutes from "./routes/admin-crawler.js";
import adminDataRoutes from "./routes/admin-data.js";
import adminEmailActionsRoutes from "./routes/admin-email-actions.js";
import adminEmailAssetsRoutes from "./routes/admin-email-assets.js";
import adminEmailBrandingRoutes from "./routes/admin-email-branding.js";
import adminEmailTemplateRoutes from "./routes/admin-email-templates.js";
import adminGdprRoutes from "./routes/admin-gdpr.js";
import adminNavRoutes from "./routes/admin-nav.js";
import adminPluginsRoutes from "./routes/admin-plugins.js";
import adminSseRoutes from "./routes/admin-sse.js";
import { adminTiersRoutes } from "./routes/admin-tiers.js";
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
import {
  developerPortalAvailabilityAdminRoutes,
  developerPortalAvailabilityInternalRoutes,
} from "./routes/developer-portal-availability.js";
import emailAssetServeRoutes from "./routes/email-assets.js";
import genreArtworkRoutes from "./routes/genre-artwork.js";
import { internalEditorialRoutes } from "./routes/internal-editorial.js";
import linkRoutes from "./routes/link.js";
import publicContentNavRoutes from "./routes/public-content-nav.js";
import publicTiersRoutes from "./routes/public-tiers.js";
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

/**
 * Exact route set exported as the external REST contract. Runtime routes not
 * listed here remain callable for first-party applications and monitoring but
 * are hidden from `/docs/json` by default.
 */
const PUBLIC_OPENAPI_PATHS = new Set<string>([
  ENDPOINTS.v1.artistInfo,
  ENDPOINTS.v1.ccArtistInfo,
  ROUTE_TEMPLATES.v1.ccAudio,
  ROUTE_TEMPLATES.v1.ccBandcamp,
  ROUTE_TEMPLATES.v1.ccDownload,
  ROUTE_TEMPLATES.v1.ccGenreArtwork,
  ENDPOINTS.v1.ccResolve,
  ROUTE_TEMPLATES.v1.genreArtwork,
  ROUTE_TEMPLATES.v1.link,
  ENDPOINTS.v1.resolve,
  ROUTE_TEMPLATES.v1.share,
  ROUTE_TEMPLATES.v1.sharePreview,
]);

/**
 * Detects direct execution of the CommonJS bundle emitted by tsup.
 *
 * The Backend intentionally ships as CommonJS, where `import.meta.url` is
 * empty after bundling. Comparing Node's current module to `require.main`
 * starts `node dist/server.js` reliably while imports from tests, OpenAPI
 * export scripts, and other modules remain side-effect free.
 * Do not replace this check with `import.meta.url` unless the tsup output and
 * its direct-execution regression are migrated to ESM together.
 *
 * @param currentModule - the current CommonJS module
 * @param mainModule - Node's direct entry module, when one exists
 * @returns whether the current module is the direct process entrypoint
 */
export function isDirectCommonJsEntrypoint(currentModule: NodeModule, mainModule: NodeModule | undefined): boolean {
  return currentModule === mainModule;
}

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

interface BuildAppOptions {
  databaseReadiness?: typeof getRuntimeDatabaseReadinessReport;
  logger?: false | FastifyLoggerOptions;
}

async function buildApp(options: BuildAppOptions = {}) {
  const databaseReadiness = options.databaseReadiness ?? getRuntimeDatabaseReadinessReport;
  const app = Fastify({
    // Silence log noise under vitest — integration tests stay quiet.
    logger:
      options.logger ??
      (process.env.VITEST === "true" ? false : { level: process.env.NODE_ENV === "production" ? "info" : "debug" }),
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
  registerApiErrorHandling(app);

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
  app.addSchema(createPublicErrorResponseSchema());

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
          "Public REST API for resolving music URLs and search queries, retrieving persisted shares, and consuming Creative-Commons media and metadata.\n\n" +
          "## Authentication\n\n" +
          "Exactly three operations require a key issued to a client registration: `POST /api/v1/resolve`, `POST /api/v1/cc/resolve`, and `GET /api/v1/link/{id}`. A Developer Project owns its subscription and shared quota and may contain separate development, confidential, and public registrations. Send a registration key as `X-API-Key: mc_live_<prefix>_<secret>`. All other operations in this reference are callable without a key. Manage projects and registrations at https://developer.musiccloud.io/dashboard/api-access, then create or rotate registration keys at https://developer.musiccloud.io/dashboard/api-keys. A key is shown only when created or rotated. Store it as a secret and never embed it in browser code. Missing, invalid, suspended, or revoked project, registration, or key credentials receive `401`.\n\n" +
          "## Rate limiting\n\n" +
          "Three independent rules can apply:\n\n" +
          "1. The three API-key operations use the rolling `60`-second and rolling `24`-hour quotas owned by the Developer Project. Registrations under one project share those quotas; an optional registration cap can only narrow them.\n" +
          "2. Public data operations `GET /api/v1/resolve`, `GET /api/v1/share/{shortId}`, `GET /api/v1/share/{shortId}/preview`, `GET /api/v1/artist-info`, `GET /api/v1/cc/artist-info`, `GET /api/v1/cc/audio/{jamendoId}`, `GET /api/v1/cc/download/{jamendoId}`, and `GET /api/v1/cc/bandcamp/{jamendoId}` allow `10` requests in a rolling `60`-second window per client IP.\n" +
          "3. Every route is also protected by a global ceiling of `300` requests in a rolling `60`-second window per client IP.\n\n" +
          "A rejected request returns `429 Too Many Requests`, the `ErrorResponse` JSON body, and `Retry-After`. When available, `context.limit`, `context.windowSeconds`, and `context.retryAfterSeconds` describe the rule that rejected the request.",
        version: "2.1.8",
      },
      servers: [{ url: "https://api.musiccloud.io", description: "Production" }],
      // Tag order here does not need to be alphabetical: the document is
      // sorted in finalizePublicOpenApiDocument before it is served, so groups
      // always render alphabetically regardless of this list's order.
      tags: [
        { name: "Artwork", description: "Generated JPEG artwork for commercial and Creative-Commons genres" },
        { name: "Resolve", description: "Resolve music URLs or text queries" },
        { name: "Share", description: "Fetch previously-resolved shares" },
        { name: "Links", description: "Link metadata" },
        { name: "Artist", description: "Commercial and Creative-Commons artist metadata" },
        { name: "CC", description: "Creative-Commons (Jamendo) resolve, audio, and metadata" },
      ],
      components: {
        securitySchemes: {
          ApiKeyAuth: {
            type: "apiKey",
            in: "header",
            name: "X-API-Key",
            description:
              "Registration credential for a Developer Project. Project quotas are shared by all registrations; registration caps may only narrow them.",
          },
        },
      },
    },
    // Use the schema's `$id` as the component key, so `ErrorResponse`
    // shows up as `#/components/schemas/ErrorResponse` in the doc.
    refResolver: {
      buildLocalReference: (json, _baseUri, _fragment, i) => (typeof json.$id === "string" ? json.$id : `def-${i}`),
    },
    transform: ({ schema, url }) => {
      if (!PUBLIC_OPENAPI_PATHS.has(url)) {
        return { schema: { ...schema, hide: true }, url };
      }
      return { schema, url };
    },
  });

  // Expose the finalized public OpenAPI document for machines and the
  // Developer Portal build. Uses `app.swagger()` per-request so the spec
  // always reflects the full route table after every plugin has registered.
  app.get(
    "/docs/json",
    {
      schema: { hide: true },
    },
    async (_request, reply) => {
      reply.header("Cache-Control", "public, max-age=300");
      return finalizePublicOpenApiDocument(app.swagger());
    },
  );

  app.get(
    "/docs",
    {
      schema: { hide: true },
    },
    async (_request, reply) => {
      return reply.redirect("https://developer.musiccloud.io/docs/api", 308);
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
        description: "Returns `200` when the email delivery subsystem is ready, otherwise `503`.",
        response: {
          200: publicHealthSuccessResponse("The email delivery subsystem is ready."),
          503: publicHealthUnavailableResponse("The email delivery subsystem is not ready."),
        },
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
          "Returns `200` when `https://developer.musiccloud.io` answers the probe without a server error before the timeout; otherwise returns `503`.",
        response: {
          200: publicHealthSuccessResponse(
            "`https://developer.musiccloud.io` answered the probe with an HTTP status below `500`.",
          ),
          503: publicHealthUnavailableResponse(
            "`https://developer.musiccloud.io` did not answer successfully before the probe timeout.",
          ),
        },
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
          "Returns `200` when `https://dashboard.musiccloud.io` answers the probe without a server error before the timeout; otherwise returns `503`.",
        response: {
          200: publicHealthSuccessResponse(
            "`https://dashboard.musiccloud.io` answered the probe with an HTTP status below `500`.",
          ),
          503: publicHealthUnavailableResponse(
            "`https://dashboard.musiccloud.io` did not answer successfully before the probe timeout.",
          ),
        },
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
        description:
          "Returns `200` when `https://musiccloud.io` answers the probe without a server error before the timeout; otherwise returns `503`.",
        response: {
          200: publicHealthSuccessResponse(
            "`https://musiccloud.io` answered the probe with an HTTP status below `500`.",
          ),
          503: publicHealthUnavailableResponse(
            "`https://musiccloud.io` did not answer successfully before the probe timeout.",
          ),
        },
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
        description: 'Returns `200` with `{ "status": "ok" }` when the API process is accepting HTTP requests.',
        response: {
          200: publicHealthSuccessResponse("The backend process is alive and serving requests."),
        },
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
  // container un-ready. The response remains a safe public error envelope;
  // operators retrieve the detailed checks from the correlated `errorId` log.
  // Powers the "Database" service on the status page.
  app.get(
    "/health/db",
    {
      schema: {
        tags: ["Health"],
        summary: "Database readiness",
        description:
          "Returns `200` only when the database is reachable, all required tables and migration hashes exist, the runtime role has its required CRUD privileges, and table ownership matches the expected application role. Returns a safe `503` error envelope otherwise; operators can correlate its `errorId` with the detailed backend diagnostic.",
        response: {
          200: publicHealthSuccessResponse("The database is reachable, migrated, and ready for the runtime role."),
          503: publicHealthUnavailableResponse(
            "The database readiness contract is not satisfied. The response exposes only the stable error envelope and correlation ID.",
          ),
        },
      },
    },
    async (request, reply) => {
      const errorId = randomUUID();
      try {
        const report = await databaseReadiness();
        if (report.ok) return { status: "ok" };

        setApiFailureDiagnostic(request, {
          operation: "database_readiness",
          outcome: "not_ready",
          report,
        });
      } catch (error) {
        setApiFailureDiagnostic(request, {
          cause: sanitizeErrorForLog(error, process.env.NODE_ENV !== "production"),
          operation: "database_readiness",
          outcome: "check_failed",
        });
      }

      return reply.status(503).send(
        createApiErrorResponse("MC-API-0001", {
          errorId,
          overrideMessage: "Database readiness could not be confirmed. Please try again later.",
        }),
      );
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

  // Internal service-to-service routes. The Developer Portal uses this
  // narrow endpoint to read its availability state without direct DB access.
  await app.register(async function internalRoutes(internalApp) {
    internalApp.addHook("preHandler", internalApp.authenticateInternal);
    await internalApp.register(developerPortalAvailabilityInternalRoutes);
    await internalApp.register(internalEditorialRoutes);
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
  await app.register(publicTiersRoutes);

  // Public navigation + content pages (no auth - SSR'd by Astro frontend)
  await app.register(publicContentNavRoutes);

  // Public GET resolve endpoint (no auth - used for Shortcuts, etc.)
  await app.register(resolvePublicGetRoutes);

  // Apple-client telemetry ingest (public, no auth, Testflight-only caller)
  await app.register(telemetryAppErrorRoutes);

  // Protected API routes (X-API-Key)
  await app.register(async function protectedRoutes(protectedApp) {
    protectedApp.addHook("preHandler", protectedApp.authenticatePublic);

    await protectedApp.register(resolveRoutes);
    await protectedApp.register(ccResolveRoutes);
    await protectedApp.register(linkRoutes);
  });

  // Admin-protected API routes (Bearer JWT with role: "admin")
  await app.register(async function adminRoutes(adminApp) {
    adminApp.addHook("preHandler", adminApp.authenticateAdmin);
    await adminApp.register(adminApiAccessRoutes);
    await adminApp.register(adminTiersRoutes);
    await adminApp.register(adminContentRoutes);
    await adminApp.register(adminDataRoutes);
    await adminApp.register(adminEmailActionsRoutes);
    await adminApp.register(adminGdprRoutes);
    await adminApp.register(adminEmailAssetsRoutes);
    await adminApp.register(adminEmailBrandingRoutes);
    await adminApp.register(adminEmailTemplateRoutes);
    await adminApp.register(adminNavRoutes);
    await adminApp.register(adminSseRoutes);
    await adminApp.register(adminUserRoutes);
    await adminApp.register(siteSettingsAdminRoutes);
    await adminApp.register(adminPluginsRoutes);
    await adminApp.register(adminCrawlerRoutes);
    await adminApp.register(developerPortalAvailabilityAdminRoutes);
  });

  return app;
}

async function start() {
  const app = await buildApp();

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  for (const signal of signals) {
    process.on(signal, async () => {
      app.log.info(`Received ${signal}, shutting down gracefully...`);
      await closeRuntimeDatabaseReadinessPool();
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

// Only auto-start when invoked as `node dist/server.js`. Skip imported test,
// export, and helper modules so `buildApp` never creates an implicit listener.
if (
  typeof require !== "undefined" &&
  typeof module !== "undefined" &&
  isDirectCommonJsEntrypoint(module, require.main)
) {
  void start();
}

export { buildApp };
