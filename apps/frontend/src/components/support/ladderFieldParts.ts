/**
 * @file What a control inside a `LadderField` takes from the field: its classes
 * and the id of the label that names it.
 */

/**
 * What every input and text area inside a `LadderField` well shares: no frame
 * of its own, because the well is the frame, and the text in the page's
 * primary color. Size, padding and weight are the field's own.
 */
export const LADDER_INPUT_CLASS =
  "w-full min-w-0 flex-auto appearance-none border-0 bg-transparent text-text-primary outline-none";

/** What a field's label id adds to the control's id: `-label`. */
const LABEL_ID_SUFFIX = "-label";

/**
 * The id of a field's label, which its control names in `aria-labelledby`.
 *
 * The label also points at the control with `htmlFor`, so a click on it moves
 * the caret there. Naming it from the control as well keeps the control's
 * accessible name visible where the control is written.
 *
 * @param controlId - The control's `id`.
 * @returns The label's `id`.
 */
export function ladderFieldLabelId(controlId: string): string {
  return `${controlId}${LABEL_ID_SUFFIX}`;
}
