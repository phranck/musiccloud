/**
 * @file The amounts of one tab: the suggested ones as cards, and the free field.
 *
 * Ported from lmaa.space (`apps/frontend/src/components/islands/SupportLadderAmounts.tsx`).
 */

import { SupportIntervalKey, type SupportLadderInterval } from "@musiccloud/shared";
import { CheckCircleIcon } from "@phosphor-icons/react";
import { useId, useState } from "react";
import { ContentCard } from "@/components/cards/ContentCard";
import { embossedCardOuterRadius, recessedControlInsetClassName } from "@/components/cards/cardGeometry";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { cn } from "@/lib/utils";

import { formatEuro } from "./amountInput";
import { LadderRichText } from "./LadderRichText";
import { LADDER_INPUT_CLASS, ladderFieldLabelId } from "./ladderFieldParts";
import {
  SUPPORT_CARD_TITLE_CLASS,
  SUPPORT_QUALIFIER_CLASS,
  SUPPORT_TEXT_CLASS,
  SUPPORT_TEXT_SIZE_CLASS,
} from "./supportType";

/** The currency sign the free field stands behind. */
const EURO_SIGN = "€";

/**
 * The class of a suggested amount's card, which `global.css` gives the accent
 * tint and edge while it carries {@link CHOSEN_CLASS}.
 */
const AMOUNT_CARD_CLASS = "mc-amount-card";

/**
 * The class of the free amount's card, which `global.css` gives a dashed edge,
 * and the accent tint and edge while it carries {@link CHOSEN_CLASS}.
 */
const AMOUNT_FIELD_CLASS = "mc-amount-field";

/** What marks the amount card or the free field that holds the amount in force. */
const CHOSEN_CLASS = "is-chosen";

/**
 * The button around a suggested amount's card. It takes the card's corner, so
 * its focus ring follows the card, and lifts the card a little under the
 * pointer, as lmaa.space does. Only the transform moves.
 */
const AMOUNT_BUTTON_CLASS =
  "block h-full w-full text-left transition-transform duration-150 ease-out hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]";

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
  /**
   * Whether the free field stands without a card of its own. `true` draws a
   * centered heading over the amount, written on an underline at the size the
   * figure deserves, for a tab that stands everything it asks on one card,
   * because a second surface around a single field inside that card reads as a
   * mistake rather than as structure. `false`, the default, sets the field in
   * a card of its own under the suggested amounts.
   */
  bare?: boolean;
}

/**
 * Classes of the free field's input when it stands {@link AmountGridProps.bare}:
 * a line to write on rather than a box to fill, with no surface or corners of
 * its own and the figure sitting on the rule, wide enough for a five-figure
 * amount and no wider.
 */
const BARE_AMOUNT_INPUT_CLASS =
  "h-12 w-32 flex-none appearance-none rounded-none border-0 border-b border-border bg-transparent pr-2 text-right font-mono text-2xl font-bold tabular-nums text-text-primary";

/**
 * Classes of the free field's input in its own card: a small well wide enough
 * for a five-figure amount and no wider, because the field should look like
 * what belongs in it.
 */
const CARD_AMOUNT_INPUT_CLASS = cn(LADDER_INPUT_CLASS, "h-9 w-24 flex-none px-3 text-lg font-semibold tabular-nums");

/**
 * The suggested amounts of one tab and its free field, as lmaa.space lays them
 * out.
 *
 * Every suggestion is a content card of its own, the cards standing in one row
 * from the `lg` width up and in two columns from `sm`, because they are read
 * against each other. The chosen card carries the accent tint and edge and a
 * check mark, and is marked with `aria-pressed`, so it is not told apart by
 * color alone. The free field is the alternative to all of them and stands in a
 * card of its own beneath, two columns wide and centered under them, with a
 * dashed edge; or, where it is `bare`, under a centered heading as an amount
 * written on an underline.
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
  bare = false,
}: AmountGridProps) {
  const customActive = customAmount.trim() !== "";
  const hasOptions = interval.options.length > 0;
  const monthly = interval.key === SupportIntervalKey.Monthly;
  const [leftTheField, setLeftTheField] = useState(false);
  // Unique per ladder, because a page may carry more than one.
  const fieldId = useId();
  const belowMinimum = leftTheField && minimumEur > 0 && amountEur > 0 && amountEur < minimumEur;

  /**
   * The free field's input, the same control in either drawing.
   *
   * Where the tab names a floor, the empty field shows that floor rather than
   * a number written into the page, because emptying the field hands the
   * choice back to the floor.
   *
   * @param className - The input's classes, which differ between the card and the bare drawing.
   * @returns The input.
   */
  const amountInput = (className: string) => (
    <input
      id={fieldId}
      aria-labelledby={ladderFieldLabelId(fieldId)}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={customAmount}
      placeholder={minimumEur > 0 ? String(minimumEur) : interval.custom?.placeholder}
      onChange={(event) => {
        setLeftTheField(false);
        onCustom(event.target.value);
      }}
      onBlur={() => setLeftTheField(true)}
      className={className}
    />
  );

  // The free field's heading. It names what the field asks, and the label
  // inside it keeps the field's name. The type is set on the wrapper, because
  // the ladder's prose reset makes its headings inherit.
  const heading = interval.custom && (
    <div className={SUPPORT_CARD_TITLE_CLASS}>
      <h3>
        <label id={ladderFieldLabelId(fieldId)} htmlFor={fieldId}>
          {interval.custom.label}
        </label>
      </h3>
    </div>
  );

  const minimum = belowMinimum && minimumNotice && (
    <LadderRichText html={minimumNotice} role="status" className={cn(SUPPORT_TEXT_SIZE_CLASS, "text-secondary")} />
  );

  return (
    <div className={cn("grid gap-[var(--mc-gap-cards,1.5rem)]", hasOptions && "sm:grid-cols-2 lg:grid-cols-4")}>
      {interval.options.map((option) => {
        const active = !customActive && option.amountEur === amountEur;
        return (
          <button
            // The shared reader keeps each amount of a tab once, so it identifies the option.
            key={option.amountEur}
            type="button"
            aria-pressed={active}
            onClick={() => onChoose(option.amountEur)}
            className={AMOUNT_BUTTON_CLASS}
            style={{ borderRadius: embossedCardOuterRadius }}
          >
            <ContentCard className={cn(AMOUNT_CARD_CLASS, "h-full flex flex-col gap-1", active && CHOSEN_CLASS)}>
              <span className="pr-7 text-xl font-bold tabular-nums text-text-primary">
                {formatEuro(option.amountEur)}
                {monthly && <span className={cn("ml-1", SUPPORT_QUALIFIER_CLASS)}>{perMonthLabel}</span>}
              </span>
              <LadderRichText html={option.description} className={SUPPORT_TEXT_CLASS} />
              {/* A tick, so the chosen amount is not marked by color alone. */}
              {active && (
                <CheckCircleIcon
                  weight="fill"
                  aria-hidden="true"
                  className="absolute top-0 right-0 size-5 text-[var(--color-accent)]"
                />
              )}
            </ContentCard>
          </button>
        );
      })}

      {interval.custom &&
        (bare ? (
          <div className="flex flex-col items-center gap-2 text-center">
            {heading}
            <div className="flex items-center justify-center gap-2">
              <span aria-hidden="true" className="text-2xl font-bold text-text-primary">
                {EURO_SIGN}
              </span>
              {amountInput(BARE_AMOUNT_INPUT_CLASS)}
              {monthly && <span className={SUPPORT_QUALIFIER_CLASS}>{perMonthLabel}</span>}
            </div>
            <LadderRichText html={interval.custom.text} className={SUPPORT_TEXT_CLASS} />
            {minimum}
          </div>
        ) : (
          // The free amount is the alternative to all the suggestions rather
          // than one more of them, so it stands on a row of its own, two cards
          // wide and centered under them. Where there are no suggestions it is
          // the only card and fills what it is given.
          <ContentCard
            className={cn(
              AMOUNT_FIELD_CLASS,
              "flex flex-col gap-2",
              hasOptions && "col-span-full sm:col-span-2 lg:col-span-2 lg:col-start-2",
              customActive && CHOSEN_CLASS,
            )}
          >
            {heading}
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="text-xl font-bold text-text-primary">
                {EURO_SIGN}
              </span>
              <RecessedCard className={recessedControlInsetClassName}>
                {amountInput(CARD_AMOUNT_INPUT_CLASS)}
              </RecessedCard>
              {monthly && <span className={cn("whitespace-nowrap", SUPPORT_QUALIFIER_CLASS)}>{perMonthLabel}</span>}
            </div>
            <LadderRichText html={interval.custom.text} className={SUPPORT_TEXT_CLASS} />
            {minimum}
          </ContentCard>
        ))}
    </div>
  );
}
