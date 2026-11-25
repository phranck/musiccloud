import { DashboardButton, DashboardButtonVariant } from "@musiccloud/dashboard-ui";
import { ENDPOINTS, parseDesignTokens } from "@musiccloud/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { JsonEditor } from "@/components/ui/JsonEditor";
import { dashboardCopy } from "@/copy/dashboard";
import { api } from "@/lib/api";
import { formatJson } from "@/lib/formatJson";

/** React Query key for the admin site-settings record. */
const SITE_SETTINGS_KEY = ["admin", "site-settings"] as const;

/** Store key holding the JSON-encoded design-token blob (matches the backend). */
const DESIGN_TOKENS_KEY = "design_tokens";

/** The id of the field's label, which names the editing area for assistive technology. */
const JSON_LABEL_ID = "design-tokens-json-label";

/** Loads the raw site-settings map (the design-token JSON lives under one key). */
function fetchSiteSettings(): Promise<Record<string, string>> {
  return api.get<Record<string, string>>(ENDPOINTS.admin.siteSettings.base);
}

/**
 * Validation summary for the editor's current JSON text.
 * @property jsonOk Whether the text parses as a JSON object (a fatal `root:`
 *   error means it does not — saving is blocked).
 * @property invalidValueCount Count of in-range/format issues that were
 *   defaulted (non-fatal — the blob still saves and applies).
 */
interface DraftValidation {
  jsonOk: boolean;
  invalidValueCount: number;
}

/**
 * Dashboard design settings (System → Design section).
 *
 * Edits the site's central design-token blob (glass material + night-sky
 * shader). The admin pastes the JSON exported from the tuning prototype; it is
 * validated live through the shared `parseDesignTokens`, saved to the
 * `design_tokens` site-setting, and picked up by the public frontend on its
 * next SSR render (no redeploy).
 *
 * The JSON stands in a `JsonEditor` with syntax colors and line numbers. The
 * stored blob is shown formatted (`savedText`), and Format lays out pasted
 * JSON the same way. Changes are measured against `savedText`, so formatting
 * the stored blob alone leaves nothing to save.
 *
 * The page keeps an optional local `draft` over that text
 * (`value = draft ?? savedText`) so no effect is needed to seed editable state;
 * a successful save clears the draft back to the (refetched) server truth.
 */
export function DesignSettingsPage() {
  const messages = dashboardCopy;
  const m = messages.design;
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({ queryKey: SITE_SETTINGS_KEY, queryFn: fetchSiteSettings });
  const savedJson = settingsQuery.data?.[DESIGN_TOKENS_KEY] ?? "";
  // The stored blob is shown formatted, because it is usually saved as one
  // line. A blob that does not parse is shown as stored, so it can be repaired.
  const savedText = useMemo(() => formatJson(savedJson) ?? savedJson, [savedJson]);

  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? savedText;
  const formatted = formatJson(value);
  const canFormat = formatted !== null && formatted !== value;

  const saveMutation = useMutation({
    mutationFn: (json: string) => api.patch(ENDPOINTS.admin.siteSettings.base, { [DESIGN_TOKENS_KEY]: json }),
    onSuccess: () => {
      // Drop the local draft so the editor reflects the refetched server value.
      setDraft(null);
      queryClient.invalidateQueries({ queryKey: SITE_SETTINGS_KEY });
    },
  });

  const validation = useMemo<DraftValidation>(() => {
    if (value.trim() === "") return { jsonOk: true, invalidValueCount: 0 };
    const { errors } = parseDesignTokens(value);
    const jsonFatal = errors.some((e) => e.startsWith("root:"));
    return { jsonOk: !jsonFatal, invalidValueCount: jsonFatal ? 0 : errors.length };
  }, [value]);

  const isDirty = value !== savedText;
  const canSave = validation.jsonOk && isDirty && !saveMutation.isPending;

  function handleChange(next: string): void {
    setDraft(next);
    // Clear any lingering save feedback once the admin edits again.
    if (saveMutation.isSuccess || saveMutation.isError) saveMutation.reset();
  }

  function handleReset(): void {
    setDraft(null);
    saveMutation.reset();
  }

  return (
    <div className="grid gap-6 max-w-xl">
      <div>
        <h2 className="text-base font-semibold mb-1 text-[var(--ds-text)]">{m.title}</h2>
        <p className="text-sm text-[var(--ds-text-muted)]">{m.description}</p>
      </div>

      <div className="grid gap-2">
        <div id={JSON_LABEL_ID} className="text-sm font-medium text-[var(--ds-text)]">
          {m.jsonLabel}
        </div>
        <p className="text-xs text-[var(--ds-text-muted)]">{m.jsonHint}</p>
        <JsonEditor
          id="design-tokens-json"
          labelledBy={JSON_LABEL_ID}
          value={value}
          onChange={handleChange}
          readOnly={settingsQuery.isLoading}
        />

        <div className="flex items-center justify-between gap-4 min-h-5">
          <p
            className={`text-xs ${validation.jsonOk ? "text-[var(--ds-text-muted)]" : "text-[var(--ds-danger-text)]"}`}
          >
            {!validation.jsonOk
              ? m.invalidJson
              : validation.invalidValueCount > 0
                ? m.invalidValues.replace("{count}", String(validation.invalidValueCount))
                : m.validJson}
          </p>
          <div className="flex items-center gap-2 flex-none">
            <DashboardButton
              type="button"
              onClick={() => formatted !== null && handleChange(formatted)}
              disabled={!canFormat || saveMutation.isPending}
              size="action"
              variant={DashboardButtonVariant.Neutral}
            >
              {m.format}
            </DashboardButton>
            {isDirty && (
              <DashboardButton
                type="button"
                onClick={handleReset}
                disabled={saveMutation.isPending}
                size="action"
                variant={DashboardButtonVariant.Neutral}
              >
                {m.reset}
              </DashboardButton>
            )}
            <DashboardButton
              type="button"
              onClick={() => saveMutation.mutate(value)}
              disabled={!canSave}
              size="action"
              variant={DashboardButtonVariant.Success}
            >
              {saveMutation.isPending ? messages.common.saving : messages.common.save}
            </DashboardButton>
          </div>
        </div>

        <div className="min-h-4 text-xs">
          {saveMutation.isSuccess && <span className="text-green-500">{messages.common.saved}</span>}
          {saveMutation.isError && (
            <span className="text-[var(--ds-danger-text)]">
              {saveMutation.error instanceof Error ? saveMutation.error.message : messages.common.saveError}
            </span>
          )}
        </div>

        <p className="text-xs text-[var(--ds-text-muted)]">{m.reloadHint}</p>
      </div>
    </div>
  );
}
