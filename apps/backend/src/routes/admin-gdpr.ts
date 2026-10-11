/**
 * @file Admin GDPR tooling (MC-085): export a subject's personal-data package
 * by email (Art. 15/20). Registered inside the admin scope in `server.ts`
 * (JWT gate); the handler additionally requires the owner/admin role so
 * moderators cannot pull personal data. Account deletion stays exclusively
 * with the authenticated account holder in the portal danger zone.
 */

import { ENDPOINTS } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";

import { getDeveloperRepository } from "../db/index.js";
import { requireOwnerOrAdmin } from "../lib/admin-caller.js";
import { normalizeEmailAddress } from "../lib/email-address.js";
import { buildPersonalDataExport } from "../services/gdpr-export.js";

export default async function adminGdprRoutes(app: FastifyInstance) {
  // GET /api/admin/gdpr/export?email=
  app.get(ENDPOINTS.admin.gdpr.export, async (request, reply) => {
    const caller = await requireOwnerOrAdmin(request, reply);
    if (!caller) return;

    const email = normalizeEmailAddress((request.query as { email?: unknown } | null)?.email);
    if (!email) return reply.status(400).send({ error: "INVALID_REQUEST", message: "email query param required" });

    const account = await (await getDeveloperRepository()).findDeveloperAccountByEmail(email);
    const pkg = await buildPersonalDataExport(account ? { developerAccountId: account.id, email } : { email });
    reply.header("content-disposition", 'attachment; filename="musiccloud-gdpr-export.json"');
    return reply.send(pkg);
  });
}
