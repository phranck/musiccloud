/**
 * @file Value namespace for the {@link FlowConnector} direction discriminant —
 * lives apart from the component so consumers can reference members without
 * importing component code (and per the no-logic-exports-in-component-files rule).
 */

/** Flow direction the connector arrow points in. */
export const FlowDirection = {
  Vertical: "vertical",
  Horizontal: "horizontal",
} as const;

/** A direction value from {@link FlowDirection}. */
export type FlowDirectionValue = (typeof FlowDirection)[keyof typeof FlowDirection];
