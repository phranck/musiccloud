/**
 * @file Announcing a sponsorship before paying for it:
 * `POST /api/v1/sponsorships` and `PUT /api/v1/sponsorships/:reference`.
 *
 * Ported from lmaa.space's `POST /api/sponsorships` and `PUT
 * /api/sponsorships/:reference` (`apps/backend/src/routes/public.ts`). A
 * transfer carries either a sentence or a reference and never both, so the
 * name, the address, the sentence and the consent to be named are said here,
 * and the payment carries only the reference these routes answer with.
 *
 * Public without a key, because the support page's form calls them through its
 * own proxy, and kept out of the developer reference (`hide`). Each route
 * admits {@link SPONSORSHIP_REQUESTS_PER_HOUR} requests an hour per address,
 * counted before the body is read, so a refused body counts as well. The count
 * follows the visitor's address that the proxy forwards, so the internal key
 * buys no exemption here. Nothing is cached.
 *
 * The reference is the credential that opens a request, so the `PUT` route
 * logs below `info`: Fastify's request log would otherwise write the path, and
 * with it the reference, for every correction. A refusal is still logged by
 * the error handler, which names the route's template and never the path.
 */

import {
  ENDPOINTS,
  formatCreditorReference,
  PENDING_SPONSORSHIP_BODY_MAX_BYTES,
  PENDING_SPONSORSHIP_INPUT_SCHEMA,
  type PendingSponsorship,
  type PendingSponsorshipInput,
  type PendingSponsorshipReceipt,
  ROUTE_TEMPLATES,
  SPONSORSHIP_REFERENCE_PARAMS_SCHEMA,
} from "@musiccloud/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import { replyWithApiError } from "../lib/infra/api-error-handler.js";
import {
  createPendingSponsorship,
  formatSponsorshipMinimum,
  SponsorshipRefusal,
  type SponsorshipRefusalValue,
  updatePendingSponsorship,
} from "../services/pending-sponsorships.js";

/**
 * Requests an hour each route admits from one address: 5. Each one writes a
 * person's name and sentence into a table where it stands for sixty days, and
 * filling the form in once and correcting it twice fits.
 */
export const SPONSORSHIP_REQUESTS_PER_HOUR = 5;

/** The rate limit both routes declare. */
const SPONSORSHIP_RATE_LIMIT = { max: SPONSORSHIP_REQUESTS_PER_HOUR, timeWindow: "1 hour" } as const;

/** No answer is cached, because each one belongs to one person's request. */
const SPONSORSHIP_CACHE_CONTROL = "no-store";

/** Fastify's log level for the `PUT` route, which keeps its path out of the request log. */
const REFERENCE_ROUTE_LOG_LEVEL = "warn";

/**
 * Turns a stored request into what the form is told.
 *
 * @param request - The request as stored.
 * @returns Its reference, compact and printed in groups of four.
 */
function toReceipt(request: PendingSponsorship): PendingSponsorshipReceipt {
  return { reference: request.reference, referenceFormatted: formatCreditorReference(request.reference) };
}

/**
 * Answers a refusal with its registry code.
 *
 * @param reply - The reply to answer on.
 * @param reason - Why the service refused.
 * @param minimumCents - The minimum, which the message of `amount_too_low` names.
 * @returns The reply.
 */
function replyWithRefusal(reply: FastifyReply, reason: SponsorshipRefusalValue, minimumCents = 0): FastifyReply {
  switch (reason) {
    case SponsorshipRefusal.AmountTooLow:
      return replyWithApiError(reply, "MC-REQ-0012", {
        context: { minimum: formatSponsorshipMinimum(minimumCents) },
      });
    case SponsorshipRefusal.Unusable:
      return replyWithApiError(reply, "MC-REQ-0013");
    case SponsorshipRefusal.ReferenceUnavailable:
      return replyWithApiError(reply, "MC-SYS-0004");
    case SponsorshipRefusal.NotFound:
      return replyWithApiError(reply, "MC-RES-0003");
  }
}

/**
 * Registers both routes at the root scope, outside every auth hook.
 *
 * @param app - The root Fastify instance.
 */
export default async function publicSponsorshipRoutes(app: FastifyInstance) {
  app.post(
    ENDPOINTS.v1.sponsorships,
    {
      schema: { hide: true, body: PENDING_SPONSORSHIP_INPUT_SCHEMA },
      bodyLimit: PENDING_SPONSORSHIP_BODY_MAX_BYTES,
      config: { rateLimit: SPONSORSHIP_RATE_LIMIT },
    },
    async (request, reply) => {
      reply.header("Cache-Control", SPONSORSHIP_CACHE_CONTROL);
      const result = await createPendingSponsorship(request.body as PendingSponsorshipInput);
      if (!result.ok) return replyWithRefusal(reply, result.reason, result.minimumCents);
      return reply.status(201).send(toReceipt(result.value));
    },
  );

  app.put(
    ROUTE_TEMPLATES.v1.sponsorshipDetail,
    {
      schema: { hide: true, params: SPONSORSHIP_REFERENCE_PARAMS_SCHEMA, body: PENDING_SPONSORSHIP_INPUT_SCHEMA },
      bodyLimit: PENDING_SPONSORSHIP_BODY_MAX_BYTES,
      config: { rateLimit: SPONSORSHIP_RATE_LIMIT },
      logLevel: REFERENCE_ROUTE_LOG_LEVEL,
    },
    async (request, reply) => {
      reply.header("Cache-Control", SPONSORSHIP_CACHE_CONTROL);
      const { reference } = request.params as { reference: string };
      const result = await updatePendingSponsorship(reference, request.body as PendingSponsorshipInput);
      if (!result.ok) return replyWithRefusal(reply, result.reason, result.minimumCents);
      return toReceipt(result.value);
    },
  );
}
