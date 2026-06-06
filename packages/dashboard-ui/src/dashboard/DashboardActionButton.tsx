import type { ReactNode } from "react";

import { cx } from "../classNames.js";
import { DashboardActionId, DashboardActionStatus, DashboardActions } from "./actionCatalog.js";
import { DashboardButton, type DashboardButtonProps } from "./DashboardButton.js";

export interface DashboardActionButtonProps
  extends Omit<DashboardButtonProps, "children" | "leadingIcon" | "size" | "variant"> {
  action: DashboardActionId;
  icon?: ReactNode | false;
  iconClassName?: string;
  iconOnly?: boolean;
  label?: string;
  status?: DashboardActionStatus;
  busyLabel?: string;
  showIcon?: boolean;
  variant?: DashboardButtonProps["variant"];
  size?: DashboardButtonProps["size"];
}

function toDisplayLabel(label: string | undefined, fallbackLabelKey: string) {
  return label ?? fallbackLabelKey;
}

export function DashboardActionButton({
  action,
  busyLabel,
  className,
  disabled,
  icon,
  iconClassName,
  iconOnly,
  label,
  showIcon = true,
  size,
  status = DashboardActionStatus.Idle,
  variant,
  ...buttonProps
}: DashboardActionButtonProps) {
  const definition = DashboardActions[action];
  const Icon = definition.icon;
  const displayLabel = toDisplayLabel(label, definition.labelKey);
  const isBusy = status === DashboardActionStatus.Busy;
  const resolvedIconOnly = iconOnly ?? definition.ariaBehavior === "icon-only-label";
  const renderedIcon =
    icon === false ? null : (icon ?? <Icon className={cx("size-3.5", iconClassName)} weight="duotone" />);

  return (
    <DashboardButton
      {...buttonProps}
      aria-label={resolvedIconOnly ? displayLabel : buttonProps["aria-label"]}
      aria-busy={isBusy || undefined}
      className={className}
      disabled={disabled || isBusy}
      leadingIcon={!resolvedIconOnly && showIcon ? renderedIcon : undefined}
      size={size ?? definition.size}
      variant={variant ?? definition.variant}
    >
      {resolvedIconOnly ? renderedIcon : (isBusy && busyLabel) || displayLabel}
    </DashboardButton>
  );
}

type SpecificDashboardActionButtonProps = Omit<DashboardActionButtonProps, "action">;

export function SaveActionButton(props: SpecificDashboardActionButtonProps) {
  return <DashboardActionButton {...props} action={DashboardActionId.Save} />;
}

export function DeleteActionButton(props: SpecificDashboardActionButtonProps) {
  return <DashboardActionButton {...props} action={DashboardActionId.Delete} />;
}

export function CancelActionButton(props: SpecificDashboardActionButtonProps) {
  return <DashboardActionButton {...props} action={DashboardActionId.Cancel} />;
}

export function CloseActionButton(props: SpecificDashboardActionButtonProps) {
  return <DashboardActionButton {...props} action={DashboardActionId.Close} iconOnly />;
}
