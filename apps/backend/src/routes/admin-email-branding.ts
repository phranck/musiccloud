/**
 * @file Admin CRUD for the global email branding singleton (MC-078).
 *
 * There is exactly one `email_branding` row: the header/footer asset ids and
 * footer text wrapped around EVERY rendered template (see
 * `services/email-renderer.ts`'s `renderBlocks`). This route only reads and
 * partially updates that one row — it never creates or deletes it, since the
 * row is seeded once by migration `0050_backfill_email_template_blocks.sql`.
 */

import { ENDPOINTS } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import type { EmailBrandingDto } from "../db/admin-repository.js";
import { getManagedEmailBranding, updateManagedEmailBranding } from "../services/email-templates.js";

/** Body accepted by `PUT /api/admin/email-branding`. Every field is optional; omitted fields keep their current stored value, while a field explicitly sent as `null` clears it (see `updateManagedEmailBranding`'s present-keys-only partial update). */
interface EmailBrandingUpdateBody {
  headerAssetId?: string | null;
  footerAssetId?: string | null;
  footerText?: string | null;
}

/**
 * Validates a `PUT /api/admin/email-branding` body. Mirrors the manual
 * `typeof`-check style used by `admin-email-templates.ts`'s
 * `validateUpdateBody`: every field is optional, and when present must be a
 * string or `null` (never `undefined` — that would collide with "field
 * omitted" in the partial-update semantics).
 *
 * @param body - the raw, untyped request body.
 * @returns the validated body, or a string error message.
 */
function validateUpdateBody(body: unknown): EmailBrandingUpdateBody | string {
  if (!body || typeof body !== "object") return "body must be an object";
  const b = body as Record<string, unknown>;
  const out: EmailBrandingUpdateBody = {};
  for (const field of ["headerAssetId", "footerAssetId", "footerText"] as const) {
    if (b[field] !== undefined) {
      const v = b[field];
      if (v !== null && typeof v !== "string") return `${field} must be string or null`;
      out[field] = v as string | null;
    }
  }
  return out;
}

export default async function adminEmailBrandingRoutes(app: FastifyInstance) {
  // GET /api/admin/email-branding
  app.get(ENDPOINTS.admin.emailBranding.base, async (): Promise<EmailBrandingDto> => {
    return getManagedEmailBranding();
  });

  // PUT /api/admin/email-branding
  app.put(ENDPOINTS.admin.emailBranding.base, async (request, reply) => {
    const validated = validateUpdateBody(request.body);
    if (typeof validated === "string") {
      return reply.status(400).send({ error: validated });
    }
    return updateManagedEmailBranding(validated);
  });
}
