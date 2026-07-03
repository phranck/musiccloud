/**
 * @file Public form-submit endpoint (MC-082, ported from lmaa.space).
 *
 * `POST /api/v1/forms/:slug/submit` accepts an unauthenticated submission for
 * an ACTIVE admin-built form: looks the form up by slug (inactive/unknown →
 * 404, indistinguishable on purpose), validates the body against the stored
 * field definitions, runs the configured submission chain, and returns the
 * form's success UI config. Per-IP rate-limited (registered globally in
 * `server.ts`, tightened per-route here) since it is an open write endpoint.
 */

import { ROUTE_TEMPLATES } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";

import { getAdminRepository } from "../db/index.js";
import { executeSubmissionChain } from "../services/form-submission.js";
import { validateFormSubmission } from "../services/form-validation.js";

/**
 * Hourly per-IP submit budget (mirrors lmaa's 20/h). Exported so the route
 * test can pin the configuration.
 */
export const FORM_SUBMIT_RATE_LIMIT = { max: 20, timeWindow: "1 hour" } as const;

export default async function formsPublicRoutes(app: FastifyInstance) {
  app.post<{ Params: { slug: string } }>(
    ROUTE_TEMPLATES.v1.formsSubmit,
    { config: { rateLimit: FORM_SUBMIT_RATE_LIMIT } },
    async (request, reply) => {
      const repo = await getAdminRepository();
      const form = await repo.getActiveFormConfigBySlug(request.params.slug);
      if (!form) return reply.status(404).send({ error: "Not found" });
      if (!form.submissionConfig || form.submissionConfig.steps.length === 0) {
        return reply.status(400).send({ error: "No submission config" });
      }

      const validated = validateFormSubmission(form.rows, request.body);
      if (!validated.ok) {
        return reply.status(400).send({ error: "Validation failed", issues: validated.issues });
      }

      await executeSubmissionChain(form.submissionConfig, validated.data, {
        id: form.id,
        name: form.name,
        rows: form.rows,
      });

      return {
        ok: true,
        success: {
          headline: form.submissionConfig.successHeadline,
          message: form.submissionConfig.successMessage,
          redirectUrl: form.submissionConfig.successRedirectUrl,
        },
      };
    },
  );
}
