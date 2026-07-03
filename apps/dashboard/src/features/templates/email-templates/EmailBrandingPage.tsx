import { DashboardActionStatus, SaveActionButton } from "@musiccloud/dashboard-ui";
import { MoonIcon, PaintBrushIcon, SunIcon } from "@phosphor-icons/react";
import { lazy, type ReactNode, Suspense, useRef, useState } from "react";

import { DashboardSection } from "@/components/ui/DashboardSection";
import { PageHeader } from "@/components/ui/PageHeader";
import { SaveNotification, useSaveNotification } from "@/components/ui/SaveNotification";
import { useI18n } from "@/context/I18nContext";
import { AssetPickerControl, AssetPickerField } from "@/features/templates/email-templates/AssetPickerField";
import { GradientColorFields } from "@/features/templates/email-templates/GradientColorFields";
import { collectGradientSwatches, type GradientSwatch } from "@/features/templates/email-templates/gradientSwatches";
import {
  type EmailBranding,
  useEmailBranding,
  useUpdateEmailBranding,
} from "@/features/templates/hooks/useEmailBranding";
import { useEmailTemplates } from "@/features/templates/hooks/useEmailTemplates";
import { useKeyboardSave } from "@/lib/useKeyboardSave";

const MarkdownEditor = lazy(() =>
  import("@/components/ui/MarkdownEditor").then((m) => ({ default: m.MarkdownEditor })),
);

/** The branding singleton's editable fields, mirrored as local draft state. */
type BrandingDraft = EmailBranding;

/**
 * Seed draft used before the query resolves. The four gradient colours default
 * to the website night-sky shader colours (matching the DB column defaults) so
 * the pre-load state is never an invalid empty gradient.
 */
const EMPTY_DRAFT: BrandingDraft = {
  headerAssetId: null,
  footerAssetId: null,
  footerText: null,
  lightBackgroundAssetId: null,
  darkBackgroundAssetId: null,
  lightGradientTop: "#0076d5",
  lightGradientBottom: "#69d1fd",
  darkGradientTop: "#0b1318",
  darkGradientBottom: "#10273b",
};

/**
 * Settings page for the global email branding singleton (System → Templates
 * → Email branding).
 *
 * Unlike an email template, branding is not a list of records the admin
 * creates and deletes — there is exactly one `email_branding` row server-side.
 * It is the DEFAULT wrapped around every rendered template (header image,
 * footer image + text, day/night page background), which individual templates
 * may override. This page edits that one default row directly, with no
 * create/delete affordances.
 *
 * The page loads the current branding via {@link useEmailBranding}, seeds a
 * local draft once (via a ref-guarded sync, mirroring
 * `EmailTemplateEditPage`'s adjust-state-during-render idiom so a later
 * background refetch never clobbers in-progress edits), and saves the full
 * draft object via {@link useUpdateEmailBranding} on demand. The mutation's
 * contract treats an omitted field as "leave unchanged" and an explicit
 * `null` as "clear it"; sending the complete draft every time (never a sparse
 * delta) means "remove image" (an asset id set to `null`) reliably clears it.
 */
export function EmailBrandingPage() {
  const { messages } = useI18n();
  const m = messages.emailTemplates;
  const common = messages.common;

  const { data: existing, isLoading } = useEmailBranding();
  const { data: templates } = useEmailTemplates();
  const updateMutation = useUpdateEmailBranding();
  const { phase: savedPhase, show: showSaved } = useSaveNotification();
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState<BrandingDraft>(EMPTY_DRAFT);

  // Seed the draft once the query resolves (adjust-state-during-render
  // pattern, mirroring EmailTemplateEditPage's syncedExistingIdRef): the ref
  // guards against re-seeding on every render once `existing` has loaded, but
  // still catches the query's first successful resolution.
  const syncedRef = useRef(false);
  if (existing && !syncedRef.current) {
    syncedRef.current = true;
    setDraft(existing);
  }

  const isDirty =
    !!existing &&
    (draft.headerAssetId !== existing.headerAssetId ||
      draft.footerAssetId !== existing.footerAssetId ||
      draft.footerText !== existing.footerText ||
      draft.lightBackgroundAssetId !== existing.lightBackgroundAssetId ||
      draft.darkBackgroundAssetId !== existing.darkBackgroundAssetId ||
      draft.lightGradientTop !== existing.lightGradientTop ||
      draft.lightGradientBottom !== existing.lightGradientBottom ||
      draft.darkGradientTop !== existing.darkGradientTop ||
      draft.darkGradientBottom !== existing.darkGradientBottom);

  function updateField<K extends keyof BrandingDraft>(key: K, value: BrandingDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  const swatches = collectGradientSwatches(existing, templates);

  function handleSave() {
    setError(null);
    updateMutation.mutate(
      {
        headerAssetId: draft.headerAssetId,
        footerAssetId: draft.footerAssetId,
        footerText: draft.footerText?.trim() || null,
        lightBackgroundAssetId: draft.lightBackgroundAssetId,
        darkBackgroundAssetId: draft.darkBackgroundAssetId,
        lightGradientTop: draft.lightGradientTop,
        lightGradientBottom: draft.lightGradientBottom,
        darkGradientTop: draft.darkGradientTop,
        darkGradientBottom: draft.darkGradientBottom,
      },
      {
        onSuccess: () => showSaved(),
        onError: (err: unknown) => {
          setError(err instanceof Error ? err.message : m.saveError);
        },
      },
    );
  }

  useKeyboardSave(handleSave, isDirty && !updateMutation.isPending);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-[var(--ds-text-muted)] text-sm">{common.loading}</div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title={m.brandingTitle}>
        <div className="flex items-center gap-3">
          <SaveNotification phase={savedPhase} label={common.saved} />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <SaveActionButton
            onClick={handleSave}
            disabled={!isDirty || updateMutation.isPending}
            busyLabel={common.saving}
            label={common.save}
            status={updateMutation.isPending ? DashboardActionStatus.Busy : DashboardActionStatus.Idle}
          />
        </div>
      </PageHeader>

      <div className="max-w-2xl space-y-4 overflow-y-auto p-3">
        <p className="text-sm text-[var(--ds-text-muted)]">{m.brandingDescription}</p>

        <AssetPickerField
          label={m.brandingHeaderImage}
          hint={m.brandingImageHint}
          assetId={draft.headerAssetId}
          onAssetChange={(assetId) => updateField("headerAssetId", assetId)}
        />

        <AssetPickerField
          label={m.brandingFooterImage}
          hint={m.brandingImageHint}
          assetId={draft.footerAssetId}
          onAssetChange={(assetId) => updateField("footerAssetId", assetId)}
        />

        <DashboardSection>
          <DashboardSection.Header
            icon={<PaintBrushIcon weight="duotone" className="size-4" />}
            title={m.brandingFooterText}
          />
          <DashboardSection.Body>
            <Suspense
              fallback={
                <div className="h-24 animate-pulse rounded-control border border-[var(--ds-border)] bg-[var(--ds-input-bg)]" />
              }
            >
              <MarkdownEditor
                value={draft.footerText ?? ""}
                onChange={(footerText) => updateField("footerText", footerText)}
                rows={4}
                resizable
                placeholder={m.brandingFooterTextPlaceholder}
              />
            </Suspense>
          </DashboardSection.Body>
        </DashboardSection>

        <BackgroundEditor
          icon={<SunIcon weight="duotone" className="size-4" />}
          title={m.brandingLightBackground}
          gradientTop={draft.lightGradientTop}
          gradientBottom={draft.lightGradientBottom}
          onGradientChange={(next) =>
            setDraft((prev) => ({ ...prev, lightGradientTop: next.top, lightGradientBottom: next.bottom }))
          }
          assetId={draft.lightBackgroundAssetId}
          onAssetChange={(assetId) => updateField("lightBackgroundAssetId", assetId)}
          swatches={swatches}
        />

        <BackgroundEditor
          icon={<MoonIcon weight="duotone" className="size-4" />}
          title={m.brandingDarkBackground}
          gradientTop={draft.darkGradientTop}
          gradientBottom={draft.darkGradientBottom}
          onGradientChange={(next) =>
            setDraft((prev) => ({ ...prev, darkGradientTop: next.top, darkGradientBottom: next.bottom }))
          }
          assetId={draft.darkBackgroundAssetId}
          onAssetChange={(assetId) => updateField("darkBackgroundAssetId", assetId)}
          swatches={swatches}
        />
      </div>
    </div>
  );
}

interface BackgroundEditorProps {
  icon: ReactNode;
  title: string;
  gradientTop: string;
  gradientBottom: string;
  onGradientChange: (next: { top: string; bottom: string }) => void;
  assetId: string | null;
  onAssetChange: (assetId: string | null) => void;
  swatches: GradientSwatch[];
}

/**
 * One day/night background editor section: a hint, the gradient colour fields
 * (with preset swatches), and an optional background-image slot layered over
 * the gradient. Rendered twice on the branding page — once for the light (day)
 * scheme, once for the dark (night) scheme.
 */
function BackgroundEditor({
  icon,
  title,
  gradientTop,
  gradientBottom,
  onGradientChange,
  assetId,
  onAssetChange,
  swatches,
}: BackgroundEditorProps) {
  const { messages } = useI18n();
  const m = messages.emailTemplates;

  return (
    <DashboardSection>
      <DashboardSection.Header icon={icon} title={title} />
      <DashboardSection.Body>
        <p className="text-xs text-[var(--ds-text-muted)]">{m.brandingBackgroundHint}</p>
        <GradientColorFields
          top={gradientTop}
          bottom={gradientBottom}
          onChange={onGradientChange}
          swatches={swatches}
        />
        <div>
          <p className="mb-1 text-xs font-medium text-[var(--ds-text-muted)]">{m.brandingGradientImage}</p>
          <AssetPickerControl assetId={assetId} onAssetChange={onAssetChange} />
        </div>
      </DashboardSection.Body>
    </DashboardSection>
  );
}
