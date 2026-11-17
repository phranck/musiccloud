/**
 * @file The admin surface of the annual sponsors: list, record, change and
 * remove.
 *
 * Every route admits an owner or an admin, the roles that keep the books, as
 * the donations ledger does. A body is held to the shared request schema, and
 * what a schema cannot check, that every profile address parses and that the
 * day paid exists, is checked by `isSponsorInputValid` before anything is
 * written.
 */

import {
  ENDPOINTS,
  isSponsorInputValid,
  RECORD_ID_PARAMS_SCHEMA,
  ROUTE_TEMPLATES,
  SPONSOR_INPUT_SCHEMA,
  type SponsorInput,
} from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { requireOwnerOrAdmin } from "../lib/admin-caller.js";
import { replyWithApiError } from "../lib/infra/api-error-handler.js";
import { createSponsor, deleteSponsor, listSponsors, updateSponsor } from "../services/sponsors.js";

/**
 * The largest body a sponsor write accepts: 16 KiB, above the longest name,
 * eight of the longest addresses and the longest sentence together.
 */
const SPONSOR_BODY_LIMIT_BYTES = 16 * 1024;

/**
 * Registers the sponsors' routes on the admin scope, whose `authenticateAdmin`
 * hook has already checked the token.
 *
 * @param app - The admin scope.
 */
export async function adminSponsorRoutes(app: FastifyInstance) {
  /** Every sponsor, current or past, with the amount linked to each. */
  app.get(ENDPOINTS.admin.sponsoring.sponsors, async (request, reply) => {
    if (!(await requireOwnerOrAdmin(request, reply))) return;
    return listSponsors();
  });

  /** Records a sponsor. */
  app.post(
    ENDPOINTS.admin.sponsoring.sponsors,
    { schema: { body: SPONSOR_INPUT_SCHEMA }, bodyLimit: SPONSOR_BODY_LIMIT_BYTES },
    async (request, reply) => {
      if (!(await requireOwnerOrAdmin(request, reply))) return;
      const input = request.body as SponsorInput;
      if (!isSponsorInputValid(input)) return replyWithApiError(reply, "MC-REQ-0001");
      return reply.status(201).send(await createSponsor(input));
    },
  );

  /** Changes a sponsor. */
  app.put(
    ROUTE_TEMPLATES.admin.sponsoring.sponsorDetail,
    {
      schema: { params: RECORD_ID_PARAMS_SCHEMA, body: SPONSOR_INPUT_SCHEMA },
      bodyLimit: SPONSOR_BODY_LIMIT_BYTES,
    },
    async (request, reply) => {
      if (!(await requireOwnerOrAdmin(request, reply))) return;
      const { id } = request.params as { id: string };
      const input = request.body as SponsorInput;
      if (!isSponsorInputValid(input)) return replyWithApiError(reply, "MC-REQ-0001");
      const sponsor = await updateSponsor(id, input);
      if (!sponsor) return replyWithApiError(reply, "MC-RES-0003");
      return sponsor;
    },
  );

  /** Removes a sponsor; the payments linked to them stay in the ledger. */
  app.delete(
    ROUTE_TEMPLATES.admin.sponsoring.sponsorDetail,
    { schema: { params: RECORD_ID_PARAMS_SCHEMA } },
    async (request, reply) => {
      if (!(await requireOwnerOrAdmin(request, reply))) return;
      const { id } = request.params as { id: string };
      if (!(await deleteSponsor(id))) return replyWithApiError(reply, "MC-RES-0003");
      return reply.status(204).send();
    },
  );
}
