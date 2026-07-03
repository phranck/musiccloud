/**
 * @file Admin CRUD for the global email branding singleton (MC-078, extended
 * MC-079).
 *
 * There is exactly one `email_branding` row: the default header/footer asset
 * ids, footer text and day/night page background (gradient + optional image)
 * wrapped around EVERY rendered template UNLESS the template overrides the
 * matching field (see `services/email-renderer.ts`'s `resolveBranding`). This
 * route only reads and partially updates that one row — it never creates or
 * deletes it, since the row is seeded once by migration
 * `0050_backfill_email_template_blocks.sql`.
 */

import { ENDPOINTS } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import type { EmailBrandingDto } from "../db/admin-repository.js";
import { isHexColor } from "../lib/color.js";
import { getManagedEmailBranding, updateManagedEmailBranding } from "../services/email-templates.js";

/**
 * Body accepted by `PUT /api/admin/email-branding`. Every field is optional;
 * an omitted field keeps its current stored value (present-keys-only partial
 * update, see `updateManagedEmailBranding`). The nullable string fields (asset
 * ids + footer text) can be sent as `null` to clear them; the gradient colours
 * are NOT NULL columns, so they may only be set to a valid hex string, never
 * cleared.
 */
interface EmailBrandingUpdateBody {
  headerAssetId?: string | null;
  footerAssetId?: string | null;
  footerText?: string | null;
  lightBackgroundAssetId?: string | null;
  darkBackgroundAssetId?: string | null;
  lightGradientTop?: string;
  lightGradientBottom?: string;
  darkGradientTop?: string;
  darkGradientBottom?: string;
}

/** The nullable string fields: asset ids + footer text (present ⇒ string or null). */
const NULLABLE_STRING_FIELDS = [
  "headerAssetId",
  "footerAssetId",
  "footerText",
  "lightBackgroundAssetId",
  "darkBackgroundAssetId",
] as const;

/** The gradient colour fields: NOT NULL, so present ⇒ must be a literal hex colour. */
const GRADIENT_COLOR_FIELDS = [
  "lightGradientTop",
  "lightGradientBottom",
  "darkGradientTop",
  "darkGradientBottom",
] as const;

/**
 * Validates a `PUT /api/admin/email-branding` body. Mirrors the manual
 * `typeof`-check style used by `admin-email-templates.ts`'s
 * `validateUpdateBody`: every field is optional, and when present the nullable
 * string fields must be a string or `null` (never `undefined` — that would
 * collide with "field omitted" in the partial-update semantics). The gradient
 * colours are validated as literal hex (`{@link isHexColor}`) because they are
 * interpolated straight into inline CSS on the send path — an arbitrary string
 * could break out of the `style`/`<style>` context.
 *
 * @param body - the raw, untyped request body.
 * @returns the validated body, or a string error message.
 */
function validateUpdateBody(body: unknown): EmailBrandingUpdateBody | string {
  if (!body || typeof body !== "object") return "body must be an object";
  const b = body as Record<string, unknown>;
  const out: EmailBrandingUpdateBody = {};

  for (const field of NULLABLE_STRING_FIELDS) {
    if (b[field] !== undefined) {
      const v = b[field];
      if (v !== null && typeof v !== "string") return `${field} must be string or null`;
      out[field] = v as string | null;
    }
  }

  for (const field of GRADIENT_COLOR_FIELDS) {
    if (b[field] !== undefined) {
      const v = b[field];
      if (!isHexColor(v)) return `${field} must be a hex colour (e.g. #0076d5)`;
      out[field] = v;
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
