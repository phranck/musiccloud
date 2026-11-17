/**
 * @file Serves the copies of sponsors' pictures, `GET /api/v1/sponsor-avatars/:avatarId`.
 *
 * Public without a key, because the support page's wall and the dashboard's
 * sponsor card both load these as `<img>` sources, and kept out of the
 * developer reference (`hide`), because it is not part of the API offered to
 * developers. The global rate limit applies.
 *
 * The id is the SHA-256 of the bytes, so a response never changes and is
 * cached for good. The bytes are a PNG the server encoded, never what a
 * foreign host sent; the headers below still say what a browser may do with
 * them, so nothing served here can ever run as a document on our origin.
 */

import { ROUTE_TEMPLATES, SPONSOR_AVATAR_ID_SCHEMA } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { replyWithApiError } from "../lib/infra/api-error-handler.js";
import { readSponsorAvatar } from "../services/sponsor-avatars.js";

/** The type every stored picture has. */
const AVATAR_CONTENT_TYPE = "image/png";

/** A picture's address never changes, so it is cached for a year and never revalidated. */
const AVATAR_CACHE_CONTROL = "public, max-age=31536000, immutable";

/** No document context at all: the response is a picture and nothing else. */
const AVATAR_CONTENT_SECURITY_POLICY = "default-src 'none'";

/**
 * Registers the picture route at the root scope, outside every auth hook.
 *
 * @param app - The root Fastify instance.
 */
export default async function sponsorAvatarRoutes(app: FastifyInstance) {
  app.get<{ Params: { avatarId: string } }>(
    ROUTE_TEMPLATES.v1.sponsorAvatar,
    {
      schema: {
        hide: true,
        params: {
          type: "object",
          required: ["avatarId"],
          additionalProperties: false,
          properties: { avatarId: SPONSOR_AVATAR_ID_SCHEMA },
        },
      },
    },
    async (request, reply) => {
      const png = await readSponsorAvatar(request.params.avatarId);
      if (!png) return replyWithApiError(reply, "MC-RES-0003");
      return reply
        .code(200)
        .header("Content-Type", AVATAR_CONTENT_TYPE)
        .header("Cache-Control", AVATAR_CACHE_CONTROL)
        .header("X-Content-Type-Options", "nosniff")
        .header("Content-Security-Policy", AVATAR_CONTENT_SECURITY_POLICY)
        .send(png);
    },
  );
}
