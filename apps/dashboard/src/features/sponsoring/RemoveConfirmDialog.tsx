import {
  DashboardActionButton,
  DashboardActionId,
  DashboardActionStatus,
  DashboardButtonVariant,
} from "@musiccloud/dashboard-ui";
import { TrashIcon } from "@phosphor-icons/react";

import { SaveErrorMessage } from "@/components/ui/SaveErrorMessage";
import { dashboardCopy } from "@/copy/dashboard";
import { Dialog, dialogHeaderIconClass } from "@/shared/ui/Dialog";

const messages = dashboardCopy;

/** Props of {@link RemoveConfirmDialog}. */
export interface RemoveConfirmDialogProps {
  /** The row about to be removed, as one line naming it, or `null` while the dialog is closed. */
  summary: string | null;
  /** The dialog's title, such as "Remove donation?". */
  title: string;
  /** What removing the row does, said before it happens. */
  description: string;
  /** Whether the removal is running, which turns the remove button busy. */
  pending: boolean;
  /** The error the removal failed with, or `null` when it has not failed. */
  error: Error | null;
  /** Removes the row. */
  onConfirm: () => void;
  /** Closes the dialog without removing anything. */
  onClose: () => void;
}

/**
 * The question the sponsoring screens ask before a row is removed: it names
 * the row, says what its removal changes, and shows the server's message if
 * the removal fails. The dialog is open while `summary` is not `null`.
 *
 * @param props - See {@link RemoveConfirmDialogProps}.
 * @returns The dialog.
 */
export function RemoveConfirmDialog({
  summary,
  title,
  description,
  pending,
  error,
  onConfirm,
  onClose,
}: RemoveConfirmDialogProps) {
  return (
    <Dialog
      open={summary !== null}
      title={title}
      titleIcon={<TrashIcon weight="duotone" className={dialogHeaderIconClass} />}
      onClose={onClose}
    >
      <div className="px-6 py-3 space-y-2">
        {summary && <p className="text-sm font-medium text-[var(--ds-text)]">{summary}</p>}
        <p className="text-sm text-[var(--ds-text-muted)]">{description}</p>
        {error && <SaveErrorMessage error={error} />}
      </div>
      <Dialog.Footer>
        <DashboardActionButton
          action={DashboardActionId.Cancel}
          icon={false}
          label={messages.common.cancel}
          onClick={onClose}
          type="button"
          variant={DashboardButtonVariant.Neutral}
        />
        <DashboardActionButton
          action={DashboardActionId.Delete}
          icon={false}
          label={messages.common.remove}
          onClick={onConfirm}
          status={pending ? DashboardActionStatus.Busy : DashboardActionStatus.Idle}
          type="button"
        />
      </Dialog.Footer>
    </Dialog>
  );
}
