/**
 * @file The developer portal routes for the caller's personal data: the GDPR
 * export and the deletion of the account.
 *
 * Registered by `devAuthRoutes` in `developer-auth.ts`, so they keep the paths
 * and scope they had there. Both attach the
 * {@link FastifyInstance.authenticateDeveloperSession} guard inline as a
 * `preValidation` hook.
 */
import { EmailAction, EmailRecipientKind, ENDPOINTS } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { clearedSessionCookieOptions, SESSION_COOKIE_NAME, verifyPassword } from "../services/developer-auth.js";
import { triggerEmailAction } from "../services/email-actions.js";
import { erasePersonalData } from "../services/gdpr-erase.js";
import { buildPersonalDataExport } from "../services/gdpr-export.js";

/**
 * Registers the personal-data export and account deletion routes under
 * `/api/dev/auth/*`.
 *
 * @param app - the Fastify instance this route group is registered on. Must
 *   have `@fastify/jwt`, `@fastify/cookie` and the auth plugin
 *   ({@link FastifyInstance.authenticateDeveloperSession}) registered beforehand.
 */
export async function devAccountDataRoutes(app: FastifyInstance) {
  /**
   * GET /api/dev/auth/export
   * The caller's complete personal-data package (GDPR Art. 15/20) as a JSON
   * attachment: account (without secrets), auth identities, and the caller's
   * registrations with token metadata.
   */
  app.get(ENDPOINTS.dev.auth.export, { preValidation: app.authenticateDeveloperSession }, async (request, reply) => {
    const account = request.developerAccount!;
    const pkg = await buildPersonalDataExport({ developerAccountId: account.id, email: account.email });
    reply.header("content-disposition", 'attachment; filename="musiccloud-data-export.json"');
    return reply.send(pkg);
  });

  /**
   * POST /api/dev/auth/delete-account
   * Permanently deletes the caller's own account (the dashboard's "Danger
   * Zone"). Cascades to the account's identities, email tokens, API-access
   * requests and clients (see `deleteDeveloperAccount`), then clears the
   * session cookie. When the account has a password set, `body.password`
   * must match it (401 `INVALID_CREDENTIALS` otherwise), because the action
   * cannot be undone and needs an extra confirmation. A GitHub-only account
   * (`hasPassword: false` on `/me`) has no password to confirm, so the body
   * is not required.
   */
  app.post(
    ENDPOINTS.dev.auth.deleteAccount,
    { preValidation: app.authenticateDeveloperSession },
    async (request, reply) => {
      const account = request.developerAccount!;

      if (account.passwordHash !== null) {
        const body = request.body as { password?: string } | null;
        const isValid = await verifyPassword(body?.password ?? "", account.passwordHash);
        if (!isValid) {
          return reply.status(401).send({ error: "INVALID_CREDENTIALS", message: "Incorrect password." });
        }
      }

      // Optional farewell notification (MC-084): fired BEFORE the delete while
      // the account data still exists; a mail failure must never block the
      // deletion itself (mirrors the invite route's resilience semantics).
      try {
        await triggerEmailAction(EmailAction.DeveloperAccountDeleted, {
          to: { email: account.email },
          recipient: {
            kind: EmailRecipientKind.DeveloperAccount,
            email: account.email,
            displayName: account.displayName,
          },
          context: {},
        });
      } catch (error) {
        request.log.error({ err: error }, "failed to send account-deleted notification");
      }

      // GDPR-complete erasure (MC-085): delete the authenticated account; DB
      // cascades clear identities, email tokens and API-access data.
      await erasePersonalData(account.id);
      reply.clearCookie(SESSION_COOKIE_NAME, clearedSessionCookieOptions());

      app.log.info("[Developer] Account deleted");
      return reply.send({ ok: true });
    },
  );
}
