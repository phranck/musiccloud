/**
 * @file What the support ladder shows, as one state with named transitions.
 *
 * Four values move together: the tab that was chosen, the tab whose body is on
 * screen, the chosen amount, and what stands in the free field. Choosing a tab
 * changes all four in two steps separated by the fade, and a reducer keeps
 * those steps readable and testable.
 */

import type { SupportIntervalKeyValue, SupportLadderInterval } from "@musiccloud/shared";
import { SupportIntervalKey } from "@musiccloud/shared";

/**
 * What the ladder shows right now.
 *
 * @property intervalKey - The tab that was chosen. It moves the moment somebody
 *   clicks, because that is what they just did.
 * @property shownKey - The tab whose body is on screen. It follows
 *   `intervalKey` once the old body has faded, so two bodies are never half
 *   visible at once.
 * @property amountEur - The amount a transfer would carry, in euros. 0 means
 *   none is chosen.
 * @property customAmount - What stands in the free field, already normalized.
 *   Empty while a suggested amount is chosen.
 */
export interface SupportLadderState {
  intervalKey: SupportIntervalKeyValue;
  shownKey: SupportIntervalKeyValue;
  amountEur: number;
  customAmount: string;
}

/**
 * What can happen to the ladder.
 *
 * - `ChooseInterval`: somebody chose a tab; only the switch moves.
 * - `ShowInterval`: the fade has finished; the body and the amount follow.
 * - `ChooseAmount`: somebody chose a suggested amount.
 * - `EnterCustom`: somebody typed in the free field.
 */
export const SupportLadderActionType = {
  ChooseInterval: "choose-interval",
  ShowInterval: "show-interval",
  ChooseAmount: "choose-amount",
  EnterCustom: "enter-custom",
} as const;

/** Everything that can happen to the ladder, by {@link SupportLadderActionType}. */
export type SupportLadderAction =
  | { type: typeof SupportLadderActionType.ChooseInterval; key: SupportIntervalKeyValue }
  | {
      type: typeof SupportLadderActionType.ShowInterval;
      key: SupportIntervalKeyValue;
      /** The tab being shown, whose amounts the ladder opens on. */
      interval: SupportLadderInterval | undefined;
      /** The least amount that tab accepts, in euros. */
      floorEur: number;
    }
  | { type: typeof SupportLadderActionType.ChooseAmount; amountEur: number }
  | {
      type: typeof SupportLadderActionType.EnterCustom;
      /** What the field holds, already normalized. */
      cleaned: string;
      /** What that reads as, or `null` where it is not yet an amount. */
      amountEur: number | null;
      /** The tab on screen, whose starting amount returns when the field is emptied. */
      interval: SupportLadderInterval | undefined;
      floorEur: number;
    };

/** The position of the option a tab opens on when none is recommended: the second, 1. */
const FALLBACK_OPTION_INDEX = 1;

/**
 * The amount a tab opens on.
 *
 * The page decides by marking one option recommended. Without one the second
 * option is taken, which is low enough not to hide the cheapest and high enough
 * not to anchor the reader on it. A tab without suggested amounts opens on its
 * floor, which is what the sponsor tab does.
 *
 * @param interval - The tab being opened.
 * @param floorEur - The least amount that tab accepts, in euros.
 * @returns The amount to start at, in euros.
 */
function startingAmount(interval: SupportLadderInterval | undefined, floorEur: number): number {
  if (!interval || interval.options.length === 0) return floorEur;
  const recommended = interval.options.find((option) => option.recommended);
  if (recommended) return recommended.amountEur;
  return interval.options[Math.min(FALLBACK_OPTION_INDEX, interval.options.length - 1)]?.amountEur ?? floorEur;
}

/**
 * What the free field holds when a tab opens.
 *
 * A tab with suggested amounts leaves it empty, because one of them is the
 * choice until somebody types. A tab without them shows its floor, ready to be
 * changed.
 *
 * @param interval - The tab being opened.
 * @param floorEur - The least amount that tab accepts, in euros.
 * @returns What the field shows.
 */
function startingCustomAmount(interval: SupportLadderInterval | undefined, floorEur: number): string {
  if (!interval || interval.options.length > 0 || floorEur <= 0) return "";
  return String(floorEur);
}

/**
 * The floor of a tab: the sponsor minimum on the sponsor tab, nothing elsewhere.
 *
 * @param key - The tab.
 * @param minSponsorAmountEur - The sponsor minimum in euros.
 * @returns The least amount the tab accepts, in euros.
 */
export function floorFor(key: SupportIntervalKeyValue, minSponsorAmountEur: number): number {
  return key === SupportIntervalKey.Sponsor ? minSponsorAmountEur : 0;
}

/**
 * Where the ladder stands when it first renders.
 *
 * @param intervals - The tabs, in order. The first one is open.
 * @param minSponsorAmountEur - The sponsor minimum in euros.
 * @returns The opening state.
 */
export function initialSupportLadderState(
  intervals: readonly SupportLadderInterval[],
  minSponsorAmountEur: number,
): SupportLadderState {
  const first = intervals[0];
  const key = first?.key ?? SupportIntervalKey.Once;
  const floorEur = floorFor(key, minSponsorAmountEur);
  return {
    intervalKey: key,
    shownKey: key,
    amountEur: startingAmount(first, floorEur),
    customAmount: startingCustomAmount(first, floorEur),
  };
}

/**
 * Moves the ladder from one state to the next.
 *
 * @param state - Where it stands.
 * @param action - What happened.
 * @returns Where it stands afterwards.
 */
export function supportLadderReducer(state: SupportLadderState, action: SupportLadderAction): SupportLadderState {
  switch (action.type) {
    case SupportLadderActionType.ChooseInterval:
      return action.key === state.intervalKey ? state : { ...state, intervalKey: action.key };

    case SupportLadderActionType.ShowInterval:
      return {
        ...state,
        shownKey: action.key,
        amountEur: startingAmount(action.interval, action.floorEur),
        customAmount: startingCustomAmount(action.interval, action.floorEur),
      };

    // Choosing an option clears the field, because the two are one choice and a
    // number nobody chose standing in the field would claim otherwise.
    case SupportLadderActionType.ChooseAmount:
      return { ...state, amountEur: action.amountEur, customAmount: "" };

    case SupportLadderActionType.EnterCustom:
      // Emptying the field hands the choice back to the tab's starting amount.
      if (action.cleaned === "") {
        return { ...state, customAmount: "", amountEur: startingAmount(action.interval, action.floorEur) };
      }
      // A half-typed figure keeps the amount it had, so the transfer does not reset.
      return { ...state, customAmount: action.cleaned, amountEur: action.amountEur ?? state.amountEur };
  }
}
