import { StatusBadgeClass } from "@musiccloud/dashboard-ui";

import { dashboardCopy } from "@/copy/dashboard";
import { BANK_CONNECTION_STATE_TONES, type BankConnectionStateValue } from "@/features/sponsoring/bankConnectionState";

/** The bank connection's copy. */
const text = dashboardCopy.sponsoring.bankConnection;

/** Props of {@link BankConnectionStateBadge}. */
interface BankConnectionStateBadgeProps {
  /** The state to name. */
  state: BankConnectionStateValue;
  /** Classes for where the badge sits, such as the margin it keeps in the sidebar. */
  className?: string;
}

/**
 * The bank connection's state as a label in its tone, in the dashboard's
 * status badge, the one the page's header and the sidebar entry both show.
 *
 * @param props - See {@link BankConnectionStateBadgeProps}.
 * @returns The badge.
 */
export function BankConnectionStateBadge({ state, className = "" }: BankConnectionStateBadgeProps) {
  return (
    <span
      className={`shrink-0 ${StatusBadgeClass.Root} ${StatusBadgeClass[BANK_CONNECTION_STATE_TONES[state]]} ${className}`}
    >
      {text.states[state]}
    </span>
  );
}
