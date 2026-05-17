import { DashboardButton, type DashboardButtonVariant } from "@musiccloud/dashboard-ui";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type EditorToolbarButtonVariant = Extract<
  DashboardButtonVariant,
  "primary" | "success" | "warning" | "danger" | "neutral" | "review"
>;

interface EditorToolbarButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  icon?: ReactNode;
  variant?: EditorToolbarButtonVariant;
}

export function EditorToolbarButton({
  children,
  className,
  icon,
  type = "button",
  variant = "neutral",
  ...props
}: EditorToolbarButtonProps) {
  return (
    <DashboardButton {...props} className={className} leadingIcon={icon} size="control" type={type} variant={variant}>
      {children}
    </DashboardButton>
  );
}
