/**
 * @file Admin upload endpoint for email image assets (MC-078).
 *
 * Accepts a direct `data:image/<mime>;base64,...` upload (same shape and
 * limits as `admin-users.ts`'s avatar upload) and persists the decoded bytes
 * via `createManagedEmailAsset`. The matching public GET (serving the stored
 * bytes back out by id) is registered from a SEPARATE file,
 * `routes/email-assets.ts`, at Fastify's root scope — see that file's header
 * comment for why upload and serve cannot share one route file: this file is
 * registered inside `server.ts`'s `adminRoutes` block, so every route in it
 * runs behind `authenticateAdmin`. Uploading arbitrary images must stay
 * admin-only, unlike serving, which mail clients need unauthenticated.
 */

import { ENDPOINTS } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { createManagedEmailAsset, listManagedEmailAssets } from "../services/email-templates.js";

/** Logical (post-decode) size cap, matching the avatar upload's limit for consistency across the two `data:` URL upload endpoints. */
const MAX_ASSET_BYTES = 5 * 1024 * 1024;

/** Fastify body-size cap. Base64 inflates the payload by ~33%, so the wire limit is set above the logical cap with headroom, mirroring the avatar route's 8 MB body limit for a 5 MB logical image. */
const MAX_BODY_BYTES = 8 * 1024 * 1024;

export default async function adminEmailAssetsRoutes(app: FastifyInstance) {
  // GET /api/admin/email-assets — list all asset metadata (newest first) for
  // the dashboard's shared-asset picker. Admin-only (this whole file is
  // registered behind `authenticateAdmin`); the public serve-by-id route lives
  // separately in `email-assets.ts`.
  app.get(ENDPOINTS.admin.emailAssets.list, async () => {
    return listManagedEmailAssets();
  });

  // POST /api/admin/email-assets
  app.post(ENDPOINTS.admin.emailAssets.list, { bodyLimit: MAX_BODY_BYTES }, async (request, reply) => {
    const body = request.body as { dataUrl?: string } | null;
    if (!body?.dataUrl) {
      return reply.status(400).send({ error: "No image provided" });
    }

    // Whitelist MIME types. Accepting arbitrary `image/*` would let a client
    // drop SVG (XSS vector through `<script>` or `<foreignObject>`) or
    // non-image binaries with a spoofed header — same concern as the avatar
    // upload this route mirrors.
    const match = body.dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,/);
    if (!match) {
      return reply.status(400).send({ error: "Only JPEG, PNG or WebP" });
    }
    const mimeType = match[1];

    // Logical size check on the decoded image. The 0.75 factor is the
    // standard base64 overhead (3 input bytes per 4 output chars), so this is
    // a fast approximation of the post-decode size without actually decoding
    // first.
    const base64Part = body.dataUrl.slice(body.dataUrl.indexOf(",") + 1);
    const approxBytes = Math.ceil(base64Part.length * 0.75);
    if (approxBytes > MAX_ASSET_BYTES) {
      return reply.status(400).send({ error: "File too large (max 5MB)" });
    }

    const bytes = Buffer.from(base64Part, "base64");
    const asset = await createManagedEmailAsset({ mimeType, bytes });
    return reply.status(201).send({ id: asset.id });
  });
}
