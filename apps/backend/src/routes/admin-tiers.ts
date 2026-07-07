/**
 * Admin CRUD routes for tier definitions (MC-092).
 * Restricted to owner/admin roles; registered inside the adminRoutes scope
 * where `authenticateAdmin` already verified the JWT.
 */
import { ENDPOINTS, isTierIconName } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { getTierRepository } from "../db/index.js";
import type { TierCreateData, TierUpdateData } from "../db/tiers-repository.js";
import { requireOwnerOrAdmin } from "../lib/admin-caller.js";

/** Matches a 6-digit hex colour like `#RRGGBB`. */
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** Maximum length of a tier's free-text description. */
const MAX_TIER_DESCRIPTION_LENGTH = 500;

/** Maximum length of a tier's disable reason. */
const MAX_TIER_DISABLE_REASON_LENGTH = 200;

/** Maximum length of a tier's custom CTA button label. */
const MAX_TIER_BUTTON_LABEL_LENGTH = 40;

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
