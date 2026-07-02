import { ENDPOINTS } from "@musiccloud/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

/**
 * Global email branding singleton (MC-078): the header/footer image assets
 * and footer text wrapped around every rendered template. There is exactly
 * one row server-side (`email_branding`, seeded by the MC-078 backfill
 * migration) — this is not a per-template setting.
 */
export interface EmailBranding {
  /** Id of the `email_assets` row rendered above every template's body, or `null` when no header image is set. */
  headerAssetId: string | null;
  /** Id of the `email_assets` row rendered below every template's body, or `null` when no footer image is set. */
  footerAssetId: string | null;
  /** Markdown footer copy rendered beneath the body (and above the footer image, if any), or `null` when unset. */
  footerText: string | null;
}

/**
 * Reads the global email branding singleton.
 *
 * @returns A TanStack Query result wrapping the current {@link EmailBranding}.
 */
export function useEmailBranding() {
  return useQuery({
    queryKey: ["email-branding"],
    queryFn: () => api.get<EmailBranding>(ENDPOINTS.admin.emailBranding.base),
  });
}

/**
 * Updates the global email branding singleton.
 *
 * Every field is optional and independently nullable: an **omitted** field is
 * left unchanged server-side, while an **explicit `null`** clears it (e.g.
 * removing a previously set header image). This partial-with-null-clearing
 * semantic is a deliberate backend contract (verified against the real DB) —
 * callers that only want to change the footer text must not spread the
 * current branding object back in wholesale unless they intend to also
 * re-affirm the other fields, since sending `undefined` for a field is what
 * preserves it, not sending its previous value.
 *
 * @returns A TanStack Query mutation accepting a `Partial<EmailBranding>` and
 *   resolving to the updated {@link EmailBranding}. Invalidates the
 *   `["email-branding"]` query on success so readers refetch the new state.
 */
export function useUpdateEmailBranding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<EmailBranding>) => api.put<EmailBranding>(ENDPOINTS.admin.emailBranding.base, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["email-branding"] });
    },
  });
}
