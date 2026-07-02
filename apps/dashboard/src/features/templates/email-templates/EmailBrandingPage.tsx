import {
  DashboardActionButton,
  DashboardActionId,
  DashboardActionStatus,
  SaveActionButton,
} from "@musiccloud/dashboard-ui";
import { ImageIcon, PaintBrushIcon, TrayArrowUpIcon } from "@phosphor-icons/react";
import { type ChangeEvent, lazy, Suspense, useRef, useState } from "react";

import { DashboardSection } from "@/components/ui/DashboardSection";
import { PageHeader } from "@/components/ui/PageHeader";
import { SaveNotification, useSaveNotification } from "@/components/ui/SaveNotification";
import { useI18n } from "@/context/I18nContext";
import { useUploadEmailAsset } from "@/features/templates/hooks/useEmailAssets";
import {
  type EmailBranding,
  useEmailBranding,
  useUpdateEmailBranding,
} from "@/features/templates/hooks/useEmailBranding";

const MarkdownEditor = lazy(() =>
  import("@/components/ui/MarkdownEditor").then((m) => ({ default: m.MarkdownEditor })),
);

/** The branding singleton's three editable fields, mirrored as local draft state. */
type BrandingDraft = EmailBranding;

const EMPTY_DRAFT: BrandingDraft = { headerAssetId: null, footerAssetId: null, footerText: null };

/**
 * Settings page for the global email branding singleton (System → Templates
 * → Email branding).
 *
 * Unlike an email template, branding is not a list of records the admin
 * creates and deletes — there is exactly one `email_branding` row
 * server-side, wrapped around EVERY rendered template's body (header image
 * above it, footer image + footer text below it). This page edits that one
 * row directly, with no create/delete affordances.
 *
 * The page loads the current branding via {@link useEmailBranding}, seeds a
 * local draft once (via a ref-guarded sync, mirroring
 * `EmailTemplateEditPage`'s adjust-state-during-render idiom so a later
 * background refetch never clobbers in-progress edits), and saves the full
 * draft object via {@link useUpdateEmailBranding} on demand. The mutation's
 * contract treats an omitted field as "leave unchanged" and an explicit
 * `null` as "clear it" — sending the complete draft every time (never a
 * sparse delta) means "remove header image" (draft's `headerAssetId` set to
 * `null`) reliably clears it, with no ambiguity between omitted and null.
 */
export function EmailBrandingPage() {
  const { messages } = useI18n();
  const m = messages.emailTemplates;
  const common = messages.common;

  const { data: existing, isLoading } = useEmailBranding();
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
      draft.footerText !== existing.footerText);

  function updateField<K extends keyof BrandingDraft>(key: K, value: BrandingDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    setError(null);
    updateMutation.mutate(
      {
        headerAssetId: draft.headerAssetId,
        footerAssetId: draft.footerAssetId,
        footerText: draft.footerText?.trim() ? draft.footerText : null,
      },
      {
        onSuccess: () => showSaved(),
        onError: (err: unknown) => {
          setError(err instanceof Error ? err.message : m.saveError);
        },
      },
    );
  }

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

        <BrandingImageSlot
          label={m.brandingHeaderImage}
          assetId={draft.headerAssetId}
          onAssetChange={(assetId) => updateField("headerAssetId", assetId)}
        />

        <BrandingImageSlot
          label={m.brandingFooterImage}
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
      </div>
    </div>
  );
}

interface BrandingImageSlotProps {
  label: string;
  assetId: string | null;
  onAssetChange: (assetId: string | null) => void;
}

/**
 * One branding image slot (header or footer): preview, upload button, and a
 * remove button shown only while an asset is currently set. Each slot owns
 * its own {@link useUploadEmailAsset} mutation instance and hidden file
 * input — header and footer are independent uploads, so a failure or
 * in-flight upload on one slot never affects the other.
 *
 * Unlike a template's `image` body block (which can simply be deleted from
 * the block list), a branding slot is a permanent field that can only be
 * nulled, never removed outright — hence the explicit remove button here,
 * absent from `BlockEditor`'s `ImageBlockForm`.
 */
function BrandingImageSlot({ label, assetId, onAssetChange }: BrandingImageSlotProps) {
  const { messages } = useI18n();
  const m = messages.emailTemplates;
  const uploadMutation = useUploadEmailAsset();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    uploadMutation.mutate(file, {
      onSuccess: (result) => onAssetChange(result.id),
    });
  }

  return (
    <DashboardSection>
      <DashboardSection.Header icon={<ImageIcon weight="duotone" className="size-4" />} title={label} />
      <DashboardSection.Body>
        <div className="flex items-center gap-3">
          {assetId && (
            <img
              src={`/api/admin/email-assets/${assetId}`}
              alt=""
              className="h-14 w-24 rounded border border-[var(--ds-border)] object-cover"
            />
          )}
          <DashboardActionButton
            action={DashboardActionId.Import}
            busyLabel={m.imageUpload}
            icon={<TrayArrowUpIcon weight="duotone" className="size-3.5" />}
            label={m.imageUpload}
            onClick={() => fileInputRef.current?.click()}
            status={uploadMutation.isPending ? DashboardActionStatus.Busy : DashboardActionStatus.Idle}
            type="button"
          />
          {assetId && (
            <DashboardActionButton
              action={DashboardActionId.Remove}
              label={messages.common.remove}
              onClick={() => onAssetChange(null)}
              type="button"
            />
          )}
          <input
            ref={fileInputRef}
            aria-label={m.imageUpload}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
        {uploadMutation.isError && (
          <p className="text-xs text-red-500">
            {uploadMutation.error instanceof Error ? uploadMutation.error.message : m.imageUploadError}
          </p>
        )}
      </DashboardSection.Body>
    </DashboardSection>
  );
}
