import { DashboardButton, DashboardButtonVariant } from "@musiccloud/dashboard-ui";
import { CaretLeftIcon } from "@phosphor-icons/react";
import type { ButtonHTMLAttributes } from "react";

interface HeaderBackButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
}

export function HeaderBackButton({ className, label, type = "button", ...props }: HeaderBackButtonProps) {
  return (
    <DashboardButton
      {...props}
      className={className}
      leadingIcon={<CaretLeftIcon weight="duotone" className="w-3.5 h-3.5 shrink-0" />}
      size="action"
      type={type}
      variant={DashboardButtonVariant.Ghost}
    >
      <span>{label}</span>
    </DashboardButton>
  );
}
