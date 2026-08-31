/**
 * @file The admin surface for what a plan costs.
 *
 * An offer is one thing a customer can buy, and it carries every field Creem
 * accepts for a product. Keeping them here rather than deriving them from the
 * plan is the point: a product at Creem then shows what somebody entered
 * instead of what our code assumed.
 *
 * Changing an offer does not change the product already at Creem. That is a
 * separate act with its own route, because a price at Creem is what a customer
 * is charged and it may not move as a side effect of an edit.
 */

import { ROUTE_TEMPLATES } from "@musiccloud/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import { getTierRepository } from "../db/index.js";
import {
  BillingPeriod,
  OfferCurrency,
  TaxCategory,
  TaxMode,
  type TierOfferCreateData,
  type TierOfferUpdateData,
} from "../db/tiers-repository.js";
import { requireOwnerOrAdmin } from "../lib/admin-caller.js";
import { isAllowedPublicUrl } from "../lib/public-origins.js";

/** Creem accepts at most three extra questions at the checkout. */
const MAX_CUSTOM_FIELDS = 3;

/** The largest amount an offer may name, as a guard against a typed zero too many. */
const MAX_PRICE_CENTS = 100_000_000;

/** One extra checkout question, as the request may state it. */
const customFieldSchema = {
  type: "object",
  required: ["key", "label", "optional"],
  additionalProperties: false,
  properties: {
    key: { type: "string", minLength: 1, maxLength: 64, pattern: "^[a-z][a-z0-9_]*$" },
    label: { type: "string", minLength: 1, maxLength: 120 },
    optional: { type: "boolean" },
  },
} as const;

/**
 * Every field an offer carries, as the request may state it.
 *
 * The two URL fields are constrained twice: by shape here, and by destination
 * in the handler, because a schema can say a URL is well formed and not where
 * it points.
 */
const offerFieldsSchema = {
  billingPeriod: { type: "string", enum: Object.values(BillingPeriod) },
  priceCents: { type: "integer", minimum: 100, maximum: MAX_PRICE_CENTS },
  currency: { type: "string", enum: Object.values(OfferCurrency) },
  taxMode: { type: ["string", "null"], enum: [...Object.values(TaxMode), null] },
  taxCategory: { type: ["string", "null"], enum: [...Object.values(TaxCategory), null] },
  imageUrl: { type: ["string", "null"], maxLength: 2048 },
  successUrl: { type: ["string", "null"], maxLength: 2048 },
  customFields: { type: "array", maxItems: MAX_CUSTOM_FIELDS, items: customFieldSchema },
  abandonedCartRecovery: { type: "boolean" },
  payWhatYouWant: { type: "boolean" },
  suggestedPriceCents: { type: ["integer", "null"], minimum: 100, maximum: MAX_PRICE_CENTS },
  sortOrder: { type: "integer", minimum: 0, maximum: 999 },
} as const;

/** The identifier of a plan or an offer, as it may appear in a path. */
const idSchema = { type: "string", minLength: 1, maxLength: 64, pattern: "^[A-Za-z0-9_:-]+$" } as const;

/**
 * Refuses a URL that does not point at one of our own origins.
 *
 * @param reply - The reply to answer on.
 * @param field - Which field is being checked, for the message.
 * @param value - The URL, or `null` or `undefined` when there is none.
 * @returns The reply when the URL is refused, or `null` when it may stand.
 */
function refuseForeignUrl(reply: FastifyReply, field: string, value: string | null | undefined): FastifyReply | null {
  if (value === null || value === undefined || value === "") return null;
  if (isAllowedPublicUrl(value)) return null;
  return reply.status(400).send({
    error: `${field} must be an https address on one of this deployment's own origins`,
    code: "MC-BILL-0008",
  });
}

/**
 * Refuses both URL fields of a body in one step.
 *
 * @param reply - The reply to answer on.
 * @param body - The request body, whichever fields it carries.
 * @returns The reply when either URL is refused, or `null`.
 */
function refuseForeignUrls(
  reply: FastifyReply,
  body: { imageUrl?: string | null; successUrl?: string | null },
): FastifyReply | null {
  return refuseForeignUrl(reply, "imageUrl", body.imageUrl) ?? refuseForeignUrl(reply, "successUrl", body.successUrl);
}

export async function adminPlanOfferRoutes(app: FastifyInstance) {
  /** Every offer of one plan, in the order it is shown. */
  app.get(
    ROUTE_TEMPLATES.admin.developer.planOffers,
    {
      schema: {
        params: { type: "object", required: ["tierId"], additionalProperties: false, properties: { tierId: idSchema } },
      },
    },
    async (request, reply) => {
      if (!(await requireOwnerOrAdmin(request, reply))) return;
      const { tierId } = request.params as { tierId: string };
      return (await getTierRepository()).listOffers(tierId);
    },
  );

  /**
   * Adds an offer to a plan.
   *
   * Nothing reaches Creem here. An offer is what we intend to sell; the
   * product at Creem is created afterwards, deliberately, from the Creem
   * section of the same page.
   */
  app.post(
    ROUTE_TEMPLATES.admin.developer.planOffers,
    {
      schema: {
        params: { type: "object", required: ["tierId"], additionalProperties: false, properties: { tierId: idSchema } },
        body: {
          type: "object",
          required: ["billingPeriod", "priceCents"],
          additionalProperties: false,
          properties: offerFieldsSchema,
        },
      },
    },
    async (request, reply) => {
      if (!(await requireOwnerOrAdmin(request, reply))) return;
      const { tierId } = request.params as { tierId: string };
      const body = request.body as Partial<TierOfferCreateData>;

      const foreign = refuseForeignUrls(reply, body);
      if (foreign) return foreign;

      const repo = await getTierRepository();
      const tier = (await repo.listTiers()).find((candidate) => candidate.id === tierId);
      if (!tier) return reply.status(404).send({ error: `Plan not found: ${tierId}` });

      const period = body.billingPeriod!;
      if ((await repo.listOffers(tierId)).some((offer) => offer.billingPeriod === period)) {
        return reply.status(409).send({
          error: "This plan is already sold over that billing period",
          code: "MC-BILL-0009",
        });
      }

      // Every field is named rather than spread from the body, so a property
      // the schema has not seen cannot reach a column.
      const offer = await repo.createOffer({
        tierId,
        billingPeriod: period,
        priceCents: body.priceCents!,
        currency: body.currency ?? OfferCurrency.Eur,
        taxMode: body.taxMode ?? null,
        taxCategory: body.taxCategory ?? null,
        imageUrl: body.imageUrl ?? null,
        successUrl: body.successUrl ?? null,
        customFields: body.customFields ?? [],
        abandonedCartRecovery: body.abandonedCartRecovery ?? false,
        payWhatYouWant: body.payWhatYouWant ?? false,
        suggestedPriceCents: body.suggestedPriceCents ?? null,
        sortOrder: body.sortOrder ?? 0,
      });
      return reply.status(201).send(offer);
    },
  );

  /**
   * Changes an offer.
   *
   * The product already at Creem keeps its price until somebody changes it
   * there as well. Making an edit here move a live price would mean a customer
   * is charged differently because a form was saved.
   */
  app.patch(
    ROUTE_TEMPLATES.admin.developer.planOfferDetail,
    {
      schema: {
        params: { type: "object", required: ["id"], additionalProperties: false, properties: { id: idSchema } },
        body: { type: "object", additionalProperties: false, properties: offerFieldsSchema },
      },
    },
    async (request, reply) => {
      if (!(await requireOwnerOrAdmin(request, reply))) return;
      const { id } = request.params as { id: string };
      const body = request.body as TierOfferUpdateData;

      const foreign = refuseForeignUrls(reply, body);
      if (foreign) return foreign;

      return (await getTierRepository()).updateOffer(id, body);
    },
  );

  /**
   * Removes an offer, and with it every Creem product mapped to it.
   *
   * The products themselves stay at Creem. Archiving one is its own act with
   * its own route, and doing it silently here would leave an operator unable
   * to tell what had happened at the payment provider.
   */
  app.delete(
    ROUTE_TEMPLATES.admin.developer.planOfferDetail,
    {
      schema: {
        params: { type: "object", required: ["id"], additionalProperties: false, properties: { id: idSchema } },
      },
    },
    async (request, reply) => {
      if (!(await requireOwnerOrAdmin(request, reply))) return;
      const { id } = request.params as { id: string };
      await (await getTierRepository()).deleteOffer(id);
      return reply.status(204).send();
    },
  );
}
