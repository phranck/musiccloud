/**
 * @file The admin surface of the donations ledger: list, record, change,
 * remove, and the sums the dashboard charts.
 *
 * Every route admits an owner or an admin, the roles that keep the books;
 * `authenticateAdmin` alone would admit moderators too. A body is held to the
 * shared request schema, and its day is checked against the calendar, because
 * a pattern cannot tell 2026-02-30 from a real day.
 */

import {
  DONATION_INPUT_SCHEMA,
  type DonationInput,
  ENDPOINTS,
  isCalendarDay,
  ROUTE_TEMPLATES,
} from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { requireOwnerOrAdmin } from "../lib/admin-caller.js";
import { replyWithApiError } from "../lib/infra/api-error-handler.js";
import {
  createDonation,
  deleteDonation,
  listDonations,
  readDonationTotals,
  updateDonation,
} from "../services/donations.js";

/** Longest donation id the routes accept: 64 characters, well above a nanoid's 21. */
const DONATION_ID_MAX_LENGTH = 64;

/** The `:id` parameter: the characters a nanoid uses. */
const donationParamsSchema = {
  type: "object",
  required: ["id"],
  additionalProperties: false,
  properties: { id: { type: "string", minLength: 1, maxLength: DONATION_ID_MAX_LENGTH, pattern: "^[A-Za-z0-9_-]+$" } },
} as const;

/** The largest body a donation write accepts: 4 KiB, well above the longest note and name. */
const DONATION_BODY_LIMIT_BYTES = 4 * 1024;

/**
 * Registers the ledger's routes on the admin scope, whose `authenticateAdmin`
 * hook has already checked the token.
 *
 * @param app - The admin scope.
 */
export async function adminDonationRoutes(app: FastifyInstance) {
  /** The ledger, newest first. */
  app.get(ENDPOINTS.admin.sponsoring.donations, async (request, reply) => {
    if (!(await requireOwnerOrAdmin(request, reply))) return;
    return listDonations();
  });

  /** The sums for the funding year, the last month, and the income chart. */
  app.get(ENDPOINTS.admin.sponsoring.donationTotals, async (request, reply) => {
    if (!(await requireOwnerOrAdmin(request, reply))) return;
    return readDonationTotals();
  });

  /** Records a donation entered by hand. */
  app.post(
    ENDPOINTS.admin.sponsoring.donations,
    { schema: { body: DONATION_INPUT_SCHEMA }, bodyLimit: DONATION_BODY_LIMIT_BYTES },
    async (request, reply) => {
      if (!(await requireOwnerOrAdmin(request, reply))) return;
      const input = request.body as DonationInput;
      if (!isCalendarDay(input.receivedOn)) return replyWithApiError(reply, "MC-REQ-0001");
      return reply.status(201).send(await createDonation(input));
    },
  );

  /** Changes a donation. */
  app.put(
    ROUTE_TEMPLATES.admin.sponsoring.donationDetail,
    {
      schema: { params: donationParamsSchema, body: DONATION_INPUT_SCHEMA },
      bodyLimit: DONATION_BODY_LIMIT_BYTES,
    },
    async (request, reply) => {
      if (!(await requireOwnerOrAdmin(request, reply))) return;
      const { id } = request.params as { id: string };
      const input = request.body as DonationInput;
      if (!isCalendarDay(input.receivedOn)) return replyWithApiError(reply, "MC-REQ-0001");
      const donation = await updateDonation(id, input);
      if (!donation) return replyWithApiError(reply, "MC-RES-0003");
      return donation;
    },
  );

  /** Removes a donation. */
  app.delete(
    ROUTE_TEMPLATES.admin.sponsoring.donationDetail,
    { schema: { params: donationParamsSchema } },
    async (request, reply) => {
      if (!(await requireOwnerOrAdmin(request, reply))) return;
      const { id } = request.params as { id: string };
      if (!(await deleteDonation(id))) return replyWithApiError(reply, "MC-RES-0003");
      return reply.status(204).send();
    },
  );
}
