import { cx } from "../classNames.js";
import type { ButtonPrimitiveVariant } from "../primitives/ButtonPrimitive.js";
import { getButtonPrimitiveClassName, getIconButtonPrimitiveClassName } from "../primitives/buttonPrimitiveClasses.js";
import type { DashboardButtonSize, DashboardButtonVariant } from "./DashboardButtonTypes.js";

interface DashboardButtonClassNameOptions {
  className?: string;
  size?: DashboardButtonSize;
  variant?: DashboardButtonVariant;
}

export const dashboardReviewVariantClass =
  "border-[var(--ds-badge-review-text)]/30 text-[var(--ds-badge-review-text)] hover:border-[var(--ds-badge-review-text)]/50 hover:bg-[var(--ds-badge-review-bg)]";

export function resolveDashboardPrimitiveVariant(variant: DashboardButtonVariant | undefined): ButtonPrimitiveVariant {
  return variant === "review" ? "neutral" : (variant ?? "neutral");
}

export function getDashboardButtonClassName({
  className,
  size = "action",
  variant = "neutral",
}: DashboardButtonClassNameOptions = {}) {
  return getButtonPrimitiveClassName({
    className: cx(variant === "review" && dashboardReviewVariantClass, className),
    size,
    variant: resolveDashboardPrimitiveVariant(variant),
  });
}

export function getDashboardIconButtonClassName({
  className,
  size = "action",
  variant = "ghost",
}: DashboardButtonClassNameOptions = {}) {
  return getIconButtonPrimitiveClassName({
    className: cx(variant === "review" && dashboardReviewVariantClass, className),
    size,
    variant: resolveDashboardPrimitiveVariant(variant),
  });
}
