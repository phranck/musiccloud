/**
 * @file The admin surface of the donations ledger: list, record, change,
 * remove, and the sums the dashboard charts.
 *
 * Every route admits an owner or an admin, the roles that keep the books;
 * `authenticateAdmin` alone would admit moderators too. A body is held to the
 * shared request schema, its day is checked against the calendar, because a
 * pattern cannot tell 2026-02-30 from a real day, and a linked sponsor must
 * exist.
 */

import {
  DONATION_INPUT_SCHEMA,
  type DonationInput,
  ENDPOINTS,
  isCalendarDay,
  RECORD_ID_PARAMS_SCHEMA,
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
import { sponsorExists } from "../services/sponsors.js";

/** The largest body a donation write accepts: 4 KiB, well above the longest note and name. */
const DONATION_BODY_LIMIT_BYTES = 4 * 1024;

/**
 * Checks what the request schema cannot: that the day exists and that a
 * linked sponsor does.
 *
 * @param input - A donation that already passed the request schema.
 * @returns `true` when the donation may be stored.
 */
async function isDonationInputValid(input: DonationInput): Promise<boolean> {
  if (!isCalendarDay(input.receivedOn)) return false;
  return input.sponsorId === null || (await sponsorExists(input.sponsorId));
}

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
      if (!(await isDonationInputValid(input))) return replyWithApiError(reply, "MC-REQ-0001");
      return reply.status(201).send(await createDonation(input));
    },
  );

  /** Changes a donation. */
  app.put(
    ROUTE_TEMPLATES.admin.sponsoring.donationDetail,
    {
      schema: { params: RECORD_ID_PARAMS_SCHEMA, body: DONATION_INPUT_SCHEMA },
      bodyLimit: DONATION_BODY_LIMIT_BYTES,
    },
    async (request, reply) => {
      if (!(await requireOwnerOrAdmin(request, reply))) return;
      const { id } = request.params as { id: string };
      const input = request.body as DonationInput;
      if (!(await isDonationInputValid(input))) return replyWithApiError(reply, "MC-REQ-0001");
      const donation = await updateDonation(id, input);
      if (!donation) return replyWithApiError(reply, "MC-RES-0003");
      return donation;
    },
  );

  /** Removes a donation. */
  app.delete(
    ROUTE_TEMPLATES.admin.sponsoring.donationDetail,
    { schema: { params: RECORD_ID_PARAMS_SCHEMA } },
    async (request, reply) => {
      if (!(await requireOwnerOrAdmin(request, reply))) return;
      const { id } = request.params as { id: string };
      if (!(await deleteDonation(id))) return replyWithApiError(reply, "MC-RES-0003");
      return reply.status(204).send();
    },
  );
}
