/**
 * @file A labeled field of the support ladder: the free amount and the sponsor form's fields.
 */

import { SealWarningIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { recessedControlInsetClassName } from "@/components/cards/cardGeometry";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { cn } from "@/lib/utils";

import { ladderFieldLabelId } from "./ladderFieldParts";
import { SUPPORT_WELL_CLASS } from "./supportSurface";
import { SUPPORT_LABEL_CLASS, SUPPORT_SMALL_PRINT_CLASS } from "./supportType";

/** Props of {@link LadderField}. */
interface LadderFieldProps {
  /** The `id` of the control inside the well, which the label points at. */
  controlId: string;
  /** What the label says, plain text. */
  label: string;
  /** Whether the field has to be filled in, which puts a mark beside the label. Defaults to `false`. */
  required?: boolean;
  /** A counter at the far end of the label's row, plain text, such as the characters still free. None where absent. */
  counter?: string;
  /** Classes of the well, such as `flex items-center gap-2` for a field with a sign before it. */
  wellClassName?: string;
  /**
   * How far the label's row is drawn in on both sides: `recessedTextInset` from
   * `cardGeometry.ts` for a field standing on the page, so the label begins
   * where its well's curve ends. No inset where absent, which is right inside a
   * padded card, whose padding already holds the label off the curve.
   */
  labelInset?: string;
  /** The control and whatever stands beside it inside the well. */
  children: ReactNode;
}

/**
 * A label over a recessed well holding one control.
 *
 * The well is a `RecessedCard` with the recessed control inset as its padding,
 * the same well the amount tiles stand in, so every field of the ladder is set
 * into the page the same way. The mark of a required field is decoration,
 * because the control itself carries `required`.
 *
 * @param props - See {@link LadderFieldProps}.
 * @returns The label and the well.
 */
export function LadderField({
  controlId,
  label,
  required = false,
  counter,
  wellClassName,
  labelInset,
  children,
}: LadderFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex items-baseline justify-between gap-[var(--mc-gap-rowitem,0.75rem)]"
        style={labelInset ? { paddingInline: labelInset } : undefined}
      >
        <label id={ladderFieldLabelId(controlId)} htmlFor={controlId} className={SUPPORT_LABEL_CLASS}>
          {label}
          {required && (
            <SealWarningIcon
              weight="duotone"
              aria-hidden="true"
              className="ml-1 inline-block size-3.5 align-middle text-error"
            />
          )}
        </label>
        {counter !== undefined && (
          <span className={cn(SUPPORT_SMALL_PRINT_CLASS, "tabular-nums text-text-secondary")}>{counter}</span>
        )}
      </div>
      <RecessedCard className={cn(recessedControlInsetClassName, SUPPORT_WELL_CLASS, wellClassName)}>
        {children}
      </RecessedCard>
    </div>
  );
}
