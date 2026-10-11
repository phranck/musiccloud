/**
 * @file Admin upload endpoint for email image assets (MC-078).
 *
 * Accepts a direct `data:image/<mime>;base64,...` upload, checked by
 * `parseImageDataUrl` in `lib/image-upload.ts` like every other image upload,
 * and persists the decoded bytes
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
import { ADMIN_IMAGE_REFUSAL_ERRORS, IMAGE_UPLOAD_BODY_LIMIT_BYTES, parseImageDataUrl } from "../lib/image-upload.js";
import { createManagedEmailAsset, listManagedEmailAssets } from "../services/email-templates.js";

export default async function adminEmailAssetsRoutes(app: FastifyInstance) {
  // GET /api/admin/email-assets — list all asset metadata (newest first) for
  // the dashboard's shared-asset picker. Admin-only (this whole file is
  // registered behind `authenticateAdmin`); the public serve-by-id route lives
  // separately in `email-assets.ts`.
  app.get(ENDPOINTS.admin.emailAssets.list, async () => {
    return listManagedEmailAssets();
  });

  // POST /api/admin/email-assets
  app.post(ENDPOINTS.admin.emailAssets.list, { bodyLimit: IMAGE_UPLOAD_BODY_LIMIT_BYTES }, async (request, reply) => {
    const body = request.body as { dataUrl?: string } | null;
    if (!body?.dataUrl) {
      return reply.status(400).send({ error: "No image provided" });
    }

    // The rule every upload route applies. It matters most here, because the
    // stored bytes are served publicly with the type they were stored with,
    // and an SVG served that way can run script.
    const image = parseImageDataUrl(body.dataUrl);
    if (!image.ok) {
      return reply.status(400).send({ error: ADMIN_IMAGE_REFUSAL_ERRORS[image.reason] });
    }

    const bytes = Buffer.from(image.base64, "base64");
    const asset = await createManagedEmailAsset({ mimeType: image.mimeType, bytes });
    return reply.status(201).send({ id: asset.id });
  });
}
