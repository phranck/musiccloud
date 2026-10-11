import { dashboardCopy } from "@/copy/dashboard";
import type { TierOffer } from "@/features/developer/api";
import { BillingPeriod, OfferCurrency } from "@/features/developer/domain";

const dm = dashboardCopy.developer;

/** What an operator reads for each billing period. */
const PERIOD_LABEL: Record<BillingPeriod, string> = {
  [BillingPeriod.Once]: dm.periodOnce,
  [BillingPeriod.Daily]: dm.periodDaily,
  [BillingPeriod.Monthly]: dm.periodMonthly,
  [BillingPeriod.Quarterly]: dm.periodQuarterly,
  [BillingPeriod.HalfYearly]: dm.periodHalfYearly,
  [BillingPeriod.Yearly]: dm.periodYearly,
};

/**
 * One formatter per currency, built once.
 *
 * `toLocaleString` constructs a formatter on every call, and an offer list is
 * rendered on every keystroke in the page around it.
 */
const MONEY: Record<OfferCurrency, Intl.NumberFormat> = {
  [OfferCurrency.Eur]: new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" }),
  [OfferCurrency.Usd]: new Intl.NumberFormat("en-GB", { style: "currency", currency: "USD" }),
};

/**
 * The label an operator reads for a billing period.
 *
 * @param period - The period, in Creem's spelling.
 * @returns Its label.
 */
export function periodLabel(period: BillingPeriod): string {
  return PERIOD_LABEL[period];
}

/**
 * The amount of an offer, with its currency symbol.
 *
 * @param offer - The offer.
 * @returns The amount as a reader sees it.
 */
export function formatOfferPrice(offer: Pick<TierOffer, "priceCents" | "currency">): string {
  return MONEY[offer.currency].format(offer.priceCents / 100);
}

/**
 * Reads a euro or dollar amount typed into a field as whole cents.
 *
 * Creem refuses anything below one whole unit of the currency, so a value it
 * would reject comes back as `undefined` and the control that would send it
 * stays disabled.
 *
 * @param raw - What is in the field.
 * @returns The amount in cents, or `undefined` when it is not a usable price.
 */
export function priceCentsFromField(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  const amount = Number(trimmed);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  const cents = Math.round(amount * 100);
  return cents >= 100 ? cents : undefined;
}

/**
 * The amount of an offer as a field shows it, so an edit starts from what is
 * stored rather than from an empty box.
 *
 * @param priceCents - The amount in cents.
 * @returns The amount as a decimal string.
 */
export function priceFieldValue(priceCents: number): string {
  const amount = priceCents / 100;
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}
