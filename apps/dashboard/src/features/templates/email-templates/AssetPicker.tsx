import { DashboardActionButton, DashboardActionId, DashboardActionStatus } from "@musiccloud/dashboard-ui";
import { CheckCircleIcon, ImagesIcon, TrayArrowUpIcon } from "@phosphor-icons/react";
import { type ChangeEvent, useRef } from "react";

import { useI18n } from "@/context/I18nContext";
import { useEmailAssets, useUploadEmailAsset } from "@/features/templates/hooks/useEmailAssets";
import { Dialog, dialogHeaderIconClass } from "@/shared/ui/Dialog";

interface AssetPickerProps {
  /** Whether the picker dialog is open. */
  open: boolean;
  /** The currently selected asset id, highlighted in the gallery (or `null`). */
  selectedAssetId: string | null;
  /** Called with the chosen asset id (after a gallery pick or a fresh upload). The caller decides whether to close. */
  onSelect: (assetId: string) => void;
  /** Called when the dialog is dismissed without choosing. */
  onClose: () => void;
}

/**
 * Shared image picker for email branding (MC-079). Presented as a modal
 * dialog: an "upload new" action plus a gallery of every previously uploaded
 * `email_assets` image (thumbnails served from the public
 * `/api/admin/email-assets/:id` route), so an image can be reused across
 * templates and branding slots without re-uploading.
 *
 * A gallery pick calls {@link onSelect} with the existing id; a successful
 * upload calls {@link onSelect} with the newly created id. The picker owns no
 * "current value" of its own beyond highlighting {@link selectedAssetId} — the
 * parent field stores the chosen id.
 */
export function AssetPicker({ open, selectedAssetId, onSelect, onClose }: AssetPickerProps) {
  const { messages } = useI18n();
  const m = messages.emailTemplates;
  const { data: assets, isLoading } = useEmailAssets();
  const uploadMutation = useUploadEmailAsset();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    uploadMutation.mutate(file, { onSuccess: (result) => onSelect(result.id) });
  }

  return (
    <Dialog
      open={open}
      title={m.assetPickerTitle}
      titleIcon={<ImagesIcon weight="duotone" className={dialogHeaderIconClass} />}
      onClose={onClose}
      maxWidth="md"
    >
      <div className="space-y-4 px-6 py-4">
        <div className="flex items-center gap-3">
          <DashboardActionButton
            action={DashboardActionId.Import}
            busyLabel={m.assetPickerUploadNew}
            icon={<TrayArrowUpIcon weight="duotone" className="size-3.5" />}
            label={m.assetPickerUploadNew}
            onClick={() => fileInputRef.current?.click()}
            status={uploadMutation.isPending ? DashboardActionStatus.Busy : DashboardActionStatus.Idle}
            type="button"
          />
          <input
            ref={fileInputRef}
            aria-label={m.assetPickerUploadNew}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--ds-text-muted)]">
            {m.assetPickerExisting}
          </p>
          {isLoading ? (
            <div className="h-24 animate-pulse rounded-control border border-[var(--ds-border)] bg-[var(--ds-input-bg)]" />
          ) : !assets || assets.length === 0 ? (
            <p className="text-sm text-[var(--ds-text-muted)]">{m.assetPickerEmpty}</p>
          ) : (
            <div className="grid max-h-80 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
              {assets.map((asset) => {
                const isSelected = asset.id === selectedAssetId;
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => onSelect(asset.id)}
                    aria-pressed={isSelected}
                    className={`relative aspect-square overflow-hidden rounded-control border bg-[var(--ds-bg-elevated)] ${
                      isSelected
                        ? "border-[var(--ds-border-focus)] ring-2 ring-[var(--ds-focus-ring)]"
                        : "border-[var(--ds-border)]"
                    }`}
                  >
                    <img src={`/api/admin/email-assets/${asset.id}`} alt="" className="size-full object-cover" />
                    {isSelected && (
                      <span className="absolute right-1 top-1 text-[var(--ds-border-focus)]">
                        <CheckCircleIcon weight="fill" className="size-4" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {uploadMutation.isError && (
          <p className="text-xs text-red-500">
            {uploadMutation.error instanceof Error ? uploadMutation.error.message : messages.common.unknownError}
          </p>
        )}
      </div>
    </Dialog>
  );
}
