import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import sensible from "@fastify/sensible";
import swagger from "@fastify/swagger";
import Fastify from "fastify";
import { runMigrations } from "./db/run-migrations.js";
import authPlugin from "./plugins/auth.js";
import adminAnalyticsRoutes from "./routes/admin-analytics.js";
import adminAuthRoutes from "./routes/admin-auth.js";
import adminContentRoutes from "./routes/admin-content.js";
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
import { siteSettingsAdminRoutes, siteSettingsPublicRoutes } from "./routes/site-settings.js";
import { OPENAPI_SCHEMAS } from "./schemas/openapi-schemas.js";
import { validateAdapters } from "./services/index.js";
import { warmAppleMusicToken } from "./services/plugins/apple-music/adapter.js";

const HOST = process.env.HOST ?? "0.0.0.0";
const PORT = Number(process.env.PORT ?? 4000);

async function buildApp() {
  const app = Fastify({
    // Silence log noise under vitest — integration tests stay quiet.
    logger: process.env.VITEST === "true" ? false : { level: process.env.NODE_ENV === "production" ? "info" : "debug" },
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
          "Public REST API for musiccloud.io. Resolve music URLs or text queries across 20+ streaming services and retrieve unified metadata.",
        version: "0.1.0",
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
      // Hide admin + internal SSR helper endpoints (content, nav,
      // site-settings) from the public API reference. They are reachable
      // but not advertised to external consumers.
      const isInternal =
        url.startsWith("/api/admin") ||
        url.startsWith("/api/v1/content") ||
        url.startsWith("/api/v1/nav") ||
        url.startsWith("/api/v1/site-settings");
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
    <link href="https://fonts.googleapis.com/css?family=Montserrat:300,400,700|Roboto:300,400,700" rel="stylesheet" />
    <style>body { margin: 0; padding: 0; }</style>
  </head>
  <body>
    <redoc spec-url="/docs/json"></redoc>
    <script src="https://cdn.jsdelivr.net/npm/redoc/bundles/redoc.standalone.js"></script>
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

  // Auth routes (no auth required)
  await app.register(authRoutes);

  // Admin auth routes (no auth required - login, setup, setup-status)
  await app.register(adminAuthRoutes);

  // Share endpoint (public, no auth - used for SSR)
  await app.register(shareRoutes);

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
