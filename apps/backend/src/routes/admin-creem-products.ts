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
 *
 * Every write that changes what Creem sells resets the pricing page's
 * catalogue cache once it has succeeded: attaching, creating, repricing,
 * archiving and the selling switch here, and deleting an offer or a plan in
 * their own routes. The reset follows the mapping write rather than preceding
 * it, so a read in between cannot cache the old mapping again. It lives in
 * the routes because `creem-catalog.ts` imports the selling-mode service, and
 * the service resetting the catalogue would make the two import each other.
 */

import { ENDPOINTS, ROUTE_TEMPLATES } from "@musiccloud/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import { getTierRepository } from "../db/index.js";
import type { BillingPeriodValue, TierCreemProductKey, TierOffer, TierRepository } from "../db/tiers-repository.js";
import { BillingPeriod, tierIdSchema } from "../db/tiers-repository.js";
import { requireOwner, requireOwnerOrAdmin } from "../lib/admin-caller.js";
import { CreemMode, type CreemModeValue, configuredCreemModes } from "../lib/creem-config.js";
import { replyWithApiError } from "../lib/infra/api-error-handler.js";
import { resetCreemCatalogCache } from "../services/creem-catalog.js";
import {
  archiveCreemProduct,
  CreemProductError,
  createCreemProduct,
  updateCreemProductPrice,
} from "../services/creem-products.js";
import {
  getSellingMode,
  SellingModeRefusal,
  sellingModeReadiness,
  setSellingMode,
} from "../services/creem-selling-mode.js";
import { draftCreemProductForOffer, isBillingPeriod } from "../services/tier-creem-draft.js";

/** Longest Creem product id we accept when attaching one created elsewhere. */
const MAX_CREEM_PRODUCT_ID_LENGTH = 128;

/**
 * A Creem product id as Creem issues them: a `prod_` prefix and an
 * alphanumeric body. Constrained here because the value reaches a URL path on
 * its way to Creem.
 */
const CREEM_PRODUCT_ID_PATTERN = "^prod_[A-Za-z0-9]+$";

/**
 * The three properties that name one product: the plan, the billing period it
 * sells over, and the Creem environment. They are a product's path parameters
 * and the body of a new one alike.
 */
const productKeyProperties = {
  tierId: tierIdSchema,
  billingPeriod: { type: "string", enum: Object.values(BillingPeriod) },
  mode: { type: "string", enum: Object.values(CreemMode) },
} as const;

/** Schema for the three path parameters every per-product route takes. */
const productParamsSchema = {
  type: "object",
  required: ["tierId", "billingPeriod", "mode"],
  additionalProperties: false,
  properties: productKeyProperties,
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
  return replyWithApiError(reply, "MC-BILL-0006", { context: { mode } });
}

/**
 * Answers with the MC code a failed Creem operation carries, or re-throws.
 *
 * The codes come from the throw rather than from the route, so the mapping
 * between a Creem failure and what the operator is told is stated once.
 *
 * @param reply - The reply to answer on.
 * @param error - Whatever the operation threw. Its code also decides the status.
 * @returns The reply, so a handler can `return` it.
 * @throws The original error when it is not a Creem product failure, so the
 *   global handler classifies it rather than this route guessing.
 */
function replyWithCreemFailure(reply: FastifyReply, error: unknown): FastifyReply {
  if (!(error instanceof CreemProductError)) throw error;
  return replyWithApiError(reply, error.code);
}

/**
 * The offer a plan sells over one billing period.
 *
 * A Creem product is created from this offer and repriced to its amount, so
 * both routes read it the same way.
 *
 * @param repo - The tier repository.
 * @param tierId - The plan.
 * @param billingPeriod - The billing period the product sells over.
 * @returns The offer, or `undefined` when the plan sells nothing over that period.
 */
async function findOffer(
  repo: TierRepository,
  tierId: string,
  billingPeriod: BillingPeriodValue,
): Promise<TierOffer | undefined> {
  return (await repo.listOffers(tierId)).find((offer) => offer.billingPeriod === billingPeriod);
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
          required: ["tierId", "billingPeriod", "mode"],
          additionalProperties: false,
          properties: {
            ...productKeyProperties,
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
        billingPeriod: string;
        mode: CreemModeValue;
        creemProductId?: string;
      };
      if (!isBillingPeriod(body.billingPeriod)) {
        return reply.status(400).send({ error: "billingPeriod must be one Creem sells over" });
      }

      const unreachable = refuseUnreachableMode(reply, body.mode);
      if (unreachable) return unreachable;

      const repo = await getTierRepository();
      const tier = (await repo.listTiers()).find((candidate) => candidate.id === body.tierId);
      if (!tier) return reply.status(404).send({ error: `Plan not found: ${body.tierId}` });

      const key: TierCreemProductKey = { tierId: body.tierId, billingPeriod: body.billingPeriod, mode: body.mode };

      if (await repo.findCreemProductMapping(key)) {
        return replyWithApiError(reply, "MC-BILL-0004");
      }

      // Attaching an id created in the Creem dashboard skips the draft
      // entirely, because whoever made it there chose its name and price.
      if (body.creemProductId) {
        await repo.createCreemProductMapping({ ...key, creemProductId: body.creemProductId });
        resetCreemCatalogCache();
        return reply.status(201).send({ ...key, creemProductId: body.creemProductId });
      }

      // The product is built from the offer, so everything Creem receives was
      // entered by somebody rather than derived from the plan.
      const offer = await findOffer(repo, body.tierId, body.billingPeriod);
      if (!offer) {
        return replyWithApiError(reply, "MC-BILL-0005");
      }
      const draft = draftCreemProductForOffer(tier, offer);

      let product: Awaited<ReturnType<typeof createCreemProduct>>;
      try {
        product = await createCreemProduct(body.mode, draft);
      } catch (error) {
        return replyWithCreemFailure(reply, error);
      }

      // The product exists at Creem from here on. If this insert fails the
      // product is real and unreferenced, which is why the conflict above is
      // checked before creating rather than after.
      await repo.createCreemProductMapping({ ...key, creemProductId: product.id });
      resetCreemCatalogCache();
      return reply.status(201).send({ ...key, creemProductId: product.id, price: product.price });
    },
  );

  /**
   * Applies the offer's amount to the product at Creem.
   *
   * The offer is the only place a plan's price is entered. Changing it there
   * changes what the pricing page falls back to, and this route is the
   * separate act that makes Creem charge the same amount, so the request
   * carries no price of its own. The product keeps its id, so the mapping row
   * stays valid and every existing subscription keeps pointing at the same
   * product.
   */
  app.patch(
    ROUTE_TEMPLATES.admin.developer.creemProductDetail,
    { schema: { params: productParamsSchema } },
    async (request, reply) => {
      if (!(await requireOwnerOrAdmin(request, reply))) return;
      const params = request.params as { tierId: string; billingPeriod: string; mode: CreemModeValue };
      if (!isBillingPeriod(params.billingPeriod)) {
        return reply.status(400).send({ error: "billingPeriod must be one Creem sells over" });
      }

      const unreachable = refuseUnreachableMode(reply, params.mode);
      if (unreachable) return unreachable;

      const repo = await getTierRepository();
      const offer = await findOffer(repo, params.tierId, params.billingPeriod);
      if (!offer) {
        return replyWithApiError(reply, "MC-BILL-0005");
      }
      const mapping = await repo.findCreemProductMapping({
        tierId: params.tierId,
        billingPeriod: params.billingPeriod,
        mode: params.mode,
      });
      if (!mapping) return reply.status(404).send({ error: "No product for that plan, interval and environment" });

      let product: Awaited<ReturnType<typeof updateCreemProductPrice>>;
      try {
        product = await updateCreemProductPrice(params.mode, mapping.creemProductId, offer.priceCents);
      } catch (error) {
        return replyWithCreemFailure(reply, error);
      }
      resetCreemCatalogCache();
      return { ...mapping, price: product.price, currency: product.currency };
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
      const params = request.params as { tierId: string; billingPeriod: string; mode: CreemModeValue };
      if (!isBillingPeriod(params.billingPeriod)) {
        return reply.status(400).send({ error: "billingPeriod must be one Creem sells over" });
      }

      const unreachable = refuseUnreachableMode(reply, params.mode);
      if (unreachable) return unreachable;

      const repo = await getTierRepository();
      const key: TierCreemProductKey = {
        tierId: params.tierId,
        billingPeriod: params.billingPeriod,
        mode: params.mode,
      };
      const mapping = await repo.findCreemProductMapping(key);
      if (!mapping) return reply.status(404).send({ error: "No product for that plan, interval and environment" });

      try {
        await archiveCreemProduct(params.mode, mapping.creemProductId);
      } catch (error) {
        return replyWithCreemFailure(reply, error);
      }

      await repo.deleteCreemProductMapping(key);
      // An archived product still answers with its price, so a cached
      // catalogue would go on quoting a product nobody can buy.
      resetCreemCatalogCache();
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
      readiness: await sellingModeReadiness(),
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
          properties: { sellingMode: { type: "string", enum: Object.values(CreemMode) } },
        },
      },
    },
    async (request, reply) => {
      if (!(await requireOwner(request, reply))) return;
      const { sellingMode } = request.body as { sellingMode: CreemModeValue };

      const refusal = await setSellingMode(sellingMode);
      if (refusal) {
        return refusal.refusal === SellingModeRefusal.NoKey
          ? replyWithApiError(reply, "MC-BILL-0006", { context: { mode: sellingMode } })
          : replyWithApiError(reply, "MC-BILL-0007", {
              context: { mode: sellingMode, plans: refusal.missing.join(", ") },
              extra: { missing: refusal.missing },
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
