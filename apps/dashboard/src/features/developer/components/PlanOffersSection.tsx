import {
  DashboardActionButton,
  DashboardActionId,
  DashboardButtonVariant,
  DashboardInput,
} from "@musiccloud/dashboard-ui";
import { Tag as TagIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { DashboardSection } from "@/components/ui/DashboardSection";
import { Dropdown, type DropdownOption } from "@/components/ui/Dropdown";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { dashboardCopy } from "@/copy/dashboard";
import type { TierOffer } from "@/features/developer/api";
import { BillingPeriod, OfferCurrency, TaxCategory, TaxMode } from "@/features/developer/domain";
import {
  useCreatePlanOffer,
  useDeletePlanOffer,
  useUpdatePlanOffer,
} from "@/features/developer/hooks/useDeveloperData";
import { periodLabel, priceCentsFromField, priceFieldValue } from "@/features/developer/offerFormat";

const messages = dashboardCopy;
const dm = messages.developer;

const labelClass = "block text-xs font-medium text-[var(--ds-text-muted)] mb-1";

/** Every billing period Creem sells over, as the dropdown offers them. */
const PERIOD_OPTIONS: DropdownOption[] = Object.values(BillingPeriod).map((period) => ({
  value: period,
  label: periodLabel(period),
}));

const CURRENCY_OPTIONS: DropdownOption[] = Object.values(OfferCurrency).map((currency) => ({
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
  takenPeriods: BillingPeriod[];
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
  const isOneOff = offer.billingPeriod === BillingPeriod.Once;

  const periodOptions = useMemo(
    () =>
      PERIOD_OPTIONS.filter(
        (option) => option.value === offer.billingPeriod || !takenPeriods.includes(option.value as BillingPeriod),
      ),
    [offer.billingPeriod, takenPeriods],
  );

  function change(body: Parameters<typeof updateOffer.mutate>[0]["body"]) {
    updateOffer.mutate({ id: offer.id, body });
  }

  return (
    <div className="border-t border-[var(--ds-border-subtle)] pt-4 first:border-t-0 first:pt-0">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <span className={labelClass}>{dm.offerPeriod}</span>
          <Dropdown
            value={offer.billingPeriod}
            onChange={(billingPeriod) => change({ billingPeriod: billingPeriod as BillingPeriod })}
            options={periodOptions}
            aria-label={dm.offerPeriod}
          />
        </div>
        <div>
          <label htmlFor={`offer-price-${offer.id}`} className={labelClass}>
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
              onChange={(currency) => change({ currency: currency as OfferCurrency })}
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
          <span className={labelClass}>{dm.offerTaxMode}</span>
          <Dropdown
            value={offer.taxMode ?? ""}
            onChange={(taxMode) => change({ taxMode: (taxMode || null) as TaxMode | null })}
            options={TAX_MODE_OPTIONS}
            aria-label={dm.offerTaxMode}
          />
        </div>
        <div>
          <span className={labelClass}>{dm.offerTaxCategory}</span>
          <Dropdown
            value={offer.taxCategory ?? ""}
            onChange={(taxCategory) => change({ taxCategory: (taxCategory || null) as TaxCategory | null })}
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
            <label htmlFor={`offer-image-${offer.id}`} className={labelClass}>
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
            <label htmlFor={`offer-success-${offer.id}`} className={labelClass}>
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
                disabled={!isOneOff}
                aria-label={dm.offerPayWhatYouWant}
              />
            </div>
            {!isOneOff && <p className="mt-1 text-xs text-[var(--ds-text-muted)]">{dm.offerPayWhatYouWantHint}</p>}
          </div>
        </div>
      )}

      {confirmingRemove ? (
        <div className="mt-3">
          <p className="text-xs text-[var(--ds-text-muted)]">{dm.offerRemoveConfirm}</p>
          <div className="mt-2 flex justify-end gap-2">
            <DashboardActionButton
              action={DashboardActionId.Cancel}
              icon={false}
              label={messages.common.cancel}
              onClick={() => setConfirmingRemove(false)}
              type="button"
              variant={DashboardButtonVariant.Neutral}
            />
            <DashboardActionButton
              action={DashboardActionId.Delete}
              label={dm.offerRemove}
              onClick={() => deleteOffer.mutate(offer.id)}
              disabled={deleteOffer.isPending}
              type="button"
              variant={DashboardButtonVariant.Danger}
            />
          </div>
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
  const free = Object.values(BillingPeriod).filter((period) => !taken.includes(period));

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
