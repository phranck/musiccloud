/**
 * @file The admin surface for a tier's Creem products (MC-182).
 *
 * Reading spans both Creem environments, so the tier editor can show which one
 * already has a product. Writing does not: a process holds one API key and
 * therefore talks to one Creem account, and nothing in the interface may
 * override that. Every write here acts in `getCreemConfig().mode` and says so
 * in its response, which is what lets the editor grey out the environment the
 * backend is not currently in rather than silently creating a sandbox product
 * somebody meant for live.
 *
 * The key that creates a product also issues refunds and cancels
 * subscriptions, so it never leaves the backend and every route below checks
 * for an administrator first.
 */

import { ENDPOINTS, ROUTE_TEMPLATES } from "@musiccloud/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import { getTierRepository } from "../db/index.js";
import type { TierCreemProductKey } from "../db/tiers-repository.js";
import { requireOwnerOrAdmin } from "../lib/admin-caller.js";
import { getCreemConfig } from "../lib/creem-config.js";
import {
  archiveCreemProduct,
  CreemProductError,
  createCreemProduct,
  updateCreemProductPrice,
} from "../services/creem-products.js";
import { draftCreemProductFor, isBillingInterval } from "../services/tier-creem-draft.js";

/** Longest Creem product id we accept when attaching one created elsewhere. */
const MAX_CREEM_PRODUCT_ID_LENGTH = 128;

/**
 * A Creem product id as Creem issues them: a `prod_` prefix and an
 * alphanumeric body. Constrained here because the value reaches a URL path on
 * its way to Creem.
 */
const CREEM_PRODUCT_ID_PATTERN = "^prod_[A-Za-z0-9]+$";

/** Schema for the two path parameters every per-product route takes. */
const productParamsSchema = {
  type: "object",
  required: ["tierId", "interval"],
  additionalProperties: false,
  properties: {
    tierId: { type: "string", minLength: 1, maxLength: 64, pattern: "^[A-Za-z0-9_-]+$" },
    interval: { type: "string", enum: ["month", "year"] },
  },
} as const;

/**
 * Answers with the MC code a failed Creem operation carries, or re-throws.
 *
 * The codes come from the throw rather than from the route, so the mapping
 * between a Creem failure and what the operator is told is stated once.
 *
 * @param reply - The reply to answer on.
 * @param error - Whatever the operation threw.
 * @param status - The status for this class of failure.
 * @returns The reply, so a handler can `return` it.
 * @throws The original error when it is not a Creem product failure, so the
 *   global handler classifies it rather than this route guessing.
 */
function replyWithCreemFailure(reply: FastifyReply, error: unknown, status: number): FastifyReply {
  if (!(error instanceof CreemProductError)) throw error;
  return reply.status(status).send({ error: error.message, code: error.code });
}

export async function adminCreemProductRoutes(app: FastifyInstance) {
  /**
   * Lists every Creem product mapping, across both environments, so the tier
   * editor can show which one already has a product and which does not, and
   * which environment this backend is currently able to write to.
   */
  app.get(ENDPOINTS.admin.developer.creemProducts, async (request, reply) => {
    if (!(await requireOwnerOrAdmin(request, reply))) return;
    const repo = await getTierRepository();
    return { mode: getCreemConfig().mode, products: await repo.listAllCreemProductMappings() };
  });

  /**
   * Creates the product for a tier and interval at Creem and records it, or
   * records one that was created in the Creem dashboard instead.
   *
   * The second case exists because a product with a trial has to be created
   * there: Creem's API has no field for a trial, so the dashboard is the only
   * way to set one.
   */
  app.post(
    ENDPOINTS.admin.developer.creemProducts,
    {
      schema: {
        body: {
          type: "object",
          required: ["tierId", "interval"],
          additionalProperties: false,
          properties: {
            tierId: { type: "string", minLength: 1, maxLength: 64, pattern: "^[A-Za-z0-9_-]+$" },
            interval: { type: "string", enum: ["month", "year"] },
            creemProductId: {
              type: "string",
              minLength: 1,
              maxLength: MAX_CREEM_PRODUCT_ID_LENGTH,
              pattern: CREEM_PRODUCT_ID_PATTERN,
            },
          },
        },
      },
    },
    async (request, reply) => {
      if (!(await requireOwnerOrAdmin(request, reply))) return;
      const body = request.body as { tierId: string; interval: string; creemProductId?: string };
      if (!isBillingInterval(body.interval)) {
        return reply.status(400).send({ error: "interval must be month or year" });
      }

      const repo = await getTierRepository();
      const tier = (await repo.listTiers()).find((candidate) => candidate.id === body.tierId);
      if (!tier) return reply.status(404).send({ error: `Tier not found: ${body.tierId}` });

      const { mode } = getCreemConfig();
      const key: TierCreemProductKey = { tierId: body.tierId, interval: body.interval, mode };

      if (await repo.findCreemProductMapping(key)) {
        return reply.status(409).send({
          error: "This plan already has a product for that interval in this environment",
          code: "MC-BILL-0004",
        });
      }

      // Attaching an id created in the Creem dashboard skips the draft
      // entirely, because whoever made it there chose its name and price.
      if (body.creemProductId) {
        await repo.createCreemProductMapping({ ...key, creemProductId: body.creemProductId });
        return reply.status(201).send({ ...key, creemProductId: body.creemProductId });
      }

      const draft = draftCreemProductFor(tier, body.interval);
      if (!draft) {
        return reply.status(400).send({
          error: "A free plan gets no Creem product, and a plan without a yearly price is not sold yearly",
          code: "MC-BILL-0005",
        });
      }

      let product: Awaited<ReturnType<typeof createCreemProduct>>;
      try {
        product = await createCreemProduct(draft);
      } catch (error) {
        return replyWithCreemFailure(reply, error, 502);
      }

      // The product exists at Creem from here on. If this insert fails the
      // product is real and unreferenced, which is why the conflict above is
      // checked before creating rather than after.
      await repo.createCreemProductMapping({ ...key, creemProductId: product.id });
      return reply.status(201).send({ ...key, creemProductId: product.id, price: product.price });
    },
  );

  /**
   * Changes the product's price at Creem.
   *
   * The product keeps its id, so the mapping row stays valid and every
   * existing subscription keeps pointing at the same product. The tier's own
   * price column is not touched here: Creem is the source of truth for what is
   * charged, and the pricing page already follows it.
   */
  app.patch(
    ROUTE_TEMPLATES.admin.developer.creemProductDetail,
    {
      schema: {
        params: productParamsSchema,
        body: {
          type: "object",
          required: ["priceCents"],
          additionalProperties: false,
          properties: { priceCents: { type: "integer", minimum: 100, maximum: 100_000_000 } },
        },
      },
    },
    async (request, reply) => {
      if (!(await requireOwnerOrAdmin(request, reply))) return;
      const params = request.params as { tierId: string; interval: string };
      const { priceCents } = request.body as { priceCents: number };
      if (!isBillingInterval(params.interval)) {
        return reply.status(400).send({ error: "interval must be month or year" });
      }

      const repo = await getTierRepository();
      const { mode } = getCreemConfig();
      const mapping = await repo.findCreemProductMapping({ tierId: params.tierId, interval: params.interval, mode });
      if (!mapping) return reply.status(404).send({ error: "No product for that plan, interval and environment" });

      try {
        const product = await updateCreemProductPrice(mapping.creemProductId, priceCents);
        return { ...mapping, price: product.price, currency: product.currency };
      } catch (error) {
        return replyWithCreemFailure(reply, error, 502);
      }
    },
  );

  /**
   * Archives the product at Creem and removes its mapping, as one operation.
   *
   * The order matters and is not interchangeable. Archiving first means a
   * failure leaves both halves intact and the operator can retry; removing the
   * row first would leave an active product nothing points at. When Creem
   * refuses, the row is deliberately kept, because a mapping pointing at a
   * live product is the correct state and a missing one is not.
   */
  app.delete(
    ROUTE_TEMPLATES.admin.developer.creemProductDetail,
    { schema: { params: productParamsSchema } },
    async (request, reply) => {
      if (!(await requireOwnerOrAdmin(request, reply))) return;
      const params = request.params as { tierId: string; interval: string };
      if (!isBillingInterval(params.interval)) {
        return reply.status(400).send({ error: "interval must be month or year" });
      }

      const repo = await getTierRepository();
      const { mode } = getCreemConfig();
      const key: TierCreemProductKey = { tierId: params.tierId, interval: params.interval, mode };
      const mapping = await repo.findCreemProductMapping(key);
      if (!mapping) return reply.status(404).send({ error: "No product for that plan, interval and environment" });

      try {
        await archiveCreemProduct(mapping.creemProductId);
      } catch (error) {
        return replyWithCreemFailure(reply, error, 502);
      }

      await repo.deleteCreemProductMapping(key);
      return reply.status(204).send();
    },
  );
}
