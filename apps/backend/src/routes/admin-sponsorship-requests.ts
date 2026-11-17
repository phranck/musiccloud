/**
 * @file The admin surface of the sponsorship requests: list, take over into a
 * sponsor and a donation, and remove.
 *
 * Ported from lmaa.space (`apps/backend/src/routes/admin/pending-sponsorships.ts`).
 * Every route admits an owner or an admin, the roles that keep the books, as
 * the sponsor and donation routes do. A takeover body is held to the shared
 * schema and its day to the calendar.
 */

import {
  ENDPOINTS,
  isCalendarDay,
  PENDING_SPONSORSHIP_TAKEOVER_SCHEMA,
  type PendingSponsorshipTakeover,
  RECORD_ID_PARAMS_SCHEMA,
  ROUTE_TEMPLATES,
} from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { requireOwnerOrAdmin } from "../lib/admin-caller.js";
import { replyWithApiError } from "../lib/infra/api-error-handler.js";
import {
  deletePendingSponsorship,
  listPendingSponsorships,
  takeOverPendingSponsorship,
} from "../services/pending-sponsorships.js";

/** The largest takeover body: 1 KiB, far above an amount and a day. */
const TAKEOVER_BODY_LIMIT_BYTES = 1024;

/**
 * Registers the routes on the admin scope, whose `authenticateAdmin` hook has
 * already checked the token.
 *
 * @param app - The admin scope.
 */
export async function adminSponsorshipRequestRoutes(app: FastifyInstance) {
  /** Every request nobody has taken over yet, oldest first. */
  app.get(ENDPOINTS.admin.sponsoring.requests, async (request, reply) => {
    if (!(await requireOwnerOrAdmin(request, reply))) return;
    return listPendingSponsorships();
  });

  /** Turns one request into a sponsor and the payment linked to them. */
  app.post(
    ROUTE_TEMPLATES.admin.sponsoring.requestTakeover,
    {
      schema: { params: RECORD_ID_PARAMS_SCHEMA, body: PENDING_SPONSORSHIP_TAKEOVER_SCHEMA },
      bodyLimit: TAKEOVER_BODY_LIMIT_BYTES,
    },
    async (request, reply) => {
      if (!(await requireOwnerOrAdmin(request, reply))) return;
      const { id } = request.params as { id: string };
      const payment = request.body as PendingSponsorshipTakeover;
      if (!isCalendarDay(payment.paidOn)) return replyWithApiError(reply, "MC-REQ-0001");
      const result = await takeOverPendingSponsorship(id, payment);
      if (!result.ok) return replyWithApiError(reply, "MC-RES-0003");
      return reply.status(201).send(result.value);
    },
  );

  /** Removes one request. */
  app.delete(
    ROUTE_TEMPLATES.admin.sponsoring.requestDetail,
    { schema: { params: RECORD_ID_PARAMS_SCHEMA } },
    async (request, reply) => {
      if (!(await requireOwnerOrAdmin(request, reply))) return;
      const { id } = request.params as { id: string };
      if (!(await deletePendingSponsorship(id))) return replyWithApiError(reply, "MC-RES-0003");
      return reply.status(204).send();
    },
  );
}
