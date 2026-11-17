/**
 * @file The sponsor's picture on the sponsor card, with the two things one can
 * do to it.
 *
 * Ported from lmaa.space
 * (`apps/dashboard/src/features/content/sponsors/SponsorPictureEditor.tsx`).
 * The picture is the copy musiccloud stored rather than a foreign address, and
 * the buttons are the dashboard's own action buttons.
 */

import {
  DashboardActionButton,
  DashboardActionId,
  DashboardActionStatus,
  DashboardButtonVariant,
} from "@musiccloud/dashboard-ui";
import { ENDPOINTS } from "@musiccloud/shared";
import { ArrowClockwiseIcon, TrashIcon } from "@phosphor-icons/react";

import { dashboardCopy } from "@/copy/dashboard";

const sm = dashboardCopy.sponsoring;

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
  /** Fetches the picture behind the addresses again. */
  onFetch: () => void;
  /** Drops the picture, so the initial stands instead. */
  onRemove: () => void;
}

/**
 * The sponsor's picture with the two things one can do to it.
 *
 * The picture normally arrives on its own, resolved from the social media
 * address as it is entered. The button is for the case where it did not, or
 * where the person has changed their picture since.
 *
 * @param props - See {@link SponsorPictureEditorProps}.
 * @returns The picture column.
 */
export function SponsorPictureEditor({
  avatarId,
  displayName,
  canFetch,
  isFetching,
  onFetch,
  onRemove,
}: SponsorPictureEditorProps) {
  return (
    <div className="flex w-40 shrink-0 flex-col items-center gap-3">
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
          action={DashboardActionId.Restore}
          icon={<ArrowClockwiseIcon weight="duotone" className="size-3.5 shrink-0" />}
          label={sm.sponsorRefreshPicture}
          onClick={onFetch}
          disabled={!canFetch || isFetching}
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
            size="control"
            type="button"
          />
        )}
      </div>
    </div>
  );
}
