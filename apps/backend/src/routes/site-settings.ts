import type { FastifyInstance } from "fastify";
import { getAllSettings, getSetting, setSetting } from "../services/site-settings.js";

/** Public endpoint for SSR: check if tracking is enabled. */
export async function siteSettingsPublicRoutes(app: FastifyInstance) {
  app.get("/api/v1/site-settings/tracking", async (_request, reply) => {
    const value = await getSetting("tracking_enabled");
    reply.header("Cache-Control", "private, max-age=60");
    return { enabled: value === "true" };
  });
}

/** Admin-protected endpoints for managing site settings. */
export async function siteSettingsAdminRoutes(app: FastifyInstance) {
  app.get("/api/admin/site-settings", async () => {
    return getAllSettings();
  });

  app.patch<{ Body: Record<string, string> }>("/api/admin/site-settings", async (request, reply) => {
    const updates = request.body;
    if (!updates || typeof updates !== "object") {
      return reply.status(400).send({ error: "INVALID_BODY", message: "Request body must be a JSON object." });
    }
    for (const [key, value] of Object.entries(updates)) {
      await setSetting(key, String(value));
    }
    return getAllSettings();
  });
}
