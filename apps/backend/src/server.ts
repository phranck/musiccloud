import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import sensible from "@fastify/sensible";
import Fastify from "fastify";
import { runMigrations } from "./db/run-migrations.js";
import authPlugin from "./plugins/auth.js";
import adminAnalyticsRoutes from "./routes/admin-analytics.js";
import adminAuthRoutes from "./routes/admin-auth.js";
import adminDataRoutes from "./routes/admin-data.js";
import adminSseRoutes from "./routes/admin-sse.js";
import adminUserRoutes from "./routes/admin-users.js";
import artistInfoRoutes from "./routes/artist-info.js";
import authRoutes from "./routes/auth.js";
import linkRoutes from "./routes/link.js";
import randomExampleRoutes from "./routes/random-example.js";
import resolveRoutes from "./routes/resolve.js";
import resolvePublicGetRoutes from "./routes/resolve-public-get.js";
import resolveAlbumRoutes from "./routes/resolve-album.js";
import shareRoutes from "./routes/share.js";
import { warmAppleMusicToken } from "./services/adapters/apple-music.js";
import { validateAdapters } from "./services/index.js";

const HOST = process.env.HOST ?? "0.0.0.0";
const PORT = Number(process.env.PORT ?? 4000);

async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === "production" ? "info" : "debug",
    },
  });

  // Security & utility plugins
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN?.split(",") ?? ["http://localhost:3000", "http://localhost:4321"],
  });
  await app.register(helmet);
  await app.register(sensible);

  // JWT plugin (used by auth routes and public API auth)
  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? "dev-secret-change-in-production",
  });

  // Auth decorators (authenticateInternal, authenticatePublic)
  await app.register(authPlugin);

  // Health check (no auth)
  app.get("/health", async () => {
    return { status: "ok" };
  });

  // Auth routes (no auth required)
  await app.register(authRoutes);

  // Admin auth routes (no auth required - login, setup, setup-status)
  await app.register(adminAuthRoutes);

  // Share endpoint (public, no auth - used for SSR)
  await app.register(shareRoutes);

  // Artist info endpoint (public, no auth - fetched by React island)
  await app.register(artistInfoRoutes);
  await app.register(randomExampleRoutes);

  // Public GET resolve endpoint (no auth - used for Shortcuts, etc.)
  await app.register(resolvePublicGetRoutes);

  // Protected API routes (X-API-Key or Bearer JWT)
  await app.register(async function protectedRoutes(protectedApp) {
    protectedApp.addHook("preHandler", protectedApp.authenticatePublic);

    await protectedApp.register(resolveRoutes);
    await protectedApp.register(resolveAlbumRoutes);
    await protectedApp.register(linkRoutes);
  });

  // Admin-protected API routes (Bearer JWT with role: "admin")
  await app.register(async function adminRoutes(adminApp) {
    adminApp.addHook("preHandler", adminApp.authenticateAdmin);
    await adminApp.register(adminAnalyticsRoutes);
    await adminApp.register(adminDataRoutes);
    await adminApp.register(adminSseRoutes);
    await adminApp.register(adminUserRoutes);
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

start();

export { buildApp };
