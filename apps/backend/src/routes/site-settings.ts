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
import { requireOwnerOrAdmin } from "../lib/admin-caller.js";
import { replyWithApiError } from "../lib/infra/api-error-handler.js";
import { SELLING_MODE_KEY } from "../services/creem-selling-mode.js";
import { getAllSettings, getDesignTokens, getSetting, setSetting } from "../services/site-settings.js";
import { SPONSORING_CONFIG_KEY } from "../services/sponsoring-config.js";
import { SUPPORT_PROMPT_LIMITS_KEY } from "../services/support-prompt-limits.js";

/**
 * Keys the generic PATCH refuses, because a route of their own writes them.
 *
 * Each of those routes checks the caller's role and the value before writing,
 * and this route checks neither, so accepting the key here would skip both.
 * Every entry is the constant its owning service exports, so the key is spelled
 * once. Contains `creem_selling_mode`, whose route is
 * `PATCH /api/admin/developer/creem-selling-mode`, `sponsoring_config`, whose
 * route is `PUT /api/admin/sponsoring/config`, and `support_prompt_limits`,
 * whose route is `PUT /api/admin/support-prompts/limits`.
 */
const KEYS_WITH_THEIR_OWN_ROUTE: ReadonlySet<string> = new Set([
  SELLING_MODE_KEY,
  SPONSORING_CONFIG_KEY,
  SUPPORT_PROMPT_LIMITS_KEY,
]);

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

  app.get(
    ENDPOINTS.v1.siteSettings.designTokens,
    {
      schema: {
        tags: ["Site"],
        summary: "Read the validated design-token blob",
        description:
          "Returns the site's design tokens (glass material + night-sky shader), validated and sanitised through `parseDesignTokens`. Consumed by the Astro frontend during SSR to seed the `:root` custom properties. Always returns a complete, valid token set (canonical defaults fill any missing/invalid value); never returns the raw stored string or any other setting.",
      },
    },
    async (_request, reply) => {
      // Read ONLY the design-token key and run it through the shared validator
      // so a tampered/garbage stored value can never leak as raw CSS or expose
      // an unrelated setting. `getAllSettings` is deliberately NOT used here.
      reply.header("Cache-Control", "private, max-age=60");
      return await getDesignTokens();
    },
  );
}

/**
 * Admin read and write for site settings. The PATCH body is an untyped map of
 * string settings, so a new setting can be introduced by the dashboard without
 * a backend deploy.
 *
 * `authenticateAdmin` admits every dashboard role, moderators included, because
 * all of them carry the JWT claim `role: "admin"`. Both routes therefore check
 * for an owner or an admin themselves, which matches the dashboard: the screens
 * that use them sit in the Administration area, whose minimum role is `admin`.
 * A key in {@link KEYS_WITH_THEIR_OWN_ROUTE} is refused for every role.
 */
export async function siteSettingsAdminRoutes(app: FastifyInstance) {
  app.get(ENDPOINTS.admin.siteSettings.base, async (request, reply) => {
    if (!(await requireOwnerOrAdmin(request, reply))) return;
    return getAllSettings();
  });

  app.patch<{ Body: Record<string, string> }>(ENDPOINTS.admin.siteSettings.base, async (request, reply) => {
    if (!(await requireOwnerOrAdmin(request, reply))) return;
    const updates = request.body;
    if (!updates || typeof updates !== "object") {
      return reply.status(400).send({ error: "INVALID_BODY", message: "Request body must be a JSON object." });
    }
    // Checked before the first write, so a refused request leaves every
    // setting as it was rather than writing the keys that came before.
    const ownedElsewhere = Object.keys(updates).find((key) => KEYS_WITH_THEIR_OWN_ROUTE.has(key));
    if (ownedElsewhere) {
      return replyWithApiError(reply, "MC-REQ-0010", { context: { key: ownedElsewhere } });
    }
    // Values are coerced to strings because the settings store is
    // string-only; numbers/booleans from the admin UI serialize losslessly.
    for (const [key, value] of Object.entries(updates)) {
      await setSetting(key, String(value));
    }
    return getAllSettings();
  });
}
