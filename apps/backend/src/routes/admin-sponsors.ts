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
 * Two more routes give a sponsor a picture before the card is saved: one
 * finds the picture behind the profiles and copies it, the other stores a
 * picture uploaded in the dashboard. Both answer the copy's id, which the card
 * then saves with the sponsor.
 */

import {
  ENDPOINTS,
  IMAGE_UPLOAD_MAX_BYTES,
  isSponsorAvatarUploadMimeType,
  normalizeSocialMediaLinks,
  normalizeSponsorInput,
  RECORD_ID_PARAMS_SCHEMA,
  ROUTE_TEMPLATES,
  type SocialMediaLinks,
  SPONSOR_AVATAR_REQUEST_SCHEMA,
  SPONSOR_AVATAR_UPLOAD_SCHEMA,
  SPONSOR_INPUT_SCHEMA,
  type SponsorAvatarResult,
  type SponsorInput,
} from "@musiccloud/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import { requireOwnerOrAdmin } from "../lib/admin-caller.js";
import { IMAGE_UPLOAD_BODY_LIMIT_BYTES, ImageUploadRefusal, parseImageDataUrl } from "../lib/image-upload.js";
import { replyWithApiError } from "../lib/infra/api-error-handler.js";
import { log } from "../lib/infra/logger.js";
import { resolveSponsorAvatar } from "../services/sponsor-avatar.js";
import { copySponsorAvatar, storeSponsorAvatarImage } from "../services/sponsor-avatar-copy.js";
import { sponsorAvatarExists } from "../services/sponsor-avatars.js";
import { createSponsor, deleteSponsor, listSponsors, updateSponsor } from "../services/sponsors.js";

/**
 * The largest body a sponsor write accepts: 16 KiB, above the longest name,
 * eight of the longest addresses and the longest sentence together.
 */
const SPONSOR_BODY_LIMIT_BYTES = 16 * 1024;

/** The error code a refused picture upload is answered and logged with. */
const UPLOAD_REFUSAL_CODE = "MC-REQ-0017";

/** The upload cap in whole megabytes, as `MC-REQ-0017` names it to the operator. */
const UPLOAD_MAX_MEGABYTES = IMAGE_UPLOAD_MAX_BYTES / 1024 / 1024;

/**
 * Logs why an uploaded picture was not stored and answers `MC-REQ-0017`.
 * Nothing of the picture itself is logged.
 *
 * @param reply - The reply of the upload request.
 * @param outcome - The reason, as a stable token a log search can filter on: a
 *   value of `ImageUploadRefusal` or of `SponsorAvatarImageRefusal`.
 * @param error - The decoder's error, where there is one.
 * @returns The sent reply.
 */
function refuseUpload(reply: FastifyReply, outcome: string, error?: unknown) {
  log.deviation(
    { component: "AdminSponsors", errorCode: UPLOAD_REFUSAL_CODE, operation: "sponsor_avatar_upload", outcome },
    error,
  );
  return replyWithApiError(reply, UPLOAD_REFUSAL_CODE, { context: { maxMegabytes: UPLOAD_MAX_MEGABYTES } });
}

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

  /**
   * Stores a picture uploaded in the dashboard as a sponsor's picture and
   * answers its id. The picture arrives as a base64 `data:` URL of a type in
   * `SPONSOR_AVATAR_UPLOAD_MIME_TYPES`, at most `IMAGE_UPLOAD_MAX_BYTES`, and
   * is decoded and encoded again as the stored square, as a downloaded one is.
   */
  app.post(
    ENDPOINTS.admin.sponsoring.sponsorAvatarUpload,
    { schema: { body: SPONSOR_AVATAR_UPLOAD_SCHEMA }, bodyLimit: IMAGE_UPLOAD_BODY_LIMIT_BYTES },
    async (request, reply) => {
      if (!(await requireOwnerOrAdmin(request, reply))) return;
      const { dataUrl } = request.body as { dataUrl: string };
      const parsed = parseImageDataUrl(dataUrl);
      if (!parsed.ok) return refuseUpload(reply, parsed.reason);
      if (!isSponsorAvatarUploadMimeType(parsed.mimeType)) {
        return refuseUpload(reply, ImageUploadRefusal.UnsupportedType);
      }
      const stored = await storeSponsorAvatarImage(Buffer.from(parsed.base64, "base64"));
      if (!stored.ok) return refuseUpload(reply, stored.reason, stored.error);
      const result: SponsorAvatarResult = { avatarId: stored.avatarId };
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
