import {
  DashboardActionButton,
  DashboardActionId,
  DashboardButtonVariant,
  DashboardInput,
} from "@musiccloud/dashboard-ui";
import type { TierOffer } from "@musiccloud/shared";
import {
  BILLING_PERIODS,
  type BillingPeriodValue,
  canPayWhatYouWant,
  OFFER_CURRENCIES,
  type OfferCurrencyValue,
  TaxCategory,
  type TaxCategoryValue,
  TaxMode,
  type TaxModeValue,
} from "@musiccloud/shared";
import { Tag as TagIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { DashboardSection } from "@/components/ui/DashboardSection";
import { Dropdown, type DropdownOption } from "@/components/ui/Dropdown";
import { FIELD_LABEL_CLASS } from "@/components/ui/fieldLabelClass";
import { InlineConfirm } from "@/components/ui/InlineConfirm";
import { SaveErrorMessage } from "@/components/ui/SaveErrorMessage";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { dashboardCopy } from "@/copy/dashboard";
import {
  useCreatePlanOffer,
  useDeletePlanOffer,
  useUpdatePlanOffer,
} from "@/features/developer/hooks/useDeveloperData";
import { periodLabel, priceCentsFromField, priceFieldValue } from "@/features/developer/offerFormat";

const messages = dashboardCopy;
const dm = messages.developer;

/** Every billing period Creem sells over, as the dropdown offers them. */
const PERIOD_OPTIONS: DropdownOption[] = BILLING_PERIODS.map((period) => ({
  value: period,
  label: periodLabel(period),
}));

const CURRENCY_OPTIONS: DropdownOption[] = OFFER_CURRENCIES.map((currency) => ({
  value: currency,
  label: currency,
}));

/** The tax mode, with the case for leaving it to Creem stated rather than blank. */
const TAX_MODE_OPTIONS: DropdownOption[] = [
  { value: "", label: dm.offerTaxModeUnset },
  { value: TaxMode.Inclusive, label: dm.offerTaxModeInclusive },
  { value: TaxMode.Exclusive, label: dm.offerTaxModeExclusive },
];

const TAX_CATEGORY_OPTIONS: DropdownOption[] = [
  { value: "", label: dm.offerTaxCategoryUnset },
  { value: TaxCategory.Saas, label: dm.offerTaxCategorySaas },
  { value: TaxCategory.DigitalGoodsService, label: dm.offerTaxCategoryDigital },
  { value: TaxCategory.Ebooks, label: dm.offerTaxCategoryEbooks },
];

/** Props for {@link PlanOfferRow}. */
interface PlanOfferRowProps {
  offer: TierOffer;
  /** Which periods the plan already sells over, so a duplicate cannot be chosen. */
  takenPeriods: BillingPeriodValue[];
}

/**
 * One offer, with every field Creem accepts.
 *
 * The fields split by how often anybody touches them. The period, the amount
 * and the two tax fields stand open, because the last two decide who bears the
 * tax and that is not a detail. Everything else sits behind a disclosure.
 *
 * @param props - See {@link PlanOfferRowProps}.
 * @returns The offer row.
 */
function PlanOfferRow({ offer, takenPeriods }: PlanOfferRowProps) {
  const updateOffer = useUpdatePlanOffer();
  const deleteOffer = useDeletePlanOffer();

  const [priceDraft, setPriceDraft] = useState<string | undefined>(undefined);
  const [showMore, setShowMore] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const price = priceDraft ?? priceFieldValue(offer.priceCents);
  const priceCents = priceCentsFromField(price);
  const priceChanged = priceCents !== undefined && priceCents !== offer.priceCents;
  const customerNamesAmount = canPayWhatYouWant(offer.billingPeriod);

  const periodOptions = useMemo(
    () =>
      PERIOD_OPTIONS.filter(
        (option) => option.value === offer.billingPeriod || !takenPeriods.includes(option.value as BillingPeriodValue),
      ),
    [offer.billingPeriod, takenPeriods],
  );

  function change(body: Parameters<typeof updateOffer.mutate>[0]["body"]) {
    updateOffer.mutate({ id: offer.id, body });
  }

  // A period that cannot carry the customer's own amount takes the flag off in
  // the same request, because the server judges the offer as it would stand.
  function changePeriod(billingPeriod: BillingPeriodValue) {
    change(
      offer.payWhatYouWant && !canPayWhatYouWant(billingPeriod)
        ? { billingPeriod, payWhatYouWant: false }
        : { billingPeriod },
    );
  }

  return (
    <div className="border-t border-[var(--ds-border-subtle)] pt-4 first:border-t-0 first:pt-0">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <span className={FIELD_LABEL_CLASS}>{dm.offerPeriod}</span>
          <Dropdown
            value={offer.billingPeriod}
            onChange={(billingPeriod) => changePeriod(billingPeriod as BillingPeriodValue)}
            options={periodOptions}
            aria-label={dm.offerPeriod}
          />
        </div>
        <div>
          <label htmlFor={`offer-price-${offer.id}`} className={FIELD_LABEL_CLASS}>
            {dm.offerPrice}
          </label>
          <div className="flex items-center gap-2">
            <DashboardInput
              id={`offer-price-${offer.id}`}
              type="text"
              inputMode="decimal"
              value={price}
              onChange={(event) => setPriceDraft(event.target.value)}
            />
            <Dropdown
              value={offer.currency}
              onChange={(currency) => change({ currency: currency as OfferCurrencyValue })}
              options={CURRENCY_OPTIONS}
              aria-label={dm.offerCurrency}
            />
            <DashboardActionButton
              action={DashboardActionId.Save}
              icon={false}
              label={messages.common.save}
              onClick={() => {
                if (priceCents === undefined) return;
                change({ priceCents });
                setPriceDraft(undefined);
              }}
              disabled={!priceChanged || updateOffer.isPending}
              type="button"
            />
          </div>
          {price.trim() !== "" && priceCents === undefined && (
            <p className="mt-1 text-xs text-amber-400">{dm.offerPriceInvalid}</p>
          )}
        </div>
        <div>
          <span className={FIELD_LABEL_CLASS}>{dm.offerTaxMode}</span>
          <Dropdown
            value={offer.taxMode ?? ""}
            onChange={(taxMode) => change({ taxMode: (taxMode || null) as TaxModeValue | null })}
            options={TAX_MODE_OPTIONS}
            aria-label={dm.offerTaxMode}
          />
        </div>
        <div>
          <span className={FIELD_LABEL_CLASS}>{dm.offerTaxCategory}</span>
          <Dropdown
            value={offer.taxCategory ?? ""}
            onChange={(taxCategory) => change({ taxCategory: (taxCategory || null) as TaxCategoryValue | null })}
            options={TAX_CATEGORY_OPTIONS}
            aria-label={dm.offerTaxCategory}
          />
        </div>
      </div>

      <button
        type="button"
        className="mt-3 text-xs text-[var(--ds-text-muted)] underline"
        onClick={() => setShowMore((open) => !open)}
      >
        {dm.offerMore}
      </button>

      {showMore && (
        <div className="mt-2 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label htmlFor={`offer-image-${offer.id}`} className={FIELD_LABEL_CLASS}>
              {dm.offerImageUrl}
            </label>
            <DashboardInput
              id={`offer-image-${offer.id}`}
              type="url"
              defaultValue={offer.imageUrl ?? ""}
              onBlur={(event) => change({ imageUrl: event.target.value.trim() || null })}
            />
            <p className="mt-1 text-xs text-[var(--ds-text-muted)]">{dm.offerUrlHint}</p>
          </div>
          <div>
            <label htmlFor={`offer-success-${offer.id}`} className={FIELD_LABEL_CLASS}>
              {dm.offerSuccessUrl}
            </label>
            <DashboardInput
              id={`offer-success-${offer.id}`}
              type="url"
              defaultValue={offer.successUrl ?? ""}
              onBlur={(event) => change({ successUrl: event.target.value.trim() || null })}
            />
            <p className="mt-1 text-xs text-[var(--ds-text-muted)]">{dm.offerUrlHint}</p>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm">{dm.offerAbandonedCart}</span>
            <ToggleSwitch
              checked={offer.abandonedCartRecovery}
              onChange={(abandonedCartRecovery) => change({ abandonedCartRecovery })}
              aria-label={dm.offerAbandonedCart}
            />
          </div>
          <div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm">{dm.offerPayWhatYouWant}</span>
              <ToggleSwitch
                checked={offer.payWhatYouWant}
                onChange={(payWhatYouWant) => change({ payWhatYouWant })}
                disabled={!customerNamesAmount}
                aria-label={dm.offerPayWhatYouWant}
              />
            </div>
            {!customerNamesAmount && (
              <p className="mt-1 text-xs text-[var(--ds-text-muted)]">{dm.offerPayWhatYouWantHint}</p>
            )}
          </div>
        </div>
      )}

      {updateOffer.isError && <SaveErrorMessage error={updateOffer.error} className="mt-3" />}

      {confirmingRemove ? (
        <div className="mt-3">
          <InlineConfirm
            message={dm.offerRemoveConfirm}
            confirmAction={DashboardActionId.Delete}
            confirmLabel={dm.offerRemove}
            onConfirm={() => deleteOffer.mutate(offer.id)}
            onCancel={() => setConfirmingRemove(false)}
            disabled={deleteOffer.isPending}
          />
        </div>
      ) : (
        <div className="mt-3 flex justify-end">
          <DashboardActionButton
            action={DashboardActionId.Delete}
            label={dm.offerRemove}
            onClick={() => setConfirmingRemove(true)}
            type="button"
            variant={DashboardButtonVariant.Neutral}
          />
        </div>
      )}
    </div>
  );
}

/** Props for {@link PlanOffersSection}. */
export interface PlanOffersSectionProps {
  tierId: string;
  offers: TierOffer[];
}

/**
 * What a plan costs, as a list of offers.
 *
 * A new offer takes the first period the plan does not already sell over and a
 * placeholder amount, because a row that exists can be edited in place whilst
 * a dialogue asking for four values before showing anything cannot.
 *
 * @param props - See {@link PlanOffersSectionProps}.
 * @returns The offers card.
 */
export function PlanOffersSection({ tierId, offers }: PlanOffersSectionProps) {
  const createOffer = useCreatePlanOffer();

  const taken = offers.map((offer) => offer.billingPeriod);
  const free = BILLING_PERIODS.filter((period) => !taken.includes(period));

  return (
    <DashboardSection className="overflow-hidden">
      <DashboardSection.Header icon={<TagIcon weight="duotone" className="size-4" />} title={dm.offersTitle} />
      <DashboardSection.Body>
        <p className="mb-3 text-sm text-[var(--ds-text-muted)]">{dm.offersDescription}</p>

        {offers.length === 0 ? (
          <p className="text-sm text-[var(--ds-text-muted)]">{dm.offersNone}</p>
        ) : (
          <div className="space-y-4">
            {offers.map((offer) => (
              <PlanOfferRow key={offer.id} offer={offer} takenPeriods={taken} />
            ))}
          </div>
        )}
      </DashboardSection.Body>
      <DashboardSection.Footer>
        <DashboardActionButton
          action={DashboardActionId.Create}
          label={dm.offersAdd}
          onClick={() => {
            const period = free[0];
            if (!period) return;
            createOffer.mutate({ tierId, body: { billingPeriod: period, priceCents: 100 } });
          }}
          disabled={free.length === 0 || createOffer.isPending}
          type="button"
        />
      </DashboardSection.Footer>
    </DashboardSection>
  );
}
