import { DashboardActionButton, DashboardActionId } from "@musiccloud/dashboard-ui";
import { ImageIcon } from "@phosphor-icons/react";
import { useState } from "react";

import { DashboardSection } from "@/components/ui/DashboardSection";
import { useI18n } from "@/context/I18nContext";
import { AssetPicker } from "@/features/templates/email-templates/AssetPicker";

interface AssetPickerControlProps {
  /** The currently selected asset id, or `null` when none is set. */
  assetId: string | null;
  /** Called with the new asset id, or `null` when the image is removed. */
  onAssetChange: (assetId: string | null) => void;
}

/**
 * The bare image-slot control (no section chrome): the current image preview
 * (if any), a "choose/change image" button that opens the shared
 * {@link AssetPicker}, and a "remove" button. Used directly where a slot is
 * nested inside another section (e.g. a background editor), and wrapped by
 * {@link AssetPickerField} where a standalone section is wanted.
 */
export function AssetPickerControl({ assetId, onAssetChange }: AssetPickerControlProps) {
  const { messages } = useI18n();
  const m = messages.emailTemplates;
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="space-y-2">
      {assetId && (
        <img
          src={`/api/admin/email-assets/${assetId}`}
          alt=""
          className="h-24 w-full rounded border border-[var(--ds-border)] bg-[var(--ds-bg-elevated)] object-contain"
        />
      )}
      <div className="flex items-center gap-3">
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
      </div>
      <AssetPicker
        open={pickerOpen}
        selectedAssetId={assetId}
        onSelect={(id) => {
          onAssetChange(id);
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
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
 * A standalone labelled image slot: {@link AssetPickerControl} wrapped in a
 * {@link DashboardSection} (MC-079). Replaces the upload-only `BrandingImageSlot`
 * for the global branding page's header/footer images, so a previously
 * uploaded image can be reused without re-uploading.
 */
export function AssetPickerField({ label, hint, assetId, onAssetChange }: AssetPickerFieldProps) {
  return (
    <DashboardSection>
      <DashboardSection.Header icon={<ImageIcon weight="duotone" className="size-4" />} title={label} />
      <DashboardSection.Body>
        {hint && <p className="text-xs text-[var(--ds-text-muted)]">{hint}</p>}
        <AssetPickerControl assetId={assetId} onAssetChange={onAssetChange} />
      </DashboardSection.Body>
    </DashboardSection>
  );
}
