import { DashboardActionButton, DashboardActionId, DashboardButtonVariant } from "@musiccloud/dashboard-ui";
import { dashboardCopy } from "@/copy/dashboard";

/** Props for {@link InlineConfirm}. */
export interface InlineConfirmProps {
  /** The sentence that says what confirming will do, written for the person about to press it. */
  message: string;
  /** The action the confirming button performs, which decides its icon. */
  confirmAction: DashboardActionId;
  /** The confirming button's label. It names the action, so nobody confirms an "OK" without reading. */
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Disables the confirming button only, so Cancel still works whilst the action is running. */
  disabled?: boolean;
}

/**
 * The second press in front of an action that is hard to take back, shown in
 * place under the control that asked for it.
 *
 * The caller keeps the state that arms it, because only the caller knows what
 * arms it: a button press, a switch turned on, a segment chosen. Cancel stands
 * left of the confirming button, which takes the danger tone because every
 * action guarded this way removes something or reaches people outside the
 * dashboard.
 *
 * @param props - See {@link InlineConfirmProps}.
 * @returns The sentence with its two buttons.
 */
export function InlineConfirm({
  message,
  confirmAction,
  confirmLabel,
  onConfirm,
  onCancel,
  disabled = false,
}: InlineConfirmProps) {
  return (
    <div>
      <p className="text-sm text-[var(--ds-danger-text)]">{message}</p>
      <div className="mt-2 flex justify-end gap-2">
        <DashboardActionButton
          action={DashboardActionId.Cancel}
          label={dashboardCopy.common.cancel}
          onClick={onCancel}
          type="button"
          variant={DashboardButtonVariant.Neutral}
        />
        <DashboardActionButton
          action={confirmAction}
          label={confirmLabel}
          onClick={onConfirm}
          disabled={disabled}
          type="button"
          variant={DashboardButtonVariant.Danger}
        />
      </div>
    </div>
  );
}
