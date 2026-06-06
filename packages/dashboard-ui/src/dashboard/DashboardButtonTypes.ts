import type { ButtonPrimitiveSize, ButtonPrimitiveVariant } from "../primitives/ButtonPrimitive.js";

export const DashboardButtonVariant = {
  Neutral: "neutral",
  Primary: "primary",
  Success: "success",
  Warning: "warning",
  Danger: "danger",
  Filled: "filled",
  Accent: "accent",
  Ghost: "ghost",
  Review: "review",
} as const;

export type DashboardButtonVariant = ButtonPrimitiveVariant | typeof DashboardButtonVariant.Review;
export type DashboardButtonSize = ButtonPrimitiveSize;
