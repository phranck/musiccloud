import type { ReactNode } from "react";

import { cx } from "../classNames.js";
import {
  ButtonPrimitive,
  type ButtonPrimitiveProps,
  IconButtonPrimitive,
  type IconButtonPrimitiveProps,
} from "../primitives/ButtonPrimitive.js";
import {
  DashboardButtonVariant,
  type DashboardButtonVariant as DashboardButtonVariantType,
} from "./DashboardButtonTypes.js";
import { dashboardReviewVariantClass, resolveDashboardPrimitiveVariant } from "./dashboardButtonClasses.js";

export interface DashboardButtonProps extends Omit<ButtonPrimitiveProps, "variant"> {
  variant?: DashboardButtonVariantType;
}

export interface DashboardIconButtonProps extends Omit<IconButtonPrimitiveProps, "variant"> {
  variant?: DashboardButtonVariantType;
}

export function DashboardButton({
  className,
  size = "action",
  variant = DashboardButtonVariant.Neutral,
  ...buttonProps
}: DashboardButtonProps) {
  return (
    <ButtonPrimitive
      {...buttonProps}
      size={size}
      variant={resolveDashboardPrimitiveVariant(variant)}
      className={cx(variant === DashboardButtonVariant.Review && dashboardReviewVariantClass, className)}
    />
  );
}

export function DashboardIconButton({
  className,
  size = "action",
  variant = DashboardButtonVariant.Ghost,
  ...buttonProps
}: DashboardIconButtonProps) {
  return (
    <IconButtonPrimitive
      {...buttonProps}
      size={size}
      variant={resolveDashboardPrimitiveVariant(variant)}
      className={cx(variant === DashboardButtonVariant.Review && dashboardReviewVariantClass, className)}
    />
  );
}

export interface DashboardButtonIconProps {
  children: ReactNode;
}

export function DashboardButtonIcon({ children }: DashboardButtonIconProps) {
  return <span className="inline-flex size-3.5 shrink-0 items-center justify-center">{children}</span>;
}
