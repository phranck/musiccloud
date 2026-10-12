/**
 * Admin CRUD routes for tier definitions (MC-092).
 * Restricted to owner/admin roles; registered inside the adminRoutes scope
 * where `authenticateAdmin` already verified the JWT.
 */
import {
  ENDPOINTS,
  MAX_REQUEST_LIMIT,
  MAX_TIER_BUTTON_LABEL_LENGTH,
  MAX_TIER_DESCRIPTION_LENGTH,
  MAX_TIER_DISABLE_REASON_LENGTH,
  MAX_TIER_FEATURE_LABEL_LENGTH,
  MAX_TIER_FEATURES,
  MAX_TIER_NAME_LENGTH,
  MIN_REQUEST_LIMIT,
  ROUTE_TEMPLATES,
  TIER_COLOR_PATTERN,
  TIER_ICONS,
} from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { getTierRepository } from "../db/index.js";
import { type TierCreateData, type TierUpdateData, tierIdSchema } from "../db/tiers-repository.js";
import { requireOwnerOrAdmin } from "../lib/admin-caller.js";
import { replyWithApiError } from "../lib/infra/api-error-handler.js";
import { resetCreemCatalogCache } from "../services/creem-catalog.js";

/** The range a PostgreSQL `integer` column holds, which bounds the sort order. */
const POSTGRES_INTEGER_RANGE = { minimum: -2_147_483_648, maximum: 2_147_483_647 } as const;

/** A text that holds more than whitespace. */
const NOT_BLANK_PATTERN = "\\S";

/** A request limit, as `isRequestLimit` in the shared package states it. */
const requestLimitSchema = {
  type: "integer",
  minimum: MIN_REQUEST_LIMIT,
  maximum: MAX_REQUEST_LIMIT,
} as const;

/**
 * Every field a plan carries, as a request may state it.
 *
 * The limits come from the shared package, so the dashboard stops accepting
 * input at the number this schema refuses at. A value of the wrong type is
 * refused here rather than reaching the database, where it would fail as a
 * server error.
 */
const tierFieldsSchema = {
  name: { type: "string", maxLength: MAX_TIER_NAME_LENGTH, pattern: NOT_BLANK_PATTERN },
  requestsPerMinute: requestLimitSchema,
  requestsPerDay: requestLimitSchema,
  attributionRequired: { type: "boolean" },
  color: { type: "string", pattern: TIER_COLOR_PATTERN.source },
  icon: { type: ["string", "null"], enum: [...TIER_ICONS, null] },
  buttonLabel: { type: ["string", "null"], maxLength: MAX_TIER_BUTTON_LABEL_LENGTH },
  description: { type: "string", maxLength: MAX_TIER_DESCRIPTION_LENGTH },
  enabled: { type: "boolean" },
  disableReason: { type: "string", maxLength: MAX_TIER_DISABLE_REASON_LENGTH },
  recommended: { type: "boolean" },
  sortOrder: { type: "integer", ...POSTGRES_INTEGER_RANGE },
  features: {
    type: "array",
    maxItems: MAX_TIER_FEATURES,
    items: { type: "string", maxLength: MAX_TIER_FEATURE_LABEL_LENGTH, pattern: NOT_BLANK_PATTERN },
  },
} as const;

/** The body of a new plan, which has to name itself and its two limits. */
const createTierBodySchema = {
  type: "object",
  required: ["name", "requestsPerMinute", "requestsPerDay"],
  additionalProperties: false,
  properties: tierFieldsSchema,
} as const;

/** The path parameter of the routes that act on one plan. */
const tierParamsSchema = {
  type: "object",
  required: ["id"],
  additionalProperties: false,
  properties: { id: tierIdSchema },
} as const;

/** The body of a change to a plan, where every field is optional. */
const updateTierBodySchema = {
  type: "object",
  additionalProperties: false,
  properties: tierFieldsSchema,
} as const;

export async function adminTiersRoutes(app: FastifyInstance) {
  // Each plan carries its offers, because they are its price and the plan list
  // shows them. One read of every offer serves the whole list.
  app.get(ENDPOINTS.admin.developer.tiers, async (request, reply) => {
    if (!(await requireOwnerOrAdmin(request, reply))) return;
    const repo = await getTierRepository();
    const [tiers, offers] = await Promise.all([repo.listTiers(), repo.listAllOffers()]);
    return tiers.map((tier) => ({ ...tier, offers: offers.filter((offer) => offer.tierId === tier.id) }));
  });

  /**
   * Creates a plan.
   *
   * A plan's name is unique in the database, so a name another plan has is
   * answered as a conflict before the write instead of failing inside it.
   */
  app.post(ENDPOINTS.admin.developer.tiers, { schema: { body: createTierBodySchema } }, async (request, reply) => {
    if (!(await requireOwnerOrAdmin(request, reply))) return;
    const body = request.body as TierCreateData;
    const repo = await getTierRepository();
    if ((await repo.listTiers()).some((tier) => tier.name === body.name)) {
      return replyWithApiError(reply, "MC-REQ-0002");
    }
    const tier = await repo.createTier(body);
    return reply.status(201).send(tier);
  });

  /**
   * Changes a plan.
   *
   * A plan that does not exist is answered as missing, and a name another plan
   * has as a conflict, before the write, so neither reaches the database as a
   * server error.
   */
  app.patch(
    ROUTE_TEMPLATES.admin.developer.tierDetail,
    { schema: { params: tierParamsSchema, body: updateTierBodySchema } },
    async (request, reply) => {
      if (!(await requireOwnerOrAdmin(request, reply))) return;
      const { id } = request.params as { id: string };
      const body = request.body as TierUpdateData;
      const repo = await getTierRepository();
      const tiers = await repo.listTiers();
      if (!tiers.some((tier) => tier.id === id)) {
        return reply.status(404).send({ error: `Plan not found: ${id}` });
      }
      if (body.name !== undefined && tiers.some((tier) => tier.id !== id && tier.name === body.name)) {
        return replyWithApiError(reply, "MC-REQ-0002");
      }
      return repo.updateTier(id, body);
    },
  );

  app.delete(
    ROUTE_TEMPLATES.admin.developer.tierDetail,
    { schema: { params: tierParamsSchema } },
    async (request, reply) => {
      if (!(await requireOwnerOrAdmin(request, reply))) return;
      const { id } = request.params as { id: string };
      const repo = await getTierRepository();
      await repo.deleteTier(id);
      // The plan's offers and their product mappings went with it, and a cached
      // catalogue would go on pricing them.
      resetCreemCatalogCache();
      return reply.status(204).send();
    },
  );
}
