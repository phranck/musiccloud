/**
 * @file Serves email image assets (MC-078) by id.
 *
 * `email_assets` rows back both the global branding header/footer images and
 * `image` body-blocks; the bytes live in Postgres exactly like
 * `genre-artwork.ts`'s `genre_artworks.jpeg`, and this route follows the same
 * `reply.header(...).send(buffer)` serving pattern.
 *
 * ## Why this route is public despite its `/api/admin/...` path segment
 *
 * The URL keeps the `/api/admin/` prefix for consistency with the rest of the
 * email-asset API surface (upload lives at the same path, just a different
 * verb — see `admin-email-assets.ts`), but the path is only a naming
 * convention here, not an auth boundary. This file is registered at Fastify's
 * ROOT scope (mirroring exactly how `genreArtworkRoutes` is registered in
 * `server.ts`), so no `authenticateAdmin` preHandler ever reaches it.
 *
 * That is required, not incidental: once a template is sent, its rendered
 * HTML embeds `<img src="…/api/admin/email-assets/:id">` and the *recipient's*
 * mail client fetches that URL directly — it has no admin dashboard session
 * and no JWT to present. If this GET required admin auth, every image in
 * every sent email would render broken for every recipient. The bytes
 * themselves are not secret: they are already sitting in delivered mail
 * inboxes by the time this route is ever hit, so serving them without auth
 * exposes nothing an attacker could not already see in the email itself.
 *
 * The sibling admin-guarded upload route (`admin-email-assets.ts`, POST) is a
 * genuine auth boundary — arbitrary uploads must stay admin-only — which is
 * exactly why upload and serve live in two separate route files: one Fastify
 * file can only be registered into one scope, and these two need different
 * scopes.
 */

import { ROUTE_TEMPLATES } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { getManagedEmailAssetBytes } from "../services/email-templates.js";

export default async function emailAssetServeRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>(
    ROUTE_TEMPLATES.admin.emailAssets.detail,
    {
      schema: { hide: true },
    },
    async (request, reply) => {
      const asset = await getManagedEmailAssetBytes(request.params.id);
      if (!asset) {
        return reply.status(404).send({ error: "Email asset not found" });
      }
      return reply
        .code(200)
        .header("Content-Type", asset.mimeType)
        .header("Cache-Control", "public, max-age=31536000, immutable")
        .send(asset.bytes);
    },
  );
}
