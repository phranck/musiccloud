export const SegmentedControlPrimitiveSize = {
  Compact: "compact",
  Default: "default",
  Large: "large",
} as const;

export const SegmentedControlPrimitiveVariant = {
  Filled: "filled",
  Outline: "outline",
} as const;

export type SegmentedControlPrimitiveSize =
  (typeof SegmentedControlPrimitiveSize)[keyof typeof SegmentedControlPrimitiveSize];
export type SegmentedControlPrimitiveVariant =
  (typeof SegmentedControlPrimitiveVariant)[keyof typeof SegmentedControlPrimitiveVariant];
