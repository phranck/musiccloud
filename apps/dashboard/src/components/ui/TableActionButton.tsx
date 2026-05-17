import { DashboardButton, type DashboardButtonVariant } from "@musiccloud/dashboard-ui";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

type Variant = Extract<DashboardButtonVariant, "neutral" | "danger" | "warning" | "success" | "primary">;

interface TableActionButtonProps extends ComponentPropsWithoutRef<"button"> {
  variant?: Variant;
  icon?: ReactNode;
  label?: string;
}

export function TableActionButton({
  variant = "neutral",
  icon,
  label,
  className,
  children,
  ...rest
}: TableActionButtonProps) {
  return (
    <DashboardButton {...rest} className={className} leadingIcon={icon} size="action" type="button" variant={variant}>
      {label}
      {children}
    </DashboardButton>
  );
}
