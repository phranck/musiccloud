/**
 * @file The admin surface of the annual sponsors: list, record, change and
 * remove.
 *
 * Every route admits an owner or an admin, the roles that keep the books, as
 * the donations ledger does. A body is held to the shared request schema, and
 * `normalizeSponsorInput` then brings every profile address into its canonical
 * form and refuses what a schema cannot check: an address that does not fit
 * its platform and a day paid that does not exist.
 *
 * One more route finds the picture behind a sponsor's profiles before the card
 * is saved, copies it and answers the copy's id, which the card then saves
 * with the sponsor.
 */

import {
  ENDPOINTS,
  normalizeSocialMediaLinks,
  normalizeSponsorInput,
  RECORD_ID_PARAMS_SCHEMA,
  ROUTE_TEMPLATES,
  type SocialMediaLinks,
  SPONSOR_AVATAR_REQUEST_SCHEMA,
  SPONSOR_INPUT_SCHEMA,
  type SponsorAvatarResult,
  type SponsorInput,
} from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { requireOwnerOrAdmin } from "../lib/admin-caller.js";
import { replyWithApiError } from "../lib/infra/api-error-handler.js";
import { resolveSponsorAvatar } from "../services/sponsor-avatar.js";
import { copySponsorAvatar } from "../services/sponsor-avatar-copy.js";
import { sponsorAvatarExists } from "../services/sponsor-avatars.js";
import { createSponsor, deleteSponsor, listSponsors, updateSponsor } from "../services/sponsors.js";

/**
 * The largest body a sponsor write accepts: 16 KiB, above the longest name,
 * eight of the longest addresses and the longest sentence together.
 */
const SPONSOR_BODY_LIMIT_BYTES = 16 * 1024;

/**
 * Brings a body into the form it is stored in, as `normalizeSponsorInput`
 * does, and refuses a picture that is not stored.
 *
 * @param body - A body that passed the request schema.
 * @returns The sponsor to store, or `null` when it is refused.
 */
async function acceptSponsorInput(body: SponsorInput): Promise<SponsorInput | null> {
  const input = normalizeSponsorInput(body);
  if (!input) return null;
  if (input.avatarId !== null && !(await sponsorAvatarExists(input.avatarId))) return null;
  return input;
}

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
      const input = await acceptSponsorInput(request.body as SponsorInput);
      if (!input) return replyWithApiError(reply, "MC-REQ-0001");
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
      const input = await acceptSponsorInput(request.body as SponsorInput);
      if (!input) return replyWithApiError(reply, "MC-REQ-0001");
      const sponsor = await updateSponsor(id, input);
      if (!sponsor) return replyWithApiError(reply, "MC-RES-0003");
      return sponsor;
    },
  );

  /**
   * Finds the picture behind the profiles, copies it into musiccloud's store
   * and answers the copy's id, or `null` when no profile led to a picture that
   * could be read. Every outbound request goes through `fetchWithTimeout`, so
   * an address that resolves to a private host is refused.
   */
  app.post(
    ENDPOINTS.admin.sponsoring.sponsorAvatar,
    { schema: { body: SPONSOR_AVATAR_REQUEST_SCHEMA }, bodyLimit: SPONSOR_BODY_LIMIT_BYTES },
    async (request, reply) => {
      if (!(await requireOwnerOrAdmin(request, reply))) return;
      const { socialMedia } = request.body as { socialMedia: SocialMediaLinks };
      const { links, rejected } = normalizeSocialMediaLinks(socialMedia);
      if (rejected.length > 0) return replyWithApiError(reply, "MC-REQ-0001");
      const pictureUrl = await resolveSponsorAvatar(links);
      const result: SponsorAvatarResult = { avatarId: pictureUrl ? await copySponsorAvatar(pictureUrl) : null };
      return result;
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
