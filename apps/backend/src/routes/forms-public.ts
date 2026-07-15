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
import { publicErrorResponse } from "../docs/public-response-schema.js";
import { executeSubmissionChain } from "../services/form-submission.js";
import { validateFormSubmission } from "../services/form-validation.js";

/**
 * Hourly per-IP submit budget (mirrors lmaa's 20/h). Exported so the route
 * test can pin the configuration.
 */
export const FORM_SUBMIT_RATE_LIMIT = { max: 20, timeWindow: "1 hour" } as const;

export default async function formsPublicRoutes(app: FastifyInstance) {
  app.post<{ Body: Record<string, unknown>; Params: { slug: string } }>(
    ROUTE_TEMPLATES.v1.formsSubmit,
    {
      config: { rateLimit: FORM_SUBMIT_RATE_LIMIT },
      schema: {
        tags: ["Forms"],
        summary: "Submit a published form",
        description:
          "Validates a submission against the active form configuration, executes its submission chain, and returns the configured success presentation.",
        params: {
          type: "object",
          additionalProperties: false,
          required: ["slug"],
          properties: {
            slug: {
              type: "string",
              minLength: 1,
              maxLength: 120,
              description: "URL-safe slug of the active published form that receives this submission.",
            },
          },
        },
        body: {
          type: "object",
          additionalProperties: true,
          description: "Dynamic field values defined by the published form configuration.",
        },
        response: {
          200: {
            description: "The submission chain completed successfully.",
            type: "object",
            additionalProperties: false,
            required: ["ok", "success"],
            properties: {
              ok: { type: "boolean", enum: [true] },
              success: {
                type: "object",
                additionalProperties: false,
                required: ["headline", "message"],
                properties: {
                  headline: { type: "string" },
                  message: { type: "string" },
                  redirectUrl: { anyOf: [{ type: "string", format: "uri" }, { type: "null" }] },
                },
              },
            },
          },
          400: publicErrorResponse("The form has no submission configuration or the submitted fields are invalid."),
          404: publicErrorResponse("No active published form exists for this slug."),
        },
      },
    },
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
