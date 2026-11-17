/**
 * @file The admin surface for the sponsoring setting: running costs, payee and
 * transfer purposes.
 *
 * Reading is open to an owner or an admin. Writing is the owner's alone,
 * because the payee account decides where every donation goes. Both checks
 * happen in the handler, since `authenticateAdmin` admits every dashboard role.
 */

import {
  ENDPOINTS,
  ibanChecksumHolds,
  SPONSORING_CONFIG_SCHEMA,
  type SponsoringConfig,
  type SponsoringProblem,
  SponsoringProblemReason,
} from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { requireOwner, requireOwnerOrAdmin } from "../lib/admin-caller.js";
import { replyWithApiError } from "../lib/infra/api-error-handler.js";
import { getSponsoringConfig, setSponsoringConfig } from "../services/sponsoring-config.js";

/**
 * The largest body the write accepts: 16 KiB.
 *
 * Twenty cost items at their longest labels and every text field at its limit
 * stay under 5 KiB, so this leaves room without inviting a large payload.
 */
const SPONSORING_BODY_LIMIT_BYTES = 16 * 1024;

/** One error as AJV reports it, reduced to what names the field. */
interface SchemaError {
  instancePath: string;
  params: { missingProperty?: string };
}

/**
 * Turns the schema's errors into the fields they concern.
 *
 * AJV names the failing value by a JSON pointer such as `/costs/2/label`, and a
 * missing field by its parent plus `missingProperty`. Both become the dotted
 * path the dashboard marks.
 *
 * @param errors - The validation errors of the request.
 * @returns One problem per distinct field.
 */
function schemaProblems(errors: readonly SchemaError[]): SponsoringProblem[] {
  const fields = errors.map((error) => {
    const path = error.instancePath.split("/").filter(Boolean);
    if (error.params.missingProperty) path.push(error.params.missingProperty);
    return path.join(".");
  });
  return [...new Set(fields)].map((field) => ({ field, reason: SponsoringProblemReason.Format }));
}

/**
 * Answers with `MC-REQ-0011`, naming every refused field.
 *
 * @param reply - The reply to answer on.
 * @param problems - The refused fields.
 * @returns The reply.
 */
function refuse(reply: Parameters<typeof replyWithApiError>[0], problems: SponsoringProblem[]) {
  return replyWithApiError(reply, "MC-REQ-0011", {
    context: { fields: problems.map((problem) => problem.field).join(", ") },
    extra: { problems },
  });
}

export async function adminSponsoringRoutes(app: FastifyInstance) {
  /** Reads the setting, with the defaults filled in for anything never saved. */
  app.get(ENDPOINTS.admin.sponsoring.config, async (request, reply) => {
    if (!(await requireOwnerOrAdmin(request, reply))) return;
    return getSponsoringConfig();
  });

  /**
   * Replaces the setting as a whole.
   *
   * The schema is attached rather than enforced by Fastify, so the role is
   * checked before anything about the body is revealed, and a refused body is
   * answered with the fields it concerns rather than with AJV's sentence.
   */
  app.put(
    ENDPOINTS.admin.sponsoring.config,
    { schema: { body: SPONSORING_CONFIG_SCHEMA }, attachValidation: true, bodyLimit: SPONSORING_BODY_LIMIT_BYTES },
    async (request, reply) => {
      const owner = await requireOwner(request, reply);
      if (!owner) return;

      if (request.validationError) {
        const errors = (request.validationError as { validation?: SchemaError[] }).validation ?? [];
        return refuse(reply, schemaProblems(errors));
      }

      const config = request.body as SponsoringConfig;
      if (config.payeeIban && !ibanChecksumHolds(config.payeeIban)) {
        return refuse(reply, [{ field: "payeeIban", reason: SponsoringProblemReason.Checksum }]);
      }

      await setSponsoringConfig(config, owner.id);
      return getSponsoringConfig();
    },
  );
}
