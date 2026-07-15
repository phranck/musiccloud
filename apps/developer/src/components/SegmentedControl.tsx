/**
 * Reusable segmented-control primitive.
 *
 * Callers provide semantics such as `tablist`/`tab` and state attributes;
 * this compound owns only the shared segmented surface and item slots.
 */
import { createCompoundElement } from "@/components/compoundElement";

const SegmentedControlRoot = createCompoundElement("div", "segmented-control");
const SegmentedControlItem = createCompoundElement("button", "segmented-control__item");

export const SegmentedControl = Object.assign(SegmentedControlRoot, {
  Item: SegmentedControlItem,
});
