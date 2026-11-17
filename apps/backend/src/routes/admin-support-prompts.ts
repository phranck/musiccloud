/**
 * @file Managing the asks that appear inside the site.
 *
 * Ported from lmaa.space (`apps/backend/src/routes/admin/support-prompts.ts`).
 * Reading and writing them is owner and admin work, as with every other piece
 * of configuration, so each handler calls `requireOwnerOrAdmin`: the admin
 * scope's `authenticateAdmin` admits moderators too. A prompt body is held to
 * the shared request schema, and `normalizeSupportPromptInput` then refuses
 * what a schema cannot check.
 */

import {
  ENDPOINTS,
  type McErrorCode,
  normalizeSupportPromptInput,
  RECORD_ID_PARAMS_SCHEMA,
  ROUTE_TEMPLATES,
  SUPPORT_PROMPT_INPUT_SCHEMA,
  SUPPORT_PROMPT_LIMITS_SCHEMA,
  type SupportPromptInput,
  type SupportPromptLimits,
  SupportPromptRefusal,
  type SupportPromptRefusalValue,
} from "@musiccloud/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import { requireOwnerOrAdmin } from "../lib/admin-caller.js";
import { replyWithApiError } from "../lib/infra/api-error-handler.js";
import { getSupportPromptLimits, putSupportPromptLimits } from "../services/support-prompt-limits.js";
import {
  deleteSupportPrompt,
  getSupportPrompt,
  insertSupportPrompt,
  listSupportPrompts,
  updateSupportPrompt,
} from "../services/support-prompts.js";

/**
 * The largest prompt body a write accepts: 64 KiB, above the longest content
 * and every other field at its limit together.
 */
const PROMPT_BODY_LIMIT_BYTES = 64 * 1024;

/** The largest limits body a write accepts: 1 KiB, far above five small values. */
const LIMITS_BODY_LIMIT_BYTES = 1024;

/** The code each refusal answers with. A blank name is the generic format refusal. */
const REFUSAL_CODES: Record<SupportPromptRefusalValue, McErrorCode> = {
  [SupportPromptRefusal.BlankName]: "MC-REQ-0001",
  [SupportPromptRefusal.UnsafeDestination]: "MC-REQ-0014",
  [SupportPromptRefusal.ButtonWithoutDestination]: "MC-REQ-0015",
  [SupportPromptRefusal.WindowReversed]: "MC-REQ-0016",
};

/**
 * Brings a body into the form it is stored in, or answers the refusal.
 *
 * @param body - A body that passed the request schema, defaults filled in.
 * @param reply - The reply a refusal is sent on.
 * @returns The prompt to store, or `null` when a refusal was sent.
 */
async function acceptPromptInput(body: SupportPromptInput, reply: FastifyReply): Promise<SupportPromptInput | null> {
  const checked = normalizeSupportPromptInput(body);
  if (checked.ok) return checked.input;
  await replyWithApiError(reply, REFUSAL_CODES[checked.refusal]);
  return null;
}

/**
 * Registers the routes on the admin scope, whose `authenticateAdmin` hook has
 * already checked the token.
 *
 * @param app - The admin scope.
 */
export async function adminSupportPromptRoutes(app: FastifyInstance) {
  /** Every prompt, for the list. */
  app.get(ENDPOINTS.admin.supportPrompts.list, async (request, reply) => {
    if (!(await requireOwnerOrAdmin(request, reply))) return;
    return listSupportPrompts();
  });

  /** What bounds every prompt together. */
  app.get(ENDPOINTS.admin.supportPrompts.limits, async (request, reply) => {
    if (!(await requireOwnerOrAdmin(request, reply))) return;
    return getSupportPromptLimits();
  });

  /** Replaces the limits; an absent field takes its default. */
  app.put(
    ENDPOINTS.admin.supportPrompts.limits,
    { schema: { body: SUPPORT_PROMPT_LIMITS_SCHEMA }, bodyLimit: LIMITS_BODY_LIMIT_BYTES },
    async (request, reply) => {
      if (!(await requireOwnerOrAdmin(request, reply))) return;
      const limits = request.body as SupportPromptLimits;
      await putSupportPromptLimits(limits);
      return limits;
    },
  );

  /** Creates one prompt. */
  app.post(
    ENDPOINTS.admin.supportPrompts.list,
    { schema: { body: SUPPORT_PROMPT_INPUT_SCHEMA }, bodyLimit: PROMPT_BODY_LIMIT_BYTES },
    async (request, reply) => {
      if (!(await requireOwnerOrAdmin(request, reply))) return;
      const input = await acceptPromptInput(request.body as SupportPromptInput, reply);
      if (!input) return;
      return insertSupportPrompt(input);
    },
  );

  /** Reads one prompt. */
  app.get(
    ROUTE_TEMPLATES.admin.supportPrompts.detail,
    { schema: { params: RECORD_ID_PARAMS_SCHEMA } },
    async (request, reply) => {
      if (!(await requireOwnerOrAdmin(request, reply))) return;
      const { id } = request.params as { id: string };
      const prompt = await getSupportPrompt(id);
      if (!prompt) return replyWithApiError(reply, "MC-RES-0003");
      return prompt;
    },
  );

  /** Replaces one prompt; an absent field takes its default. */
  app.put(
    ROUTE_TEMPLATES.admin.supportPrompts.detail,
    {
      schema: { params: RECORD_ID_PARAMS_SCHEMA, body: SUPPORT_PROMPT_INPUT_SCHEMA },
      bodyLimit: PROMPT_BODY_LIMIT_BYTES,
    },
    async (request, reply) => {
      if (!(await requireOwnerOrAdmin(request, reply))) return;
      const { id } = request.params as { id: string };
      const input = await acceptPromptInput(request.body as SupportPromptInput, reply);
      if (!input) return;
      const prompt = await updateSupportPrompt(id, input);
      if (!prompt) return replyWithApiError(reply, "MC-RES-0003");
      return prompt;
    },
  );

  /** Removes one prompt. */
  app.delete(
    ROUTE_TEMPLATES.admin.supportPrompts.detail,
    { schema: { params: RECORD_ID_PARAMS_SCHEMA } },
    async (request, reply) => {
      if (!(await requireOwnerOrAdmin(request, reply))) return;
      const { id } = request.params as { id: string };
      if (!(await deleteSupportPrompt(id))) return replyWithApiError(reply, "MC-RES-0003");
      return { message: "Support prompt deleted" };
    },
  );
}
