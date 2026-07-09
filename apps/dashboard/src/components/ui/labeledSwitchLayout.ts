/**
 * @file Layout option namespaces for {@link LabeledSwitch}.
 *
 * These live in their own module (not in the component file) so the component
 * file only exports a component, which keeps React Fast Refresh happy.
 */

/**
 * Where the label sits relative to the switch. Modelled as an `as const`
 * namespace (PascalCase members) per the project's domain-literal convention,
 * so call sites compare against members instead of inline string literals.
 */
export const SwitchLabelPosition = {
  Left: "left",
  Top: "top",
  Right: "right",
  Bottom: "bottom",
} as const;
export type SwitchLabelPosition = (typeof SwitchLabelPosition)[keyof typeof SwitchLabelPosition];

/**
 * Cross-axis alignment of the label and the switch when they are stacked
 * (label position `Top` or `Bottom`): centered on the shared axis, or flush to
 * the start or end edge.
 */
export const SwitchStackAlign = {
  Start: "start",
  Center: "center",
  End: "end",
} as const;
export type SwitchStackAlign = (typeof SwitchStackAlign)[keyof typeof SwitchStackAlign];

/** Tailwind cross-axis alignment class for each stacked alignment. */
export const stackAlignClass = {
  [SwitchStackAlign.Start]: "items-start",
  [SwitchStackAlign.Center]: "items-center",
  [SwitchStackAlign.End]: "items-end",
} as const;
