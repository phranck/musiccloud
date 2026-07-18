export const NavigationMaskKind = {
  Context: "context",
  Area: "area",
} as const;

export type NavigationMaskKind = (typeof NavigationMaskKind)[keyof typeof NavigationMaskKind];
