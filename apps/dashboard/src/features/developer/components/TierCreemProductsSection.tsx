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
import type { CreemProductMapping, TierResponse } from "@/features/developer/api";
import { BillingInterval, CreemMode } from "@/features/developer/domain";
import {
  useArchiveCreemProduct,
  useCreateCreemProduct,
  useCreemProducts,
  useUpdateCreemProductPrice,
} from "@/features/developer/hooks/useDeveloperData";

const messages = dashboardCopy;
const dm = messages.developer;

const labelClass = "block text-xs font-medium text-[var(--ds-text-muted)] mb-1";

/** The environments in the order the switch offers them. */
const MODE_OPTIONS = [
  { value: CreemMode.Test, label: dm.creemEnvironmentTest },
  { value: CreemMode.Live, label: dm.creemEnvironmentLive },
] as const;

/** The intervals a plan is sold at, in the order the section lists them. */
const INTERVALS = [
  { value: BillingInterval.Month, label: dm.creemIntervalMonth },
  { value: BillingInterval.Year, label: dm.creemIntervalYear },
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

/** Whether the plan is sold at this interval at all, per its own price columns. */
function tierHasPriceFor(tier: TierResponse, interval: BillingInterval): boolean {
  const price = interval === BillingInterval.Month ? tier.price : tier.priceYearly;
  return price !== null && price.trim() !== "" && Number(price) > 0;
}

/** Props for {@link TierCreemProductRow}. */
interface TierCreemProductRowProps {
  tier: TierResponse;
  interval: (typeof INTERVALS)[number];
  mapping: CreemProductMapping | undefined;
  /** Whether this backend's key lets it write to the environment on show. */
  writable: boolean;
}

/**
 * One plan and interval in one environment: what it has at Creem, and what can
 * be done about it.
 *
 * The row states the product id rather than hiding it, because that id is what
 * an operator matches against the Creem dashboard when something disagrees.
 *
 * @param props - See {@link TierCreemProductRowProps}.
 * @returns The row.
 */
function TierCreemProductRow({ tier, interval, mapping, writable }: TierCreemProductRowProps) {
  const createProduct = useCreateCreemProduct();
  const repriceProduct = useUpdateCreemProductPrice();
  const archiveProduct = useArchiveCreemProduct();

  const [priceDraft, setPriceDraft] = useState("");
  const [attachDraft, setAttachDraft] = useState("");
  const [confirmingArchive, setConfirmingArchive] = useState(false);

  const sellable = tierHasPriceFor(tier, interval.value);
  const priceCents = priceCentsFrom(priceDraft);
  const busy = createProduct.isPending || repriceProduct.isPending || archiveProduct.isPending;

  function handleCreate() {
    createProduct.mutate({ tierId: tier.id, interval: interval.value });
  }

  function handleAttach() {
    createProduct.mutate({ tierId: tier.id, interval: interval.value, creemProductId: attachDraft.trim() });
  }

  function handleReprice() {
    if (priceCents === undefined) return;
    repriceProduct.mutate({ tierId: tier.id, interval: interval.value, priceCents });
  }

  function handleArchive() {
    archiveProduct.mutate({ tierId: tier.id, interval: interval.value });
    setConfirmingArchive(false);
  }

  return (
    <div className="border-t border-[var(--ds-border-subtle)] pt-3 first:border-t-0 first:pt-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{interval.label}</span>
        <span className="font-mono text-xs text-[var(--ds-text-muted)]">
          {mapping?.creemProductId ?? dm.creemNoProduct}
        </span>
      </div>

      {!sellable && <p className="mt-1 text-xs text-[var(--ds-text-muted)]">{dm.creemNoPrice}</p>}

      {sellable && !mapping && writable && (
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
            <label htmlFor={`creem-attach-${tier.id}-${interval.value}`} className={labelClass}>
              {dm.creemAttach}
            </label>
            <div className="flex items-center gap-2">
              <DashboardInput
                id={`creem-attach-${tier.id}-${interval.value}`}
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
          <label htmlFor={`creem-price-${tier.id}-${interval.value}`} className={labelClass}>
            {dm.creemReprice}
          </label>
          <div className="flex items-center gap-2">
            <DashboardInput
              id={`creem-price-${tier.id}-${interval.value}`}
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
}

/**
 * A plan's Creem products, one per billing interval, in whichever environment
 * the switch is showing.
 *
 * The switch changes what is displayed and never what the backend talks to.
 * One process holds one Creem API key and therefore reaches one account, so
 * the environment it is not in is shown read-only with the reason stated. That
 * is what makes the section usable during the move to live, when the sandbox
 * has to keep working whilst the live products are created.
 *
 * @param props - See {@link TierCreemProductsSectionProps}.
 * @returns The Creem products section.
 */
export function TierCreemProductsSection({ tier }: TierCreemProductsSectionProps) {
  const { data } = useCreemProducts();
  const [shownMode, setShownMode] = useState<CreemMode>(CreemMode.Test);

  const writableMode = data?.mode;
  const writable = writableMode === shownMode;
  // The notice names the environment this backend can write to, not the one on
  // show: what the reader needs is which key it is running with.
  const writableLabel = writableMode === CreemMode.Live ? dm.creemEnvironmentLive : dm.creemEnvironmentTest;

  function mappingFor(interval: BillingInterval): CreemProductMapping | undefined {
    return data?.products.find(
      (product) => product.tierId === tier.id && product.interval === interval && product.mode === shownMode,
    );
  }

  // The switch closes over the shown environment, so it is built once per
  // change rather than on every render of the section around it.
  const environmentSwitch = useMemo(
    () => <SegmentedControl value={shownMode} onChange={setShownMode} options={MODE_OPTIONS} />,
    [shownMode],
  );

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
          <p className="mb-3 text-xs text-amber-400">
            {dm.creemReadOnlyEnvironment.replaceAll("{mode}", writableLabel)}
          </p>
        )}

        <div className="space-y-3">
          {INTERVALS.map((interval) => (
            <TierCreemProductRow
              key={interval.value}
              tier={tier}
              interval={interval}
              mapping={mappingFor(interval.value)}
              writable={writable}
            />
          ))}
        </div>
      </DashboardSection.Body>
    </DashboardSection>
  );
}
