/**
 * @file The admin surface for a tier's Creem products (MC-182).
 *
 * Reading spans both Creem environments and so does writing: an operator
 * prepares the live products whilst the shop still sells from the sandbox, so
 * the editor has to reach both. Which environment a write acts in comes from
 * the request, and a deployment that holds no key for it refuses rather than
 * falling back to the other account.
 *
 * Which environment customers buy from is a different question entirely, and
 * it is not decided here. That is the selling switch in the developer
 * settings.
 *
 * The key that creates a product also issues refunds and cancels
 * subscriptions, so it never leaves the backend and every route below checks
 * for an administrator first.
 */

import { ENDPOINTS, ROUTE_TEMPLATES } from "@musiccloud/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import { getTierRepository } from "../db/index.js";
import type { TierCreemProductKey } from "../db/tiers-repository.js";
import { requireOwner, requireOwnerOrAdmin } from "../lib/admin-caller.js";
import { CreemMode, type CreemModeValue, configuredCreemModes } from "../lib/creem-config.js";
import { resetCreemCatalogCache } from "../services/creem-catalog.js";
import {
  archiveCreemProduct,
  CreemProductError,
  createCreemProduct,
  updateCreemProductPrice,
} from "../services/creem-products.js";
import { getSellingMode, SellingModeRefusal, setSellingMode } from "../services/creem-selling-mode.js";
import { BillingInterval, draftCreemProductFor, isBillingInterval } from "../services/tier-creem-draft.js";

/** Longest Creem product id we accept when attaching one created elsewhere. */
const MAX_CREEM_PRODUCT_ID_LENGTH = 128;

/**
 * A Creem product id as Creem issues them: a `prod_` prefix and an
 * alphanumeric body. Constrained here because the value reaches a URL path on
 * its way to Creem.
 */
const CREEM_PRODUCT_ID_PATTERN = "^prod_[A-Za-z0-9]+$";

/** Schema for the three path parameters every per-product route takes. */
const productParamsSchema = {
  type: "object",
  required: ["tierId", "interval", "mode"],
  additionalProperties: false,
  properties: {
    tierId: { type: "string", minLength: 1, maxLength: 64, pattern: "^[A-Za-z0-9_-]+$" },
    interval: { type: "string", enum: ["month", "year"] },
    mode: { type: "string", enum: [CreemMode.Test, CreemMode.Live] },
  },
} as const;

/**
 * Answers when the deployment holds no key for the environment a write names.
 *
 * This is the fail-closed half of letting the interface choose an environment:
 * without a key the only alternatives are reaching the other account or
 * pretending the write happened, and both are worse than a refusal.
 *
 * @param reply - The reply to answer on.
 * @param mode - The environment the request named.
 * @returns The reply when there is no key, or `null` when the write may go on.
 */
function refuseUnreachableMode(reply: FastifyReply, mode: CreemModeValue): FastifyReply | null {
  if (configuredCreemModes().includes(mode)) return null;
  return reply.status(409).send({
    error: `This deployment holds no Creem key for the ${mode} environment`,
    code: "MC-BILL-0006",
  });
}

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

/**
 * Every enabled paid plan and interval that needs a Creem product, with the
 * environments it already has one in.
 *
 * A disabled plan is left out because nobody can buy it, and a free one
 * because it has no product by design. What remains is exactly the set that
 * decides whether an environment is ready to sell from.
 *
 * @returns One entry per plan and interval that must be sellable.
 */
async function sellablePlanProducts(): Promise<{ label: string; modes: CreemModeValue[] }[]> {
  const repo = await getTierRepository();
  const [tiers, mappings] = await Promise.all([repo.listTiers(), repo.listAllCreemProductMappings()]);

  const needed: { label: string; modes: CreemModeValue[] }[] = [];
  for (const tier of tiers) {
    if (!tier.enabled) continue;
    for (const interval of [BillingInterval.Month, BillingInterval.Year]) {
      if (!draftCreemProductFor(tier, interval)) continue;
      needed.push({
        label: `${tier.name} (${interval})`,
        modes: mappings
          .filter((mapping) => mapping.tierId === tier.id && mapping.interval === interval)
          .map((mapping) => mapping.mode),
      });
    }
  }
  return needed;
}

/**
 * Which environments could be sold from right now, and what is missing in the
 * ones that could not.
 *
 * @returns One entry per environment.
 */
async function creemModeReadiness(): Promise<{ mode: CreemModeValue; hasKey: boolean; missingProducts: string[] }[]> {
  const configured = configuredCreemModes();
  const needed = await sellablePlanProducts();
  return Object.values(CreemMode).map((mode) => ({
    mode,
    hasKey: configured.includes(mode),
    missingProducts: needed.filter((entry) => !entry.modes.includes(mode)).map((entry) => entry.label),
  }));
}

export async function adminCreemProductRoutes(app: FastifyInstance) {
  /**
   * Lists every Creem product mapping, across both environments, so the tier
   * editor can show which one already has a product and which does not, along
   * with the environments this deployment holds a key for and can therefore
   * act on.
   */
  app.get(ENDPOINTS.admin.developer.creemProducts, async (request, reply) => {
    if (!(await requireOwnerOrAdmin(request, reply))) return;
    const repo = await getTierRepository();
    return { writableModes: configuredCreemModes(), products: await repo.listAllCreemProductMappings() };
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
          required: ["tierId", "interval", "mode"],
          additionalProperties: false,
          properties: {
            tierId: { type: "string", minLength: 1, maxLength: 64, pattern: "^[A-Za-z0-9_-]+$" },
            interval: { type: "string", enum: ["month", "year"] },
            mode: { type: "string", enum: [CreemMode.Test, CreemMode.Live] },
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
      const body = request.body as {
        tierId: string;
        interval: string;
        mode: CreemModeValue;
        creemProductId?: string;
      };
      if (!isBillingInterval(body.interval)) {
        return reply.status(400).send({ error: "interval must be month or year" });
      }

      const unreachable = refuseUnreachableMode(reply, body.mode);
      if (unreachable) return unreachable;

      const repo = await getTierRepository();
      const tier = (await repo.listTiers()).find((candidate) => candidate.id === body.tierId);
      if (!tier) return reply.status(404).send({ error: `Tier not found: ${body.tierId}` });

      const key: TierCreemProductKey = { tierId: body.tierId, interval: body.interval, mode: body.mode };

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
        product = await createCreemProduct(body.mode, draft);
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
      const params = request.params as { tierId: string; interval: string; mode: CreemModeValue };
      const { priceCents } = request.body as { priceCents: number };
      if (!isBillingInterval(params.interval)) {
        return reply.status(400).send({ error: "interval must be month or year" });
      }

      const unreachable = refuseUnreachableMode(reply, params.mode);
      if (unreachable) return unreachable;

      const repo = await getTierRepository();
      const mapping = await repo.findCreemProductMapping({
        tierId: params.tierId,
        interval: params.interval,
        mode: params.mode,
      });
      if (!mapping) return reply.status(404).send({ error: "No product for that plan, interval and environment" });

      try {
        const product = await updateCreemProductPrice(params.mode, mapping.creemProductId, priceCents);
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
      const params = request.params as { tierId: string; interval: string; mode: CreemModeValue };
      if (!isBillingInterval(params.interval)) {
        return reply.status(400).send({ error: "interval must be month or year" });
      }

      const unreachable = refuseUnreachableMode(reply, params.mode);
      if (unreachable) return unreachable;

      const repo = await getTierRepository();
      const key: TierCreemProductKey = { tierId: params.tierId, interval: params.interval, mode: params.mode };
      const mapping = await repo.findCreemProductMapping(key);
      if (!mapping) return reply.status(404).send({ error: "No product for that plan, interval and environment" });

      try {
        await archiveCreemProduct(params.mode, mapping.creemProductId);
      } catch (error) {
        return replyWithCreemFailure(reply, error, 502);
      }

      await repo.deleteCreemProductMapping(key);
      return reply.status(204).send();
    },
  );

  /**
   * Reads which Creem environment the shop sells from, and what would have to
   * be true for each environment to be selectable.
   *
   * The dashboard needs all of it at once, because a switch that simply
   * refuses tells an operator nothing about what to do next.
   */
  app.get(ENDPOINTS.admin.developer.creemSellingMode, async (request, reply) => {
    if (!(await requireOwner(request, reply))) return;
    return {
      sellingMode: await getSellingMode(),
      configuredModes: configuredCreemModes(),
      readiness: await creemModeReadiness(),
    };
  });

  /**
   * Moves the shop to another Creem environment.
   *
   * Owner-only rather than admin-only, because this is the one setting whose
   * change decides whether a purchase charges a real card.
   */
  app.patch(
    ENDPOINTS.admin.developer.creemSellingMode,
    {
      schema: {
        body: {
          type: "object",
          required: ["sellingMode"],
          additionalProperties: false,
          properties: { sellingMode: { type: "string", enum: [CreemMode.Test, CreemMode.Live] } },
        },
      },
    },
    async (request, reply) => {
      if (!(await requireOwner(request, reply))) return;
      const { sellingMode } = request.body as { sellingMode: CreemModeValue };

      const refusal = await setSellingMode(sellingMode, await sellablePlanProducts());
      if (refusal) {
        return reply.status(409).send({
          error:
            refusal.refusal === SellingModeRefusal.NoKey
              ? `This deployment holds no Creem key for the ${sellingMode} environment`
              : `These plans have no ${sellingMode} product yet: ${refusal.missing.join(", ")}`,
          code: refusal.refusal === SellingModeRefusal.NoKey ? "MC-BILL-0006" : "MC-BILL-0007",
          missing: refusal.missing,
        });
      }

      // The catalogue behind the pricing page caches for five minutes. Without
      // this the page would go on quoting the previous environment's prices
      // long after the switch, which is the whole point of the switch. The
      // cache is per process, so a second instance still waits out its own TTL.
      resetCreemCatalogCache();

      return { sellingMode: await getSellingMode(), configuredModes: configuredCreemModes() };
    },
  );
}
