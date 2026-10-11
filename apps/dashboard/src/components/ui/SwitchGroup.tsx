import type { ReactNode } from "react";
import { ToggleSwitch } from "./ToggleSwitch";

/** Props for {@link SwitchGroup}. */
interface SwitchGroupProps {
  /** The {@link SwitchGroup.Item} rows. */
  children: ReactNode;
}

/**
 * A run of switches, one under another.
 *
 * Every label sits in one column as wide as the longest label, and every
 * switch starts where that column ends, so the switches share one edge and
 * each stands right after its label. A description runs beneath its row across
 * both columns, which keeps a long sentence from widening the label column and
 * pushing the switches away from their labels.
 *
 * @param props - See {@link SwitchGroupProps}.
 * @returns The group.
 */
export function SwitchGroup({ children }: SwitchGroupProps) {
  return (
    <div className="grid grid-cols-[max-content_auto] gap-x-[var(--ds-space-base)] gap-y-[var(--ds-space-sm)]">
      {children}
    </div>
  );
}

/** Props for {@link SwitchGroup.Item}. */
interface SwitchGroupItemProps {
  /** Ties the label to the switch, so pressing the label toggles it. */
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/**
 * One labelled switch in a {@link SwitchGroup}.
 *
 * It takes both columns of the group as a subgrid, so its label and its
 * switch line up with every other row.
 *
 * @param props - See {@link SwitchGroupItemProps}.
 * @returns The row.
 */
function SwitchGroupItem({ id, label, description, checked, onChange, disabled = false }: SwitchGroupItemProps) {
  return (
    <div className="col-span-2 grid grid-cols-subgrid items-center gap-y-[var(--ds-space-xs)]">
      <label htmlFor={id} className="text-sm font-medium text-[var(--ds-text)]">
        {label}
      </label>
      <ToggleSwitch id={id} checked={checked} onChange={onChange} disabled={disabled} aria-label={label} />
      {/* A grid item spanning both columns would lend its width to the label
          column and push every switch away from its label. `w-0` keeps the
          description out of the column sizing, and `min-w-full` then gives it
          the width both columns leave. */}
      {description && <p className="col-span-2 w-0 min-w-full text-sm text-[var(--ds-text-muted)]">{description}</p>}
    </div>
  );
}

SwitchGroup.Item = SwitchGroupItem;
