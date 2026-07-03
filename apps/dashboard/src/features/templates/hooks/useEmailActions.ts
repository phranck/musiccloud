import { type EmailActionMeta, ENDPOINTS } from "@musiccloud/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

/**
 * A binding of a code-defined system action (see `EMAIL_ACTIONS` in
 * `@musiccloud/shared`) to a template. Many-to-many: one action can fan out
 * to several enabled bindings, and a template may be bound to several
 * actions. Dashboard-local mirror of the backend's `EmailActionBindingDto`
 * (`apps/backend/src/db/admin-repository.ts`) — not itself a shared type,
 * following this project's convention of mirroring backend DTO shapes in the
 * dashboard rather than importing backend internals.
 */
export interface EmailActionBinding {
  id: string;
  actionKey: string;
  templateId: number;
  enabled: boolean;
}

/**
 * One `EMAIL_ACTIONS` entry enriched with its currently bound templates, as
 * returned by `GET /api/admin/email-actions`.
 */
export interface EmailActionWithBindings extends EmailActionMeta {
  bindings: EmailActionBinding[];
}

/** Body for {@link useCreateBinding}: binds `templateId` to `actionKey`. */
export interface CreateBindingInput {
  actionKey: string;
  templateId: number;
}

/** Argument for {@link useToggleBinding}: which binding, and its new `enabled` state. */
export interface ToggleBindingInput {
  id: string;
  enabled: boolean;
}

/**
 * Lists every code-defined system action together with its currently bound
 * templates. The action set itself (key/label/variables/required) is fixed
 * in code (`EMAIL_ACTIONS`); only the bindings are admin-editable data.
 *
 * @returns A TanStack Query result wrapping the {@link EmailActionWithBindings} array.
 */
export function useEmailActions() {
  return useQuery({
    queryKey: ["email-actions"],
    queryFn: () => api.get<EmailActionWithBindings[]>(ENDPOINTS.admin.emailActions.list),
  });
}

/**
 * Binds a template to an action. The backend rejects the pair with a `400`
 * when `actionKey` is unknown, or when the template declares a required
 * variable the action does not supply — that rejection surfaces to the
 * caller as the mutation's `error` (TanStack Query mutations propagate a
 * rejected `mutationFn` by default; `api.post` already rejects on any
 * non-2xx response), so callers should read `error.message` rather than
 * assuming success.
 *
 * @returns A TanStack Query mutation accepting {@link CreateBindingInput} and
 *   resolving to the created {@link EmailActionBinding}. Invalidates
 *   `["email-actions"]` on success.
 */
export function useCreateBinding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBindingInput) =>
      api.post<EmailActionBinding>(ENDPOINTS.admin.emailActions.bindings, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["email-actions"] });
    },
  });
}

/**
 * Enables or disables an existing binding without deleting it (so it can be
 * re-enabled later without re-running the create-time compatibility check).
 *
 * @returns A TanStack Query mutation accepting {@link ToggleBindingInput} and
 *   resolving to the updated {@link EmailActionBinding}. Invalidates
 *   `["email-actions"]` on success.
 */
export function useToggleBinding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: ToggleBindingInput) =>
      api.patch<EmailActionBinding>(ENDPOINTS.admin.emailActions.binding(id), { enabled }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["email-actions"] });
    },
  });
}

/**
 * Permanently removes a binding.
 *
 * @returns A TanStack Query mutation accepting a binding id and resolving to
 *   `{ deleted: true }`. Invalidates `["email-actions"]` on success.
 */
export function useDeleteBinding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ deleted: true }>(ENDPOINTS.admin.emailActions.binding(id)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["email-actions"] });
    },
  });
}
