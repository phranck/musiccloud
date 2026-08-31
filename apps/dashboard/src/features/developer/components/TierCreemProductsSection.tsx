import {
  DashboardActionButton,
  DashboardActionId,
  DashboardButtonVariant,
  DashboardInput,
} from "@musiccloud/dashboard-ui";
import { CurrencyEur as CurrencyEurIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { DashboardSection } from "@/components/ui/DashboardSection";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { dashboardCopy } from "@/copy/dashboard";
import type { CreemProductMapping, TierOffer, TierResponse } from "@/features/developer/api";
import { CreemMode } from "@/features/developer/domain";
import {
  useArchiveCreemProduct,
  useCreateCreemProduct,
  useCreemProducts,
  useUpdateCreemProductPrice,
} from "@/features/developer/hooks/useDeveloperData";
import { formatOfferPrice, periodLabel } from "@/features/developer/offerFormat";

const messages = dashboardCopy;
const dm = messages.developer;

const labelClass = "block text-xs font-medium text-[var(--ds-text-muted)] mb-1";

/** The environments in the order the switch offers them. */
const MODE_OPTIONS = [
  { value: CreemMode.Test, label: dm.creemEnvironmentTest },
  { value: CreemMode.Live, label: dm.creemEnvironmentLive },
] as const;

/**
 * Reads a euro amount typed into a price field as whole cents.
 *
 * Creem refuses anything below one whole unit of the currency, so a value it
 * would reject comes back as `undefined` and the button stays disabled rather
 * than the operator finding out from a failed request.
 *
 * @param raw - What is in the field.
 * @returns The amount in cents, or `undefined` when it is not a usable price.
 */
function priceCentsFrom(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  const euros = Number(trimmed);
  if (!Number.isFinite(euros) || euros <= 0) return undefined;
  const cents = Math.round(euros * 100);
  return cents >= 100 ? cents : undefined;
}

/** Props for {@link TierCreemProductRow}. */
interface TierCreemProductRowProps {
  tier: TierResponse;
  /** The offer this row is about. Every row corresponds to one. */
  offer: TierOffer;
  /** The environment on show, which every action here acts in. */
  mode: CreemMode;
  mapping: CreemProductMapping | undefined;
  /** Whether this deployment holds a key for that environment. */
  writable: boolean;
}

/**
 * One offer in one environment: what it has at Creem, and what can be done
 * about it.
 *
 * The row states the product id rather than hiding it, because that id is what
 * an operator matches against the Creem dashboard when something disagrees.
 *
 * @param props - See {@link TierCreemProductRowProps}.
 * @returns The row.
 */
function TierCreemProductRow({ tier, offer, mode, mapping, writable }: TierCreemProductRowProps) {
  const createProduct = useCreateCreemProduct();
  const repriceProduct = useUpdateCreemProductPrice();
  const archiveProduct = useArchiveCreemProduct();

  const [priceDraft, setPriceDraft] = useState("");
  const [attachDraft, setAttachDraft] = useState("");
  const [confirmingArchive, setConfirmingArchive] = useState(false);

  const priceCents = priceCentsFrom(priceDraft);
  const busy = createProduct.isPending || repriceProduct.isPending || archiveProduct.isPending;
  const fieldId = `${tier.id}-${offer.billingPeriod}`;

  function handleCreate() {
    createProduct.mutate({ tierId: tier.id, billingPeriod: offer.billingPeriod, mode });
  }

  function handleAttach() {
    createProduct.mutate({
      tierId: tier.id,
      billingPeriod: offer.billingPeriod,
      mode,
      creemProductId: attachDraft.trim(),
    });
  }

  function handleReprice() {
    if (priceCents === undefined) return;
    repriceProduct.mutate({ tierId: tier.id, billingPeriod: offer.billingPeriod, mode, priceCents });
  }

  function handleArchive() {
    archiveProduct.mutate({ tierId: tier.id, billingPeriod: offer.billingPeriod, mode });
    setConfirmingArchive(false);
  }

  return (
    <div className="border-t border-[var(--ds-border-subtle)] pt-3 first:border-t-0 first:pt-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{periodLabel(offer.billingPeriod)}</span>
        <span className="text-sm text-[var(--ds-text-muted)]">{formatOfferPrice(offer)}</span>
      </div>
      <div className="mt-0.5 text-right">
        <span className="font-mono text-xs text-[var(--ds-text-muted)]">
          {mapping?.creemProductId ?? dm.creemNoProduct}
        </span>
      </div>

      {!mapping && writable && (
        <div className="mt-2 space-y-2">
          <div className="flex justify-end">
            <DashboardActionButton
              action={DashboardActionId.Save}
              label={dm.creemCreate}
              onClick={handleCreate}
              disabled={busy}
              type="button"
            />
          </div>
          <div>
            <label htmlFor={`creem-attach-${fieldId}`} className={labelClass}>
              {dm.creemAttach}
            </label>
            <div className="flex items-center gap-2">
              <DashboardInput
                id={`creem-attach-${fieldId}`}
                type="text"
                value={attachDraft}
                placeholder={dm.creemAttachPlaceholder}
                onChange={(event) => setAttachDraft(event.target.value)}
              />
              <DashboardActionButton
                action={DashboardActionId.Save}
                icon={false}
                label={messages.common.save}
                onClick={handleAttach}
                disabled={busy || attachDraft.trim() === ""}
                type="button"
                variant={DashboardButtonVariant.Neutral}
              />
            </div>
            <p className="mt-1 text-xs text-[var(--ds-text-muted)]">{dm.creemAttachHint}</p>
          </div>
        </div>
      )}

      {mapping && writable && (
        <div className="mt-2">
          <label htmlFor={`creem-price-${fieldId}`} className={labelClass}>
            {dm.creemReprice}
          </label>
          <div className="flex items-center gap-2">
            <DashboardInput
              id={`creem-price-${fieldId}`}
              type="text"
              inputMode="decimal"
              value={priceDraft}
              placeholder="e.g. 9.90"
              onChange={(event) => setPriceDraft(event.target.value)}
            />
            <DashboardActionButton
              action={DashboardActionId.Save}
              icon={false}
              label={messages.common.save}
              onClick={handleReprice}
              disabled={busy || priceCents === undefined}
              type="button"
            />
          </div>

          {confirmingArchive ? (
            <div className="mt-3">
              <p className="text-xs text-[var(--ds-text-muted)]">{dm.creemArchiveConfirmBody}</p>
              <div className="mt-2 flex justify-end gap-2">
                <DashboardActionButton
                  action={DashboardActionId.Cancel}
                  icon={false}
                  label={messages.common.cancel}
                  onClick={() => setConfirmingArchive(false)}
                  type="button"
                  variant={DashboardButtonVariant.Neutral}
                />
                <DashboardActionButton
                  action={DashboardActionId.Delete}
                  label={dm.creemArchive}
                  onClick={handleArchive}
                  disabled={busy}
                  type="button"
                  variant={DashboardButtonVariant.Danger}
                />
              </div>
            </div>
          ) : (
            <div className="mt-2 flex justify-end">
              <DashboardActionButton
                action={DashboardActionId.Delete}
                label={dm.creemArchive}
                onClick={() => setConfirmingArchive(true)}
                disabled={busy}
                type="button"
                variant={DashboardButtonVariant.Neutral}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Props for {@link TierCreemProductsSection}. */
export interface TierCreemProductsSectionProps {
  /** The plan whose products are shown. */
  tier: TierResponse;
  /** Its offers. Every row of this section corresponds to one of them. */
  offers: TierOffer[];
}

/**
 * A plan's Creem products, one row per offer, in whichever environment the
 * switch is showing.
 *
 * Every row here has its counterpart above, because a product exists for an
 * offer and for nothing else. A plan that sells nothing shows nothing, which
 * is the honest answer rather than two invented periods.
 *
 * The switch says which environment is being maintained, not which one
 * customers buy from. That second question is the selling switch in the
 * developer settings, and keeping the two apart is what lets an operator build
 * the live products whilst the shop still sells from the sandbox.
 *
 * @param props - See {@link TierCreemProductsSectionProps}.
 * @returns The Creem products section.
 */
export function TierCreemProductsSection({ tier, offers }: TierCreemProductsSectionProps) {
  const { data } = useCreemProducts();
  const [shownMode, setShownMode] = useState<CreemMode>(CreemMode.Test);

  // An environment with no configured key cannot be acted on at all. The rows
  // still show what is in it, because knowing that nothing is set up there yet
  // is the point of looking.
  const writable = data?.writableModes.includes(shownMode) ?? false;
  const shownLabel = shownMode === CreemMode.Live ? dm.creemEnvironmentLive : dm.creemEnvironmentTest;

  const environmentSwitch = useMemo(
    () => <SegmentedControl value={shownMode} onChange={setShownMode} options={MODE_OPTIONS} />,
    [shownMode],
  );

  function mappingFor(offer: TierOffer): CreemProductMapping | undefined {
    return data?.products.find(
      (product) =>
        product.tierId === tier.id && product.billingPeriod === offer.billingPeriod && product.mode === shownMode,
    );
  }

  return (
    <DashboardSection className="overflow-hidden">
      <DashboardSection.Header
        icon={<CurrencyEurIcon weight="duotone" className="size-4" />}
        title={dm.creemTitle}
        addOn={environmentSwitch}
      />
      <DashboardSection.Body>
        <p className="mb-3 text-xs text-[var(--ds-text-muted)]">{dm.creemIntro}</p>

        {!writable && (
          <p className="mb-3 text-xs text-amber-400">{dm.creemNoKeyForEnvironment.replaceAll("{mode}", shownLabel)}</p>
        )}

        {offers.length === 0 ? (
          <p className="text-xs text-[var(--ds-text-muted)]">{dm.creemNoOffers}</p>
        ) : (
          <div className="space-y-3">
            {offers.map((offer) => (
              <TierCreemProductRow
                key={offer.id}
                tier={tier}
                offer={offer}
                mode={shownMode}
                mapping={mappingFor(offer)}
                writable={writable}
              />
            ))}
          </div>
        )}
      </DashboardSection.Body>
    </DashboardSection>
  );
}
