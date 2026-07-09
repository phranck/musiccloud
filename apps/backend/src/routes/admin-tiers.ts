/**
 * Admin CRUD routes for tier definitions (MC-092).
 * Restricted to owner/admin roles; registered inside the adminRoutes scope
 * where `authenticateAdmin` already verified the JWT.
 */
import { ENDPOINTS, isTierIconName } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { getTierRepository } from "../db/index.js";
import {
  MAX_TIER_FEATURE_LABEL_LENGTH,
  MAX_TIER_FEATURES,
  type TierCreateData,
  type TierUpdateData,
} from "../db/tiers-repository.js";
import { requireOwnerOrAdmin } from "../lib/admin-caller.js";

/** Matches a 6-digit hex colour like `#RRGGBB`. */
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** Maximum length of a tier's free-text description. */
const MAX_TIER_DESCRIPTION_LENGTH = 500;

/** Maximum length of a tier's disable reason. */
const MAX_TIER_DISABLE_REASON_LENGTH = 200;

/** Maximum length of a tier's custom CTA button label. */
const MAX_TIER_BUTTON_LABEL_LENGTH = 40;

/**
 * Validates the `features` payload for a tier create/update request. Returns an
 * error message describing the first problem found, or `null` when the value is
 * a well-formed list of feature bullets (each a non-empty label plus a boolean
 * `included` flag), within the count and length limits.
 *
 * @param features - The raw `features` value from the request body.
 * @returns An error string, or `null` when valid.
 */
function validateFeatures(features: unknown): string | null {
  if (!Array.isArray(features)) return "features must be an array";
  if (features.length > MAX_TIER_FEATURES) return `features must have at most ${MAX_TIER_FEATURES} entries`;
  for (const feature of features) {
    if (typeof feature !== "object" || feature === null) {
      return "each feature must be an object with a label and an included flag";
    }
    const { label, included } = feature as { label?: unknown; included?: unknown };
    if (typeof label !== "string" || label.trim().length === 0) {
      return "each feature label must be a non-empty string";
    }
    if (label.length > MAX_TIER_FEATURE_LABEL_LENGTH) {
      return `each feature label must be at most ${MAX_TIER_FEATURE_LABEL_LENGTH} characters`;
    }
    if (typeof included !== "boolean") return "each feature included flag must be a boolean";
  }
  return null;
}

export async function adminTiersRoutes(app: FastifyInstance) {
  app.get(ENDPOINTS.admin.developer.tiers, async (request, reply) => {
    if (!(await requireOwnerOrAdmin(request, reply))) return;
    const repo = await getTierRepository();
    return repo.listTiers();
  });

  app.post(ENDPOINTS.admin.developer.tiers, async (request, reply) => {
    if (!(await requireOwnerOrAdmin(request, reply))) return;
    const body = request.body as TierCreateData;
    if (!body.name || body.requestsPerMinute == null || body.requestsPerDay == null) {
      return reply.status(400).send({ error: "name, requestsPerMinute, and requestsPerDay are required" });
    }
    if (body.requestsPerMinute < 1) {
      return reply.status(400).send({ error: "requestsPerMinute must be > 0" });
    }
    if (body.requestsPerDay < 1) {
      return reply.status(400).send({ error: "requestsPerDay must be > 0" });
    }
    if (body.color != null && !HEX_COLOR_RE.test(body.color)) {
      return reply.status(400).send({ error: "color must be a hex value like #RRGGBB" });
    }
    if (body.icon != null && !isTierIconName(body.icon)) {
      return reply.status(400).send({ error: "icon must be one of the supported tier icon names" });
    }
    if (body.buttonLabel != null && body.buttonLabel.length > MAX_TIER_BUTTON_LABEL_LENGTH) {
      return reply
        .status(400)
        .send({ error: `buttonLabel must be at most ${MAX_TIER_BUTTON_LABEL_LENGTH} characters` });
    }
    if (body.description != null && body.description.length > MAX_TIER_DESCRIPTION_LENGTH) {
      return reply.status(400).send({ error: `description must be at most ${MAX_TIER_DESCRIPTION_LENGTH} characters` });
    }
    if (body.disableReason != null && body.disableReason.length > MAX_TIER_DISABLE_REASON_LENGTH) {
      return reply
        .status(400)
        .send({ error: `disableReason must be at most ${MAX_TIER_DISABLE_REASON_LENGTH} characters` });
    }
    if (body.recommended != null && typeof body.recommended !== "boolean") {
      return reply.status(400).send({ error: "recommended must be a boolean" });
    }
    if (body.features != null) {
      const featuresError = validateFeatures(body.features);
      if (featuresError) return reply.status(400).send({ error: featuresError });
    }
    const repo = await getTierRepository();
    const tier = await repo.createTier(body);
    return reply.status(201).send(tier);
  });

  app.patch(ENDPOINTS.admin.developer.tierDetail(":id"), async (request, reply) => {
    if (!(await requireOwnerOrAdmin(request, reply))) return;
    const { id } = request.params as { id: string };
    const body = request.body as TierUpdateData;
    if (body.requestsPerMinute != null && body.requestsPerMinute < 1) {
      return reply.status(400).send({ error: "requestsPerMinute must be > 0" });
    }
    if (body.requestsPerDay != null && body.requestsPerDay < 1) {
      return reply.status(400).send({ error: "requestsPerDay must be > 0" });
    }
    if (body.color != null && !HEX_COLOR_RE.test(body.color)) {
      return reply.status(400).send({ error: "color must be a hex value like #RRGGBB" });
    }
    if (body.icon != null && !isTierIconName(body.icon)) {
      return reply.status(400).send({ error: "icon must be one of the supported tier icon names" });
    }
    if (body.buttonLabel != null && body.buttonLabel.length > MAX_TIER_BUTTON_LABEL_LENGTH) {
      return reply
        .status(400)
        .send({ error: `buttonLabel must be at most ${MAX_TIER_BUTTON_LABEL_LENGTH} characters` });
    }
    if (body.description != null && body.description.length > MAX_TIER_DESCRIPTION_LENGTH) {
      return reply.status(400).send({ error: `description must be at most ${MAX_TIER_DESCRIPTION_LENGTH} characters` });
    }
    if (body.disableReason != null && body.disableReason.length > MAX_TIER_DISABLE_REASON_LENGTH) {
      return reply
        .status(400)
        .send({ error: `disableReason must be at most ${MAX_TIER_DISABLE_REASON_LENGTH} characters` });
    }
    if (body.recommended != null && typeof body.recommended !== "boolean") {
      return reply.status(400).send({ error: "recommended must be a boolean" });
    }
    if (body.features != null) {
      const featuresError = validateFeatures(body.features);
      if (featuresError) return reply.status(400).send({ error: featuresError });
    }
    const repo = await getTierRepository();
    const tier = await repo.updateTier(id, body);
    return tier;
  });

  app.delete(ENDPOINTS.admin.developer.tierDetail(":id"), async (request, reply) => {
    if (!(await requireOwnerOrAdmin(request, reply))) return;
    const { id } = request.params as { id: string };
    const repo = await getTierRepository();
    await repo.deleteTier(id);
    return reply.status(204).send();
  });
}
