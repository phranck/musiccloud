import type { TierOffer } from "@musiccloud/shared";
import {
  BillingPeriod,
  type BillingPeriodValue,
  CENTS_PER_UNIT,
  CreemMode,
  type CreemModeValue,
  OfferCurrency,
  type OfferCurrencyValue,
} from "@musiccloud/shared";
import { dashboardCopy } from "@/copy/dashboard";

const dm = dashboardCopy.developer;

/** What an operator reads for each billing period. */
const PERIOD_LABEL: Record<BillingPeriodValue, string> = {
  [BillingPeriod.Once]: dm.periodOnce,
  [BillingPeriod.Daily]: dm.periodDaily,
  [BillingPeriod.Monthly]: dm.periodMonthly,
  [BillingPeriod.Quarterly]: dm.periodQuarterly,
  [BillingPeriod.HalfYearly]: dm.periodHalfYearly,
  [BillingPeriod.Yearly]: dm.periodYearly,
};

/** What an operator reads for each Creem environment. */
const MODE_LABEL: Record<CreemModeValue, string> = {
  [CreemMode.Test]: dm.creemEnvironmentTest,
  [CreemMode.Live]: dm.creemEnvironmentLive,
};

/**
 * The Creem environments in the order a switch offers them.
 *
 * The tier editor's environment tabs and the selling switch offer the same
 * two, so both read this list.
 */
export const CREEM_MODE_OPTIONS = [
  { value: CreemMode.Test, label: MODE_LABEL[CreemMode.Test] },
  { value: CreemMode.Live, label: MODE_LABEL[CreemMode.Live] },
] as const;

/**
 * The label an operator reads for a Creem environment.
 *
 * @param mode - The environment.
 * @returns Its label.
 */
export function creemModeLabel(mode: CreemModeValue): string {
  return MODE_LABEL[mode];
}

/**
 * One formatter per currency, built once.
 *
 * `toLocaleString` constructs a formatter on every call, and an offer list is
 * rendered on every keystroke in the page around it.
 */
const MONEY: Record<OfferCurrencyValue, Intl.NumberFormat> = {
  [OfferCurrency.Eur]: new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" }),
  [OfferCurrency.Usd]: new Intl.NumberFormat("en-GB", { style: "currency", currency: "USD" }),
};

/**
 * The label an operator reads for a billing period.
 *
 * @param period - The period, in Creem's spelling.
 * @returns Its label.
 */
export function periodLabel(period: BillingPeriodValue): string {
  return PERIOD_LABEL[period];
}

/**
 * The amount of an offer, with its currency symbol.
 *
 * @param offer - The offer.
 * @returns The amount as a reader sees it.
 */
export function formatOfferPrice(offer: Pick<TierOffer, "priceCents" | "currency">): string {
  return MONEY[offer.currency].format(offer.priceCents / CENTS_PER_UNIT);
}
