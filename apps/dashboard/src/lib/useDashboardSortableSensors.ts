/**
 * @file Shared dnd-kit sensor setup for sortable dashboard UIs (ported from
 * lmaa.space): pointer + keyboard sensors with an optional pointer activation
 * distance, so plain clicks on draggable cards still fire their onClick
 * instead of starting a drag.
 */

import { KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";

interface DashboardSortableSensorsOptions {
  /** Pixels the pointer must travel before a drag starts (omit for immediate activation). */
  activationDistance?: number;
}

/**
 * Returns dnd-kit sensors (pointer + keyboard with sortable coordinates) for
 * dashboard sortable lists.
 *
 * @param options - Optional pointer activation distance.
 */
export function useDashboardSortableSensors({ activationDistance }: DashboardSortableSensorsOptions = {}) {
  const pointerOptions =
    activationDistance === undefined ? undefined : { activationConstraint: { distance: activationDistance } };

  return useSensors(
    useSensor(PointerSensor, pointerOptions),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}
