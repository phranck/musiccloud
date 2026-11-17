import { SupportIntervalKey, type SupportLadderInterval } from "@musiccloud/shared";
import { describe, expect, it } from "vitest";

import {
  floorFor,
  initialSupportLadderState,
  SupportLadderActionType,
  supportLadderReducer,
} from "./supportLadderState";

/** A tab with suggested amounts. */
function amounts(key: SupportLadderInterval["key"], values: number[], recommended?: number): SupportLadderInterval {
  return {
    key,
    label: key,
    text: "",
    hint: "",
    belowMinimum: "",
    options: values.map((amountEur) => ({ amountEur, description: "", recommended: amountEur === recommended })),
    custom: { label: "Other", placeholder: "", text: "" },
    sponsorForm: null,
  };
}

/** The sponsor tab: a free field and no suggested amounts. */
const sponsor: SupportLadderInterval = { ...amounts(SupportIntervalKey.Sponsor, []) };

const once = amounts(SupportIntervalKey.Once, [5, 10, 25], 25);
const monthly = amounts(SupportIntervalKey.Monthly, [3, 5, 10]);

/** The sponsor minimum these tests use, in euros. */
const MINIMUM = 50;

describe("supportLadderReducer", () => {
  it("opens on the recommended amount of the first tab", () => {
    expect(initialSupportLadderState([once, monthly], MINIMUM)).toEqual({
      intervalKey: SupportIntervalKey.Once,
      shownKey: SupportIntervalKey.Once,
      amountEur: 25,
      customAmount: "",
    });
  });

  it("moves only the switch when a tab is chosen, and the body once it has faded", () => {
    const chosen = supportLadderReducer(initialSupportLadderState([once, monthly], MINIMUM), {
      type: SupportLadderActionType.ChooseInterval,
      key: SupportIntervalKey.Monthly,
    });
    expect(chosen.intervalKey).toBe(SupportIntervalKey.Monthly);
    expect(chosen.shownKey).toBe(SupportIntervalKey.Once);
    expect(chosen.amountEur).toBe(25);

    const shown = supportLadderReducer(chosen, {
      type: SupportLadderActionType.ShowInterval,
      key: SupportIntervalKey.Monthly,
      interval: monthly,
      floorEur: floorFor(SupportIntervalKey.Monthly, MINIMUM),
    });
    // No option is recommended, so the second one is where the tab opens.
    expect(shown).toMatchObject({ shownKey: SupportIntervalKey.Monthly, amountEur: 5, customAmount: "" });
  });

  it("opens the sponsor tab on the minimum, written into the field", () => {
    const shown = supportLadderReducer(initialSupportLadderState([once, sponsor], MINIMUM), {
      type: SupportLadderActionType.ShowInterval,
      key: SupportIntervalKey.Sponsor,
      interval: sponsor,
      floorEur: floorFor(SupportIntervalKey.Sponsor, MINIMUM),
    });
    expect(shown).toMatchObject({ amountEur: MINIMUM, customAmount: String(MINIMUM) });
  });

  it("asks for no floor on the tabs other than the sponsor tab", () => {
    expect(floorFor(SupportIntervalKey.Once, MINIMUM)).toBe(0);
    expect(floorFor(SupportIntervalKey.Monthly, MINIMUM)).toBe(0);
  });

  it("clears the free field when a suggested amount is chosen", () => {
    const typed = { ...initialSupportLadderState([once], MINIMUM), customAmount: "12", amountEur: 12 };
    expect(supportLadderReducer(typed, { type: SupportLadderActionType.ChooseAmount, amountEur: 10 })).toMatchObject({
      amountEur: 10,
      customAmount: "",
    });
  });

  it("keeps the amount while a figure is half typed, and returns to the start when the field empties", () => {
    const start = initialSupportLadderState([once], MINIMUM);
    const typing = { type: SupportLadderActionType.EnterCustom, interval: once, floorEur: 0 } as const;

    const half = supportLadderReducer(start, { ...typing, cleaned: "0.", amountEur: null });
    expect(half).toMatchObject({ customAmount: "0.", amountEur: 25 });

    const typed = supportLadderReducer(half, { ...typing, cleaned: "0.5", amountEur: 0.5 });
    expect(typed.amountEur).toBe(0.5);

    const emptied = supportLadderReducer(typed, { ...typing, cleaned: "", amountEur: null });
    expect(emptied).toMatchObject({ customAmount: "", amountEur: 25 });
  });
});
