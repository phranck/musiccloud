/**
 * @file TanStack Query hooks for the form-builder's config CRUD (MC-082).
 * All paths come from the shared `ENDPOINTS.admin.forms` registry — the
 * backend registers its Fastify routes against the same constants, so the
 * dashboard can never drift from the server's URL layout.
 */

import { ENDPOINTS } from "@musiccloud/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { FormConfig, FormConfigPayload } from "@/shared/contracts";

/**
 * Lists every form config (field grid + submission chain included).
 *
 * @returns A TanStack Query result wrapping the {@link FormConfig} array.
 */
export function useFormConfigs() {
  return useQuery({
    queryKey: ["form-configs"],
    queryFn: () => api.get<FormConfig[]>(ENDPOINTS.admin.forms.list),
  });
}

/**
 * Creates a new, empty form. The backend answers 409 when the name or slug is
 * already taken; the create dialog string-matches the error message to decide
 * which field to blame.
 *
 * @returns A mutation accepting `{ name, slug }`, resolving to the created
 *   {@link FormConfig}. Invalidates the list on success.
 */
export function useCreateFormConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; slug: string }) => api.post<FormConfig>(ENDPOINTS.admin.forms.list, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["form-configs"] }),
  });
}

/**
 * Permanently deletes a form; its stored submissions cascade.
 *
 * @returns A mutation accepting the form's name. Invalidates the list on success.
 */
export function useDeleteFormConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.delete(ENDPOINTS.admin.forms.detail(name)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["form-configs"] }),
  });
}

/**
 * Enables or disables a form. Inactive forms 404 on the public submit route.
 *
 * @returns A mutation accepting `{ name, active }`, resolving to the updated
 *   {@link FormConfig}. Invalidates the list on success.
 */
export function useSetFormConfigActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, active }: { name: string; active: boolean }) =>
      api.patch<FormConfig>(ENDPOINTS.admin.forms.detail(name), { isActive: active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["form-configs"] }),
  });
}

/**
 * Loads one form config by its unique name — the editor page's data source.
 *
 * @param name - The form's name from the route param; the query is disabled
 *   while it is empty (route still resolving).
 * @returns A TanStack Query result wrapping the {@link FormConfig}.
 */
export function useFormConfig(name: string) {
  return useQuery({
    queryKey: ["form-configs", name],
    queryFn: () => api.get<FormConfig>(ENDPOINTS.admin.forms.detail(name)),
    enabled: name.length > 0,
  });
}

/**
 * Saves a form's full payload (rows, submission chain, slug) — the editor's
 * save action. The backend answers 409 when the new slug is already taken.
 *
 * @returns A mutation accepting `{ name, payload }`, resolving to the updated
 *   {@link FormConfig}. Invalidates the list and the form's own query.
 */
export function useSaveFormConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, payload }: { name: string; payload: FormConfigPayload }) =>
      api.put<FormConfig>(ENDPOINTS.admin.forms.detail(name), payload),
    onSuccess: (_data, { name }) => {
      void qc.invalidateQueries({ queryKey: ["form-configs"] });
      void qc.invalidateQueries({ queryKey: ["form-configs", name] });
    },
  });
}

/**
 * Imports a full form config (create-or-overwrite). Without `overwrite` the
 * backend answers 409 when the name already exists — the import dialog then
 * asks how to proceed.
 *
 * @returns A mutation accepting the payload plus target `name` and `overwrite`
 *   flag, resolving to the imported {@link FormConfig}. Invalidates the list.
 */
export function useImportFormConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: FormConfigPayload & { name: string; overwrite?: boolean }) =>
      api.post<FormConfig>(ENDPOINTS.admin.forms.import, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["form-configs"] }),
  });
}
