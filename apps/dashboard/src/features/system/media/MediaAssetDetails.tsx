import { CopyIcon, FileIcon, LinkIcon, TrashIcon } from "@phosphor-icons/react";
import { SectionCard } from "@/components/ui/Card";
import { formatBytes, formatMediaDate, getMediaTypeLabel, isImageAsset } from "@/features/system/media/media-utils";
import type { DashboardLocale } from "@/i18n/messages";
import type { MediaAsset } from "@/shared/types/media";

interface MediaDetailsMessages {
  previewTitle: string;
  detailsTitle: string;
  displayName: string;
  saveName: string;
  infoTitle: string;
  originalName: string;
  fileType: string;
  fileSize: string;
  dimensions: string;
  createdAt: string;
  updatedAt: string;
  uploadedBy: string;
  internalUrl: string;
  copied: string;
  copyUrl: string;
  openFile: string;
  unsupportedPreview: string;
}

function MediaPreview({ asset, unsupportedPreview }: { asset: MediaAsset; unsupportedPreview: string }) {
  if (isImageAsset(asset)) {
    return (
      <div className="aspect-[4/3] rounded-xl overflow-hidden bg-[var(--ds-bg-elevated)]">
        <img src={asset.url} alt="" className="w-full h-full object-cover" />
      </div>
    );
  }

  return (
    <div className="aspect-[4/3] rounded-xl bg-[var(--ds-bg-elevated)] border border-dashed border-[var(--ds-border)] flex flex-col items-center justify-center gap-3 text-[var(--ds-text-subtle)]">
      <FileIcon weight="duotone" className="w-12 h-12" />
      <div className="text-center">
        <p className="text-sm font-medium text-[var(--ds-text)]">{getMediaTypeLabel(asset)}</p>
        <p className="text-xs">{unsupportedPreview}</p>
      </div>
    </div>
  );
}

interface MediaAssetDetailsProps {
  asset: MediaAsset;
  draftName: string;
  copied: boolean;
  saving: boolean;
  savingLabel: string;
  locale: DashboardLocale;
  messages: MediaDetailsMessages;
  onDraftNameChange: (value: string) => void;
  onSave: () => void;
  onRequestDelete: () => void;
  onCopyUrl: () => void;
}

export function MediaAssetDetails({
  asset,
  draftName,
  copied,
  saving,
  savingLabel,
  locale,
  messages,
  onDraftNameChange,
  onSave,
  onRequestDelete,
  onCopyUrl,
}: MediaAssetDetailsProps) {
  return (
    <div className="space-y-4">
      <SectionCard title={messages.previewTitle}>
        <MediaPreview asset={asset} unsupportedPreview={messages.unsupportedPreview} />
      </SectionCard>

      <SectionCard title={messages.detailsTitle}>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-[var(--ds-text)]">{messages.displayName}</span>
          <input
            type="text"
            value={draftName}
            onChange={(event) => onDraftNameChange(event.target.value)}
            className="w-full px-3 py-2.5 border border-[var(--ds-border)] rounded-control text-sm bg-[var(--ds-input-bg)] text-[var(--ds-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          />
        </label>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={saving || draftName.trim().length === 0 || draftName.trim() === asset.displayName}
            className="flex-1 h-9 px-4 border border-[var(--ds-btn-primary-border)] text-[var(--ds-btn-primary-text)] rounded-control text-sm font-medium hover:border-[var(--ds-btn-primary-hover-border)] hover:bg-[var(--ds-btn-primary-hover-bg)] transition-colors disabled:opacity-60"
          >
            {saving ? savingLabel : messages.saveName}
          </button>
          <button
            type="button"
            onClick={onRequestDelete}
            className="h-9 px-4 border border-[var(--ds-btn-danger-border)] text-[var(--ds-btn-danger-text)] rounded-control text-sm font-medium hover:border-[var(--ds-btn-danger-hover-border)] hover:bg-[var(--ds-btn-danger-hover-bg)] transition-colors"
          >
            <TrashIcon weight="duotone" className="w-4 h-4" />
          </button>
        </div>
      </SectionCard>

      <SectionCard title={messages.infoTitle}>
        <div className="space-y-3 text-sm">
          <div>
            <p className="text-[var(--ds-text-subtle)]">{messages.originalName}</p>
            <p className="text-[var(--ds-text)] break-all">{asset.originalName}</p>
          </div>
          <div>
            <p className="text-[var(--ds-text-subtle)]">{messages.fileType}</p>
            <p className="text-[var(--ds-text)]">{asset.mimeType}</p>
          </div>
          <div>
            <p className="text-[var(--ds-text-subtle)]">{messages.fileSize}</p>
            <p className="text-[var(--ds-text)]">{formatBytes(asset.sizeBytes, locale)}</p>
          </div>
          {asset.width && asset.height && (
            <div>
              <p className="text-[var(--ds-text-subtle)]">{messages.dimensions}</p>
              <p className="text-[var(--ds-text)]">
                {asset.width} x {asset.height}px
              </p>
            </div>
          )}
          <div>
            <p className="text-[var(--ds-text-subtle)]">{messages.createdAt}</p>
            <p className="text-[var(--ds-text)]">{formatMediaDate(asset.createdAt, locale)}</p>
          </div>
          <div>
            <p className="text-[var(--ds-text-subtle)]">{messages.updatedAt}</p>
            <p className="text-[var(--ds-text)]">{formatMediaDate(asset.updatedAt, locale)}</p>
          </div>
          <div>
            <p className="text-[var(--ds-text-subtle)]">{messages.uploadedBy}</p>
            <p className="text-[var(--ds-text)]">{asset.createdByUsername ?? "\u2014"}</p>
          </div>
          <div>
            <p className="text-[var(--ds-text-subtle)]">{messages.internalUrl}</p>
            <div className="mt-1 rounded-control border border-[var(--ds-border)] bg-[var(--ds-input-bg)] px-3 py-2 font-mono text-xs text-[var(--ds-text)] break-all">
              {asset.url}
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCopyUrl}
            className="flex-1 h-9 px-4 border border-[var(--ds-border)] rounded-control text-sm text-[var(--ds-text)] hover:border-[var(--ds-border-strong)] transition-colors flex items-center justify-center gap-2"
          >
            <CopyIcon weight="duotone" className="w-4 h-4" />
            {copied ? messages.copied : messages.copyUrl}
          </button>
          <a
            href={asset.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 h-9 px-4 border border-[var(--ds-border)] rounded-control text-sm text-[var(--ds-text)] hover:border-[var(--ds-border-strong)] transition-colors flex items-center justify-center gap-2"
          >
            <LinkIcon weight="duotone" className="w-4 h-4" />
            {messages.openFile}
          </a>
        </div>
      </SectionCard>
    </div>
  );
}
