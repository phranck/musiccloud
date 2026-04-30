import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import swagger from "@fastify/swagger";
import Fastify from "fastify";
import { getRepository } from "./db/index.js";
import { runMigrations } from "./db/run-migrations.js";
import authPlugin from "./plugins/auth.js";
import adminAnalyticsRoutes from "./routes/admin-analytics.js";
import adminAuthRoutes from "./routes/admin-auth.js";
import adminContentRoutes from "./routes/admin-content.js";
import adminCrawlerRoutes from "./routes/admin-crawler.js";
import adminDataRoutes from "./routes/admin-data.js";
import adminEmailTemplateRoutes from "./routes/admin-email-templates.js";
import adminNavRoutes from "./routes/admin-nav.js";
import adminPluginsRoutes from "./routes/admin-plugins.js";
import adminSseRoutes from "./routes/admin-sse.js";
import adminUserRoutes from "./routes/admin-users.js";
import artistInfoRoutes from "./routes/artist-info.js";
import authRoutes from "./routes/auth.js";
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
    origin: process.env.CORS_ORIGIN?.split(",") ?? ["http://localhost:3000", "http://localhost:4321"],
  });
  await app.register(helmet, {
    // Relaxed CSP so the Scalar API reference at /docs can load its
    // bundle from jsDelivr and render its own inline styles/fonts.
    // Normal API responses are JSON and unaffected.
    contentSecurityPolicy: {
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
        "style-src": ["'self'", "'unsafe-inline'", "https:"],
        "img-src": ["'self'", "data:", "https:"],
        "font-src": ["'self'", "data:", "https:"],
        "connect-src": ["'self'", "https:"],
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
      // Admin SSE stream is long-lived and polled heavily by the dashboard;
      // the event bus itself fans out to every connected client so a pure
      // request counter would throttle legitimate multi-tab admins.
      return request.url.startsWith("/api/admin/events");
    },
  });

  // JWT plugin (used by auth routes and public API auth)
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error("JWT_SECRET environment variable is required");
  }
  await app.register(jwt, { secret: jwtSecret });

  // Auth decorators (authenticateInternal, authenticatePublic)
  await app.register(authPlugin);

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
        description: "Machine-readable error code (e.g. INVALID_URL, RATE_LIMITED, SERVICE_DOWN).",
      },
      message: { type: "string", description: "Human-readable error detail." },
    },
    example: {
      error: "NOT_FOUND",
      message: "Short ID not found. (MC-RES-0001)",
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
          "`GET /api/v1/artist/...`, `GET /api/v1/genre-artwork/:genreKey`, `GET /health/ready` — are reachable without credentials.\n\n" +
          "**Getting a token (first-time integration):**\n\n" +
          '1. `POST /api/auth/token` with `{ client_id, client_secret, grant_type: "client_credentials" }`.\n' +
          "2. The response contains `access_token`, valid for 1 hour.\n" +
          "3. Send subsequent requests with `Authorization: Bearer <access_token>`.\n" +
          "4. Refresh by re-issuing the token call when it expires; there is no refresh-token flow.\n\n" +
          "Without valid credentials, protected endpoints return `401 Unauthorized` and the client never reaches the resolver.\n\n" +
          "## Rate limiting\n\n" +
          "All public endpoints (Resolve, Share, Auth, Link, Artist) are limited to **10 requests per minute per client IP**. " +
          "Exceeding the quota returns `429 Too Many Requests` with `error: RATE_LIMITED`. " +
          "The asset endpoint `GET /api/v1/genre-artwork/:genreKey` is exempt from this per-IP quota because the frontend loads artwork tiles in parallel; " +
          "it is still bounded by a global 300 requests/minute ceiling shared with all routes.",
        version: "1.0.0",
      },
      servers: [{ url: "https://api.musiccloud.io", description: "Production" }],
      tags: [
        { name: "Resolve", description: "Resolve music URLs or text queries" },
        { name: "Share", description: "Fetch previously-resolved shares" },
        { name: "Links", description: "Link metadata" },
        { name: "Artist", description: "Artist info (Last.fm + Ticketmaster)" },
        { name: "Services", description: "Active resolver plugins and examples" },
        { name: "Auth", description: "OAuth client-credentials token endpoint" },
        { name: "Health", description: "Server health" },
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
      // Hide admin endpoints + internal helpers (SSR-only routes, frontend-
      // marquee data, Apple Testflight ingest, landing-page teaser). The
      // public API reference covers Health, Resolve, Share, Auth, Link,
      // Artist, and Genre-Artwork — everything else is reachable but not
      // advertised to external consumers.
      const isInternal =
        url.startsWith("/api/admin") ||
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

  // Expose the raw OpenAPI document so Redoc (and external consumers)
  // can load it. Uses `app.swagger()` per-request so the spec always
  // reflects the full route table after every plugin has registered.
  app.get(
    "/docs/json",
    {
      schema: { hide: true },
    },
    async () => app.swagger(),
  );

  // Redoc API reference UI at /docs. A tiny HTML shell that pulls the
  // Redoc standalone bundle from jsDelivr and points it at /docs/json.
  // We avoid the Fastify plugins @fastify/swagger-ui and
  // @scalar/fastify-api-reference because both resolve their client
  // assets via `path.join(__dirname, ...)` / `fileURLToPath` at runtime,
  // which breaks when tsup inlines them into dist/server.js — and
  // externalising them would require node_modules in the Zerops deploy
  // (currently only apps/backend/dist ships).
  app.get(
    "/docs",
    {
      schema: { hide: true },
    },
    async (_request, reply) => {
      reply.type("text/html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>musiccloud API Reference</title>
    <link rel="icon" href="data:," />
    <link
      href="https://fonts.googleapis.com/css2?family=Barlow:wght@300;400;500;600;700&family=Roboto+Condensed:wght@400;500;700&display=swap"
      rel="stylesheet"
    />
    <style>
      body { margin: 0; padding: 0; }
      /* Keep the sidebar at its former size after we shrank the body
         font for the middle column. Redoc inherits the body size into
         menu items; override to preserve left-nav readability. */
      .menu-content {
        font-size: 18px !important;
      }
      /* Tighten the vertical rhythm of sidebar menu items. Redoc's
         theme has no direct knob for this, so we target the rendered
         <label> elements inside the left-nav tree. */
      .menu-content li > label,
      .menu-content li > a {
        padding-top: 4px !important;
        padding-bottom: 4px !important;
        line-height: 1.25em !important;
      }
      /* Shrink the operation-summary text that sits beside the HTTP
         method badge in the sidebar. Same caveat as the .lbpUdJ rule
         above: styled-components class, build-volatile but stable
         within a bundle. If a Redoc upgrade breaks this, inspect
         the wrapper around "Resolve a music URL ..." entries and
         update the selector. */
      .sc-kYxDKI .sc-kYxDKI {
        font-size: 0.8em !important;
      }
      /* theme.typography.code.lineHeight does not always propagate to
         the right-panel code samples and JSON response blocks. Request
         samples render as <pre>; response examples render as Redoc's
         interactive JSON tree (.redoc-json). Target both. */
      pre, pre code, pre code *,
      .redoc-json, .redoc-json *, code {
        line-height: 1.15em !important;
      }
      /* Language picker + response-status tabs in the right panel.
         Redoc renders them as react-tabs elements; shrink font + pad
         so they sit closer together and don't wrap as aggressively. */
      [role="tab"], .react-tabs__tab, .tab-list__tab {
        font-family: 'Roboto Condensed', system-ui, sans-serif !important;
        font-size: 13px !important;
        padding: 0 8px !important;
        margin: 0 3px 4px 0 !important;
      }
      /* Shrink horizontal padding of the dark right-column code
         samples panel (Request/Response samples). Redoc renders this
         with styled-components, so the class name is build-volatile
         but stable within a given Redoc bundle. If a Redoc upgrade
         breaks this, inspect the div that wraps "Request samples" /
         "Response samples" and update the selector. */
      .lbpUdJ {
        padding: 0 15px !important;
      }
      /* Flush-left the tab rows (language picker, response codes) so
         they align with the code-box below them. */
      .lbpUdJ [role="tablist"],
      .lbpUdJ .react-tabs__tab-list,
      .lbpUdJ .tab-list {
        margin-left: 0 !important;
        padding-left: 0 !important;
      }
      /* Sample-block headings: use the Roboto Condensed heading font
         and add a small left indent so they line up with the content
         inside the code boxes below. */
      .lbpUdJ h3, .lbpUdJ h5 {
        font-family: 'Roboto Condensed', system-ui, sans-serif !important;
        padding-left: 6px !important;
      }
    </style>
  </head>
  <body>
    <div id="redoc"></div>
    <script src="https://cdn.jsdelivr.net/npm/redoc/bundles/redoc.standalone.js"></script>
    <script>
      Redoc.init(
        "/docs/json",
        {
          theme: {
            typography: {
              fontSize: "16px",
              lineHeight: "1.55em",
              fontFamily: "Barlow, system-ui, sans-serif",
              smallFontSize: "14px",
              headings: {
                fontFamily: "'Roboto Condensed', system-ui, sans-serif",
                fontWeight: "600",
                lineHeight: "1.35em",
              },
              code: {
                fontSize: "14px",
                lineHeight: "1.15em",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              },
            },
            sidebar: {
              width: "320px",
            },
          },
        },
        document.getElementById("redoc"),
      );
    </script>
  </body>
</html>`);
    },
  );

  // Health check (no auth)
  app.get(
    "/health",
    {
      schema: {
        tags: ["Health"],
        summary: "Server health",
        description: "Returns 200 if the Fastify process is alive and serving requests.",
        response: {
          200: {
            description: "Liveness probe response.",
            type: "object",
            properties: { status: { type: "string", enum: ["ok"] } },
            required: ["status"],
            example: { status: "ok" },
          },
        },
      },
    },
    async () => {
      return { status: "ok" };
    },
  );

  // Readiness probe — verifies the DB is reachable AND that every table
  // touched by the hot-path SELECTs exists. Catches the partially-migrated
  // state where a deploy ships code that queries tables a failed migration
  // never created (Apr 2026 outage: track_previews missing → all share
  // URLs returned 500). Returns 503 with the missing-table list so Zerops
  // and external monitoring can mark the container un-ready.
  app.get(
    "/health/ready",
    {
      schema: {
        tags: ["Health"],
        summary: "Readiness probe (schema + DB reachability)",
      },
    },
    async (_request, reply) => {
      // Tables added by recent migrations whose absence would crash a
      // request handler. Extend this list whenever a new migration adds a
      // table referenced by request-time SELECTs.
      const expected = [
        "tracks",
        "albums",
        "artists",
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
      try {
        const repo = await getRepository();
        const missing = await repo.findMissingTables(expected);
        if (missing.length > 0) {
          return reply.status(503).send({ status: "not_ready", missingTables: missing });
        }
        return { status: "ready" };
      } catch (err) {
        return reply.status(503).send({ status: "not_ready", error: (err as Error).message });
      }
    },
  );

  // Auth routes (no auth required)
  await app.register(authRoutes);

  // Admin auth routes (no auth required - login, setup, setup-status)
  await app.register(adminAuthRoutes);

  // Share endpoint (public, no auth - used for SSR)
  await app.register(shareRoutes);
  await app.register(sharePreviewRoutes);

  // Artist info endpoint (public, no auth - fetched by React island)
  await app.register(artistInfoRoutes);
  await app.register(randomExampleRoutes);

  // Genre artwork endpoint (public, no auth - referenced from browse grid tiles)
  await app.register(genreArtworkRoutes);

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
    await protectedApp.register(linkRoutes);
  });

  // Admin-protected API routes (Bearer JWT with role: "admin")
  await app.register(async function adminRoutes(adminApp) {
    adminApp.addHook("preHandler", adminApp.authenticateAdmin);
    await adminApp.register(adminAnalyticsRoutes);
    await adminApp.register(adminContentRoutes);
    await adminApp.register(adminDataRoutes);
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
