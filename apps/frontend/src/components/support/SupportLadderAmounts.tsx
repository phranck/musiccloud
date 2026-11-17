/**
 * @file The amounts of one tab: the suggested ones as a grid, and the free field.
 */

import { SupportIntervalKey, type SupportLadderInterval } from "@musiccloud/shared";
import { useId, useState } from "react";

import { recessedControlInsetClassName } from "@/components/cards/cardGeometry";
import { gridCornerStyle } from "@/components/cards/gridCornerStyle";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { cn } from "@/lib/utils";

import { formatEuro } from "./amountInput";
import { LadderField } from "./LadderField";
import { LadderRichText } from "./LadderRichText";
import { LADDER_INPUT_CLASS, ladderFieldLabelId } from "./ladderFieldParts";

/** The currency sign the free field stands behind. */
const EURO_SIGN = "€";

/** Props of {@link AmountGrid}. */
interface AmountGridProps {
  /** The tab whose amounts these are. */
  interval: SupportLadderInterval;
  /** The amount chosen, in euros. */
  amountEur: number;
  /** What the free field holds. */
  customAmount: string;
  /** What follows a monthly amount, such as "a month". */
  perMonthLabel: string;
  /** The least this tab accepts, in euros; 0 when it names no floor. */
  minimumEur: number;
  /** What the tab says below that floor, with `{min}` already filled in. */
  minimumNotice: string;
  /** Receives a suggested amount the reader chose. */
  onChoose: (amountEur: number) => void;
  /** Receives what the reader typed into the free field. */
  onCustom: (value: string) => void;
}

/**
 * The suggested amounts of one tab and its free field.
 *
 * The suggestions form one grouped grid of raised tiles in a recessed well, so
 * only the tiles' corners at the well's corners take the full radius. The
 * chosen tile is pressed in and marked with `aria-pressed`, so it is not told
 * apart by its look alone. The free field is the alternative to all of them and
 * stands in a well of its own beneath.
 *
 * Below the floor the field says so rather than refusing: the transfer happens
 * in the reader's bank, so the field cannot stop an amount, only say what it
 * earns. It waits until the reader leaves the field, because somebody typing 40
 * passes through 4 on the way.
 *
 * @param props - See {@link AmountGridProps}.
 * @returns The amounts.
 */
export function AmountGrid({
  interval,
  amountEur,
  customAmount,
  perMonthLabel,
  minimumEur,
  minimumNotice,
  onChoose,
  onCustom,
}: AmountGridProps) {
  const customActive = customAmount.trim() !== "";
  const monthly = interval.key === SupportIntervalKey.Monthly;
  const [leftTheField, setLeftTheField] = useState(false);
  // Unique per ladder, because a page may carry more than one.
  const fieldId = useId();
  const belowMinimum = leftTheField && minimumEur > 0 && amountEur > 0 && amountEur < minimumEur;

  return (
    <div className="flex flex-col gap-[var(--mc-gap-rowitem,0.75rem)]">
      {interval.options.length > 0 && (
        <RecessedCard className={recessedControlInsetClassName}>
          <div className="grid grid-cols-2 gap-[var(--mc-gap-grid,0.125rem)]">
            {interval.options.map((option, index) => {
              const active = !customActive && option.amountEur === amountEur;
              return (
                <EmbossedButton
                  // The shared reader keeps each amount of a tab once, so it identifies the option.
                  key={option.amountEur}
                  as="button"
                  aria-pressed={active}
                  pressed={active}
                  onClick={() => onChoose(option.amountEur)}
                  className="flex flex-col items-start gap-1 text-left"
                  style={gridCornerStyle(index, interval.options.length)}
                >
                  <span className="text-lg font-bold tabular-nums text-text-primary">
                    {formatEuro(option.amountEur)}
                    {monthly && <span className="ml-1 text-sm font-medium text-text-secondary">{perMonthLabel}</span>}
                  </span>
                  <LadderRichText html={option.description} className="text-sm text-text-secondary" />
                </EmbossedButton>
              );
            })}
          </div>
        </RecessedCard>
      )}

      {interval.custom && (
        <div className="flex flex-col gap-2">
          <LadderField controlId={fieldId} label={interval.custom.label} wellClassName="flex items-center gap-2">
            <span aria-hidden="true" className="pl-3 text-lg font-bold text-text-secondary">
              {EURO_SIGN}
            </span>
            <input
              id={fieldId}
              aria-labelledby={ladderFieldLabelId(fieldId)}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={customAmount}
              placeholder={minimumEur > 0 ? String(minimumEur) : interval.custom.placeholder}
              onChange={(event) => {
                setLeftTheField(false);
                onCustom(event.target.value);
              }}
              onBlur={() => setLeftTheField(true)}
              className={cn(LADDER_INPUT_CLASS, "h-10 pr-3 text-lg font-semibold tabular-nums")}
            />
            {monthly && (
              <span className="pr-3 text-sm font-medium text-text-secondary whitespace-nowrap">{perMonthLabel}</span>
            )}
          </LadderField>
          <LadderRichText html={interval.custom.text} className="text-sm text-text-secondary" />
          {belowMinimum && minimumNotice && (
            <LadderRichText html={minimumNotice} role="status" className="text-sm text-secondary" />
          )}
        </div>
      )}
    </div>
  );
}
