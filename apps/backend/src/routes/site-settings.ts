/**
 * @file Routes for the key/value site-settings store.
 *
 * Exposes two separate exports, which is unusual for a route file but
 * deliberate: they are registered at different auth scopes in `server.ts`.
 * `siteSettingsPublicRoutes` ships a single read-only endpoint inside the
 * unauth scope so the Astro frontend can check a handful of flags during
 * SSR (currently just `tracking_enabled`). `siteSettingsAdminRoutes` ships
 * the full read/write surface inside the admin scope guarded by
 * `authenticateAdmin`. Bundling both into one default export would force
 * both scopes to register the same plugin.
 */
import { ENDPOINTS } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { getAllSettings, getSetting, setSetting } from "../services/site-settings.js";

/**
 * Public read for a single well-known flag (`tracking_enabled`). Kept
 * narrow on purpose: only values that SSR needs end up here, so the public
 * side of the settings store cannot accidentally expose an operational
 * setting added later by the admin UI.
 *
 * `Cache-Control: private, max-age=60`: `private` keeps intermediary
 * caches (CDNs) out of the loop so a toggle takes effect per-browser
 * within a minute rather than propagating through shared caches.
 */
export async function siteSettingsPublicRoutes(app: FastifyInstance) {
  app.get(
    ENDPOINTS.v1.siteSettings.tracking,
    {
      schema: {
        tags: ["Site"],
        summary: "Read the public `tracking_enabled` flag",
        description:
          "Returns whether the site currently has analytics tracking enabled. Consumed by the Astro frontend during SSR to decide whether to inject the Umami script.",
        response: {
          200: {
            description: "Current tracking flag.",
            type: "object",
            required: ["enabled"],
            properties: {
              enabled: { type: "boolean", description: "`true` if analytics tracking is currently enabled." },
            },
            additionalProperties: false,
            example: { enabled: true },
          },
        },
      },
    },
    async (_request, reply) => {
      const value = await getSetting("tracking_enabled");
      reply.header("Cache-Control", "private, max-age=60");
      return { enabled: value === "true" };
    },
  );
}

/**
 * Admin CRUD for all site settings. The PATCH body is an untyped map of
 * string settings; no whitelist of allowed keys exists on the backend. This
 * is intentional: new settings can be introduced by the frontend without a
 * backend deploy. Access is gated entirely by the admin JWT check added in
 * `server.ts` (`authenticateAdmin` preHandler), so only trusted operators
 * can write arbitrary keys.
 */
export async function siteSettingsAdminRoutes(app: FastifyInstance) {
  app.get(ENDPOINTS.admin.siteSettings.base, async () => {
    return getAllSettings();
  });

  app.patch<{ Body: Record<string, string> }>(ENDPOINTS.admin.siteSettings.base, async (request, reply) => {
    const updates = request.body;
    if (!updates || typeof updates !== "object") {
      return reply.status(400).send({ error: "INVALID_BODY", message: "Request body must be a JSON object." });
    }
    // Values are coerced to strings because the settings store is
    // string-only; numbers/booleans from the admin UI serialize losslessly.
    for (const [key, value] of Object.entries(updates)) {
      await setSetting(key, String(value));
    }
    return getAllSettings();
  });
}
