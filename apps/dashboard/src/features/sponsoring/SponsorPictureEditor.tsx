/**
 * @file The sponsor's picture on the sponsor card, with the three things one
 * can do to it.
 *
 * Ported from lmaa.space
 * (`apps/dashboard/src/features/content/sponsors/SponsorPictureEditor.tsx`).
 * The picture is the copy musiccloud stored rather than a foreign address, and
 * the buttons are the dashboard's own action buttons. The upload is
 * musiccloud's own addition, for a sponsor whose profiles lead to no picture.
 */

import {
  DashboardActionButton,
  DashboardActionId,
  DashboardActionStatus,
  DashboardButtonVariant,
} from "@musiccloud/dashboard-ui";
import { ENDPOINTS, SPONSOR_AVATAR_UPLOAD_MIME_TYPES } from "@musiccloud/shared";
import { ArrowClockwiseIcon, TrashIcon, TrayArrowUpIcon } from "@phosphor-icons/react";
import { type ChangeEvent, useRef } from "react";

import { dashboardCopy } from "@/copy/dashboard";

const sm = dashboardCopy.sponsoring;

/** What the file picker offers: the types the upload route accepts, as an `accept` list. */
const UPLOAD_ACCEPT = SPONSOR_AVATAR_UPLOAD_MIME_TYPES.join(",");

/** Props of {@link SponsorPictureEditor}. */
export interface SponsorPictureEditorProps {
  /** The stored copy of the picture, or `null` when there is none. */
  avatarId: string | null;
  /** The name the initial is taken from while no picture is set. */
  displayName: string;
  /** Whether an address is present that a picture could be fetched from. */
  canFetch: boolean;
  /** Whether a fetch is running right now. */
  isFetching: boolean;
  /** Whether an upload is running right now. */
  isUploading: boolean;
  /** Fetches the picture behind the addresses again. */
  onFetch: () => void;
  /** Uploads the file the operator picked as the sponsor's picture. */
  onUpload: (file: File) => void;
  /** Drops the picture, so the initial stands instead. */
  onRemove: () => void;
}

/**
 * The sponsor's picture with the three things one can do to it.
 *
 * The picture normally arrives on its own, resolved from the social media
 * address as it is entered. Fetching again is for the case where it did not,
 * or where the person has changed their picture since; uploading is for a
 * sponsor whose profiles lead to no picture at all. Both buttons are off while
 * either request runs, so the two cannot race for the same field. The column
 * takes the width its parent gives it.
 *
 * @param props - See {@link SponsorPictureEditorProps}.
 * @returns The picture column.
 */
export function SponsorPictureEditor({
  avatarId,
  displayName,
  canFetch,
  isFetching,
  isUploading,
  onFetch,
  onUpload,
  onRemove,
}: SponsorPictureEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isBusy = isFetching || isUploading;

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Cleared so that picking the same file again fires `change` once more.
    event.target.value = "";
    if (file) onUpload(file);
  }

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="flex size-24 items-center justify-center overflow-hidden rounded-full bg-[var(--ds-bg-elevated)] ring-2 ring-[var(--ds-border)]">
        {avatarId ? (
          <img src={ENDPOINTS.v1.sponsorAvatar(avatarId)} alt={displayName} className="size-full object-cover" />
        ) : (
          <span className="select-none text-3xl font-semibold text-[var(--ds-text-subtle)]">
            {displayName.trim()[0]?.toUpperCase() ?? "?"}
          </span>
        )}
      </div>

      <div className="flex w-full flex-col gap-1.5">
        <DashboardActionButton
          action={DashboardActionId.Import}
          icon={<TrayArrowUpIcon weight="duotone" className="size-3.5 shrink-0" />}
          label={sm.sponsorUploadPicture}
          onClick={() => fileInputRef.current?.click()}
          disabled={isBusy}
          status={isUploading ? DashboardActionStatus.Busy : DashboardActionStatus.Idle}
          size="control"
          type="button"
          variant={DashboardButtonVariant.Neutral}
        />
        <DashboardActionButton
          action={DashboardActionId.Restore}
          icon={<ArrowClockwiseIcon weight="duotone" className="size-3.5 shrink-0" />}
          label={sm.sponsorRefreshPicture}
          onClick={onFetch}
          disabled={!canFetch || isBusy}
          status={isFetching ? DashboardActionStatus.Busy : DashboardActionStatus.Idle}
          size="control"
          type="button"
          variant={DashboardButtonVariant.Neutral}
        />
        {avatarId && (
          <DashboardActionButton
            action={DashboardActionId.Remove}
            icon={<TrashIcon weight="duotone" className="size-3.5 shrink-0" />}
            label={sm.sponsorRemovePicture}
            onClick={onRemove}
            disabled={isBusy}
            size="control"
            type="button"
          />
        )}
      </div>

      <input
        ref={fileInputRef}
        aria-label={sm.sponsorUploadPicture}
        type="file"
        accept={UPLOAD_ACCEPT}
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
