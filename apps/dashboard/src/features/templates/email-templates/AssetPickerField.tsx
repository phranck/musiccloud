import { DashboardActionButton, DashboardActionId } from "@musiccloud/dashboard-ui";
import { ImageIcon } from "@phosphor-icons/react";
import { useState } from "react";

import { DashboardSection } from "@/components/ui/DashboardSection";
import { dashboardCopy } from "@/copy/dashboard";
import { AssetPicker } from "@/features/templates/email-templates/AssetPicker";

interface AssetPickerPreviewProps {
  /** The currently selected asset id, or `null` when none is set. */
  assetId: string | null;
}

/**
 * The image preview of an asset slot, rendered on its own so hosts can place
 * it in a card body while the action buttons live in the card footer. Renders
 * nothing while no asset is selected.
 */
export function AssetPickerPreview({ assetId }: AssetPickerPreviewProps) {
  if (!assetId) return null;
  return (
    <img
      src={`/api/admin/email-assets/${assetId}`}
      alt=""
      className="h-24 w-full rounded border border-[var(--ds-border)] bg-[var(--ds-bg-elevated)] object-contain"
    />
  );
}

interface AssetPickerActionsProps {
  /** The currently selected asset id, or `null` when none is set. */
  assetId: string | null;
  /** Called with the new asset id, or `null` when the image is removed. */
  onAssetChange: (assetId: string | null) => void;
}

/**
 * The action buttons of an asset slot: "choose/change image" (opens the shared
 * {@link AssetPicker}) and — while an asset is selected — "remove". Rendered as
 * a fragment so hosts control the placement; per the project UI rule they
 * belong right-aligned in the card footer.
 */
export function AssetPickerActions({ assetId, onAssetChange }: AssetPickerActionsProps) {
  const messages = dashboardCopy;
  const m = messages.emailTemplates;
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <>
      <DashboardActionButton
        action={DashboardActionId.Import}
        icon={<ImageIcon weight="duotone" className="size-3.5" />}
        label={assetId ? m.assetPickerChange : m.assetPickerChoose}
        onClick={() => setPickerOpen(true)}
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
      <AssetPicker
        open={pickerOpen}
        selectedAssetId={assetId}
        onSelect={(id) => {
          onAssetChange(id);
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </>
  );
}

interface AssetPickerControlProps {
  /** The currently selected asset id, or `null` when none is set. */
  assetId: string | null;
  /** Called with the new asset id, or `null` when the image is removed. */
  onAssetChange: (assetId: string | null) => void;
}

/**
 * The compact image-slot control (no section chrome): {@link AssetPickerPreview}
 * over a right-aligned {@link AssetPickerActions} row. Used where a slot is
 * nested inside another container without a card footer of its own (e.g. a
 * per-template branding override group).
 */
export function AssetPickerControl({ assetId, onAssetChange }: AssetPickerControlProps) {
  return (
    <div className="space-y-2">
      <AssetPickerPreview assetId={assetId} />
      <div className="flex items-center justify-end gap-3">
        <AssetPickerActions assetId={assetId} onAssetChange={onAssetChange} />
      </div>
    </div>
  );
}

interface AssetPickerFieldProps {
  /** Section heading for this image slot (e.g. "Header image"). */
  label: string;
  /** Optional helper line shown above the preview. */
  hint?: string;
  /** The currently selected asset id, or `null` when none is set. */
  assetId: string | null;
  /** Called with the new asset id, or `null` when the image is removed. */
  onAssetChange: (assetId: string | null) => void;
}

/**
 * A standalone labelled image slot as its own {@link DashboardSection} card
 * (MC-079): hint + preview in the body, the choose/change/remove actions
 * right-aligned in the card footer. Replaces the upload-only
 * `BrandingImageSlot` for the global branding page's header/footer images, so
 * a previously uploaded image can be reused without re-uploading.
 */
export function AssetPickerField({ label, hint, assetId, onAssetChange }: AssetPickerFieldProps) {
  return (
    <DashboardSection>
      <DashboardSection.Header icon={<ImageIcon weight="duotone" className="size-4" />} title={label} />
      <DashboardSection.Body>
        {hint && <p className="text-xs text-[var(--ds-text-muted)]">{hint}</p>}
        <AssetPickerPreview assetId={assetId} />
      </DashboardSection.Body>
      <DashboardSection.Footer>
        <AssetPickerActions assetId={assetId} onAssetChange={onAssetChange} />
      </DashboardSection.Footer>
    </DashboardSection>
  );
}
