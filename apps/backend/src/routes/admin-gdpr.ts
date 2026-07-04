/**
 * @file Admin GDPR tooling (MC-085): export a subject's personal-data package
 * by email (Art. 15/20) and erase an account-less subject's data by email
 * (Art. 17, anonymisation). Registered inside the admin scope in `server.ts`
 * (JWT gate); both handlers additionally require the owner/admin role —
 * moderators cannot pull or erase personal data.
 *
 * Deliberate boundary: when a developer ACCOUNT owns the address, erase
 * answers `409 ACCOUNT_EXISTS` — account deletion stays with the account
 * holder (portal danger zone), the admin never removes accounts through a
 * side channel. Export, however, resolves the account so the admin can
 * fulfil a written GDPR request with the complete package.
 */

import { ENDPOINTS } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";

import { getDeveloperRepository } from "../db/index.js";
import { requireOwnerOrAdmin } from "../lib/admin-caller.js";
import { erasePersonalData } from "../services/gdpr-erase.js";
import { buildPersonalDataExport } from "../services/gdpr-export.js";

/** Pragmatic email shape check (mirrors `form-validation.ts`). */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates and normalises (trim + lowercase) an email from query/body.
 *
 * @returns The normalised address, or `null` when unusable.
 */
function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return EMAIL_PATTERN.test(email) ? email : null;
}

export default async function adminGdprRoutes(app: FastifyInstance) {
  // GET /api/admin/gdpr/export?email=
  app.get(ENDPOINTS.admin.gdpr.export, async (request, reply) => {
    const caller = await requireOwnerOrAdmin(request, reply);
    if (!caller) return;

    const email = normalizeEmail((request.query as { email?: unknown } | null)?.email);
    if (!email) return reply.status(400).send({ error: "INVALID_REQUEST", message: "email query param required" });

    const account = await (await getDeveloperRepository()).findDeveloperAccountByEmail(email);
    const pkg = await buildPersonalDataExport(account ? { developerAccountId: account.id, email } : { email });
    reply.header("content-disposition", 'attachment; filename="musiccloud-gdpr-export.json"');
    return reply.send(pkg);
  });

  // POST /api/admin/gdpr/erase
  app.post(ENDPOINTS.admin.gdpr.erase, async (request, reply) => {
    const caller = await requireOwnerOrAdmin(request, reply);
    if (!caller) return;

    const email = normalizeEmail((request.body as { email?: unknown } | null)?.email);
    if (!email) return reply.status(400).send({ error: "INVALID_REQUEST", message: "email required" });

    const account = await (await getDeveloperRepository()).findDeveloperAccountByEmail(email);
    if (account) {
      return reply.status(409).send({
        error: "ACCOUNT_EXISTS",
        message: "A developer account owns this address; deletion is self-service via the portal's danger zone.",
      });
    }

    return erasePersonalData({ email });
  });
}
