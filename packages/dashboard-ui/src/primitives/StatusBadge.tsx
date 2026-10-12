import { developerAccessStatusLabel } from "@musiccloud/shared";
import { StatusBadgeClass, type StatusBadgeProps, statusTone } from "./statusBadgeContract.js";

/**
 * The state of an account, a project, an application or a token, as a label
 * in its tone.
 *
 * A state this table does not know is shown with its own value in the neutral
 * tone, so a state the backend gains first is still visible.
 *
 * @param props - See `StatusBadgeProps`.
 * @returns The badge.
 */
export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={`${StatusBadgeClass.Root} ${StatusBadgeClass[statusTone(status)]}`}>
      {developerAccessStatusLabel(status)}
    </span>
  );
}
