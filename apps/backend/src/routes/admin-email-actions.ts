/**
 * @file Admin CRUD for the code-defined system-action registry's bindings
 * (MC-078).
 *
 * Actions themselves (`EMAIL_ACTIONS` in `@musiccloud/shared`) are code, not
 * data — this route never creates or deletes an action, only the
 * many-to-many `email_action_bindings` rows that connect an action key to a
 * template. `triggerEmailAction` (`services/email-actions.ts`) is the
 * consumer of these bindings at send time; this route is the admin-facing
 * management surface for them.
 */

import {
  EMAIL_ACTIONS,
  type EmailActionMeta,
  ENDPOINTS,
  extractEmailTemplateVariables,
  getEmailActionMeta,
  listAvailableEmailVariables,
  ROUTE_TEMPLATES,
} from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import type { EmailActionBindingDto } from "../db/admin-repository.js";
import {
  createManagedEmailActionBinding,
  deleteManagedEmailActionBinding,
  getManagedEmailTemplateById,
  listManagedEmailActionBindings,
  setManagedEmailActionBindingEnabled,
} from "../services/email-templates.js";

/** One `EMAIL_ACTIONS` entry enriched with its currently bound templates, as returned by `GET /api/admin/email-actions`. */
interface EmailActionWithBindings extends EmailActionMeta {
  bindings: EmailActionBindingDto[];
}

/** Body accepted by `POST /api/admin/email-actions/bindings`. */
interface CreateBindingBody {
  actionKey: string;
  templateId: number;
}

/** Body accepted by `PATCH /api/admin/email-actions/bindings/:id`. */
interface ToggleBindingBody {
  enabled: boolean;
}

/**
 * Validates a `POST /api/admin/email-actions/bindings` body's shape (not its
 * semantic validity against the registry/template — that happens in the
 * route handler, since it needs an async template lookup).
 *
 * @param body - the raw, untyped request body.
 * @returns the validated body, or a string error message.
 */
function validateCreateBindingBody(body: unknown): CreateBindingBody | string {
  if (!body || typeof body !== "object") return "body must be an object";
  const b = body as Record<string, unknown>;
  if (typeof b.actionKey !== "string" || b.actionKey.length === 0) {
    return "actionKey required";
  }
  if (typeof b.templateId !== "number" || !Number.isInteger(b.templateId) || b.templateId <= 0) {
    return "templateId must be a positive integer";
  }
  return { actionKey: b.actionKey, templateId: b.templateId };
}

/**
 * Validates a `PATCH /api/admin/email-actions/bindings/:id` body.
 *
 * @param body - the raw, untyped request body.
 * @returns the validated body, or a string error message.
 */
function validateToggleBindingBody(body: unknown): ToggleBindingBody | string {
  if (!body || typeof body !== "object") return "body must be an object";
  const b = body as Record<string, unknown>;
  if (typeof b.enabled !== "boolean") return "enabled must be a boolean";
  return { enabled: b.enabled };
}

export default async function adminEmailActionsRoutes(app: FastifyInstance) {
  // GET /api/admin/email-actions
  app.get(ENDPOINTS.admin.emailActions.list, async (): Promise<EmailActionWithBindings[]> => {
    const actions = Object.values(EMAIL_ACTIONS) as EmailActionMeta[];
    return Promise.all(
      actions.map(async (meta) => ({
        ...meta,
        bindings: await listManagedEmailActionBindings(meta.key),
      })),
    );
  });

  // POST /api/admin/email-actions/bindings
  app.post(ENDPOINTS.admin.emailActions.bindings, async (request, reply) => {
    const validated = validateCreateBindingBody(request.body);
    if (typeof validated === "string") {
      return reply.status(400).send({ error: validated });
    }

    const meta = getEmailActionMeta(validated.actionKey);
    if (!meta) {
      return reply.status(400).send({ error: `Unknown action key: "${validated.actionKey}"` });
    }

    const templateResult = await getManagedEmailTemplateById(validated.templateId);
    if (!templateResult.ok) {
      return reply.status(404).send({ error: "Template not found" });
    }
    const template = templateResult.data;

    // Compatibility check (MC-081): every variable the template uses
    // (auto-extracted from its subject + body, MC-080) must be AVAILABLE for
    // this action — system scope (always), recipient scope (per the action's
    // `recipientKind`), or one of the action's declared context variables.
    // This is the gate that keeps `triggerEmailAction` from ever rendering a
    // template with an unresolved `{{var}}` placeholder — enforced here at
    // bind-time so a bad pairing is rejected immediately instead of surfacing
    // as a runtime throw the next time the action fires. Mirrors the
    // send-time gate in `services/email-actions.ts`'s `triggerEmailAction`
    // (which checks the merged resolution of an actual invocation) — keep
    // both in sync.
    const available = listAvailableEmailVariables(meta.recipientKind, meta.contextVariables);
    const incompatible = extractEmailTemplateVariables(template.subject, template.blocks).find(
      (name) => !available.includes(name),
    );
    if (incompatible) {
      return reply.status(400).send({
        error: `Template "${template.name}" requires variable "${incompatible}", which is not available for action "${meta.key}" (recipient: ${meta.recipientKind})`,
      });
    }

    const binding = await createManagedEmailActionBinding({
      actionKey: validated.actionKey,
      templateId: validated.templateId,
    });
    return reply.status(201).send(binding);
  });

  // PATCH /api/admin/email-actions/bindings/:id
  app.patch<{ Params: { id: string } }>(ROUTE_TEMPLATES.admin.emailActions.binding, async (request, reply) => {
    const validated = validateToggleBindingBody(request.body);
    if (typeof validated === "string") {
      return reply.status(400).send({ error: validated });
    }
    const binding = await setManagedEmailActionBindingEnabled(request.params.id, validated.enabled);
    if (!binding) return reply.status(404).send({ error: "Binding not found" });
    return binding;
  });

  // DELETE /api/admin/email-actions/bindings/:id
  app.delete<{ Params: { id: string } }>(ROUTE_TEMPLATES.admin.emailActions.binding, async (request, reply) => {
    const deleted = await deleteManagedEmailActionBinding(request.params.id);
    if (!deleted) return reply.status(404).send({ error: "Binding not found" });
    return { deleted: true };
  });
}
