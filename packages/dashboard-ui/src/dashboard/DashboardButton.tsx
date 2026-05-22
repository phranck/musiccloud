import type { ReactNode } from "react";

import { cx } from "../classNames.js";
import {
  ButtonPrimitive,
  type ButtonPrimitiveProps,
  type ButtonPrimitiveSize,
  type ButtonPrimitiveVariant,
  IconButtonPrimitive,
  type IconButtonPrimitiveProps,
} from "../primitives/ButtonPrimitive.js";
import { dashboardReviewVariantClass, resolveDashboardPrimitiveVariant } from "./dashboardButtonClasses.js";

export type DashboardButtonVariant = ButtonPrimitiveVariant | "review";
export type DashboardButtonSize = ButtonPrimitiveSize;

export interface DashboardButtonProps extends Omit<ButtonPrimitiveProps, "variant"> {
  variant?: DashboardButtonVariant;
}

export interface DashboardIconButtonProps extends Omit<IconButtonPrimitiveProps, "variant"> {
  variant?: DashboardButtonVariant;
}

export function DashboardButton({
  className,
  size = "action",
  variant = "neutral",
  ...buttonProps
}: DashboardButtonProps) {
  return (
    <ButtonPrimitive
      {...buttonProps}
      size={size}
      variant={resolveDashboardPrimitiveVariant(variant)}
      className={cx(variant === "review" && dashboardReviewVariantClass, className)}
    />
  );
}

export function DashboardIconButton({
  className,
  size = "action",
  variant = "ghost",
  ...buttonProps
}: DashboardIconButtonProps) {
  return (
    <IconButtonPrimitive
      {...buttonProps}
      size={size}
      variant={resolveDashboardPrimitiveVariant(variant)}
      className={cx(variant === "review" && dashboardReviewVariantClass, className)}
    />
  );
}

export interface DashboardButtonIconProps {
  children: ReactNode;
}

export function DashboardButtonIcon({ children }: DashboardButtonIconProps) {
  return <span className="inline-flex size-3.5 shrink-0 items-center justify-center">{children}</span>;
}
