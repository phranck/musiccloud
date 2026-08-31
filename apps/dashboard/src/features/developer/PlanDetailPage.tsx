import { DashboardActionButton, DashboardActionId, DashboardInput } from "@musiccloud/dashboard-ui";
import { Gauge as GaugeIcon, ListBullets as ListBulletsIcon, Stack as StackIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useParams } from "react-router";
import { ContentLoadingView } from "@/components/ui/ContentLoadingView";
import { ContentUnavailableView } from "@/components/ui/ContentUnavailableView";
import { DashboardSection } from "@/components/ui/DashboardSection";
import { LabeledSwitch } from "@/components/ui/LabeledSwitch";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLayout } from "@/components/ui/PageLayout";
import { dashboardCopy } from "@/copy/dashboard";
import type { TierResponse } from "@/features/developer/api";
import { PlanOffersSection } from "@/features/developer/components/PlanOffersSection";
import { TierCreemProductsSection } from "@/features/developer/components/TierCreemProductsSection";
import { TierFeatureBulletsEditor } from "@/features/developer/components/TierFeatureBulletsEditor";
import { TierIconPicker } from "@/features/developer/components/TierIconPicker";
import { type FormFeatureBullet, toFeatureLabels, toFormFeatures } from "@/features/developer/featureBullets";
import { usePlanOffers, useTiers, useUpdateTier } from "@/features/developer/hooks/useDeveloperData";
import { FormLabel, formInputClass, formTextareaClass } from "@/shared/ui/FormPrimitives";

const messages = dashboardCopy;
const dm = messages.developer;

/** Matches a 6-digit hex colour like `#RRGGBB`. */
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** What the plan cards edit, which is every column except the identifier. */
interface PlanForm {
  name: string;
  description: string;
  color: string;
  icon: string | null;
  buttonLabel: string;
  sortOrder: number;
  enabled: boolean;
  disableReason: string;
  recommended: boolean;
  requestsPerMinute: number;
  requestsPerDay: number;
  attributionRequired: boolean;
  features: FormFeatureBullet[];
}

/**
 * Reads a plan into the shape its cards edit.
 *
 * @param tier - The plan as the server holds it.
 * @returns The form values.
 */
function toForm(tier: TierResponse): PlanForm {
  return {
    name: tier.name,
    description: tier.description,
    color: tier.color,
    icon: tier.icon,
    buttonLabel: tier.buttonLabel ?? "",
    sortOrder: tier.sortOrder,
    enabled: tier.enabled,
    disableReason: tier.disableReason,
    recommended: tier.recommended,
    requestsPerMinute: tier.requestsPerMinute,
    requestsPerDay: tier.requestsPerDay,
    attributionRequired: tier.attributionRequired,
    features: toFormFeatures(tier.features ?? []),
  };
}

/**
 * Everything about one plan, on its own page.
 *
 * The page is a stack of cards, the way every other detail screen in this
 * dashboard is, and each card saves on its own. That is what lets the plan
 * carry an unbounded list of offers and every field Creem accepts without the
 * screen becoming a dialogue nobody can see the bottom of.
 *
 * The cards separate what the plan is from what it costs. Everything above the
 * offers describes what somebody gets; the offers and the Creem products
 * describe what they pay, and each row down there has its counterpart in the
 * offer above it.
 *
 * @returns The plan detail page.
 */
export function PlanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const tiersQuery = useTiers();
  const offersQuery = usePlanOffers(id);
  const updateTier = useUpdateTier();

  const tier = tiersQuery.data?.find((candidate) => candidate.id === id);
  const [draft, setDraft] = useState<PlanForm | null>(null);
  const [saved, setSaved] = useState(false);

  if (tiersQuery.isLoading) return <ContentLoadingView />;
  if (!tier) {
    return (
      <ContentUnavailableView
        icon={<StackIcon weight="duotone" className="size-8" />}
        title={dm.planNotFound}
        subtitle={dm.planNotFoundHint}
      />
    );
  }

  // Narrowed above, and repeated here so the callbacks below close over a
  // value TypeScript can see is present.
  const plan = tier;
  const form = draft ?? toForm(plan);
  const nameUsable = form.name.trim().length > 0;
  const colorUsable = HEX_COLOR_RE.test(form.color);
  const limitsUsable = form.requestsPerMinute >= 1 && form.requestsPerDay >= 1;
  const savable = nameUsable && colorUsable && limitsUsable && !updateTier.isPending;

  function change(patch: Partial<PlanForm>) {
    setDraft({ ...form, ...patch });
    setSaved(false);
  }

  function save() {
    if (!savable) return;
    updateTier.mutate(
      {
        id: plan.id,
        name: form.name.trim(),
        description: form.description,
        color: form.color,
        icon: form.icon,
        buttonLabel: form.buttonLabel.trim() || null,
        sortOrder: form.sortOrder,
        enabled: form.enabled,
        disableReason: form.disableReason,
        recommended: form.recommended,
        requestsPerMinute: form.requestsPerMinute,
        requestsPerDay: form.requestsPerDay,
        attributionRequired: form.attributionRequired,
        features: toFeatureLabels(form.features),
      },
      {
        onSuccess: () => {
          setDraft(null);
          setSaved(true);
        },
      },
    );
  }

  return (
    <PageLayout>
      <PageHeader title={plan.name} />

      <div className="grid w-full gap-[var(--ds-space-base)]">
        <DashboardSection className="overflow-hidden">
          <DashboardSection.Header icon={<StackIcon weight="duotone" className="size-4" />} title={dm.planCardTitle} />
          <DashboardSection.Body>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <FormLabel htmlFor="plan-name">{dm.colName}</FormLabel>
                <input
                  id="plan-name"
                  aria-label={dm.colName}
                  type="text"
                  className={formInputClass}
                  value={form.name}
                  onChange={(event) => change({ name: event.target.value })}
                  maxLength={60}
                />
              </div>
              <div className="flex items-end gap-3">
                <LabeledSwitch
                  id="plan-active"
                  label={dm.colActive}
                  checked={form.enabled}
                  onChange={(enabled) => change({ enabled })}
                />
                <LabeledSwitch
                  id="plan-recommended"
                  label={dm.colRecommended}
                  checked={form.recommended}
                  onChange={(recommended) => change({ recommended })}
                />
              </div>
              <div className="md:col-span-2">
                <FormLabel htmlFor="plan-description">{dm.colDescription}</FormLabel>
                <textarea
                  id="plan-description"
                  aria-label={dm.colDescription}
                  className={formTextareaClass}
                  value={form.description}
                  onChange={(event) => change({ description: event.target.value })}
                  maxLength={500}
                />
              </div>
              <TierIconPicker
                value={form.icon}
                onChange={(icon) => change({ icon })}
                label={dm.colIcon}
                searchPlaceholder={dm.iconPickerSearch}
                noneLabel={dm.iconNone}
              />
              <div>
                <FormLabel htmlFor="plan-color">{dm.colColor}</FormLabel>
                <input
                  id="plan-color"
                  aria-label={dm.colColor}
                  type="text"
                  className={formInputClass}
                  value={form.color}
                  onChange={(event) => change({ color: event.target.value })}
                />
                {!colorUsable && <p className="mt-1 text-xs text-amber-400">{dm.planColorInvalid}</p>}
              </div>
              <div>
                <FormLabel htmlFor="plan-button-label">{dm.colButtonLabel}</FormLabel>
                <input
                  id="plan-button-label"
                  aria-label={dm.colButtonLabel}
                  type="text"
                  className={formInputClass}
                  value={form.buttonLabel}
                  onChange={(event) => change({ buttonLabel: event.target.value })}
                  maxLength={40}
                  placeholder={dm.colButtonLabelPlaceholder}
                />
              </div>
              <div>
                <FormLabel htmlFor="plan-sort">{dm.colSortOrder}</FormLabel>
                <DashboardInput
                  id="plan-sort"
                  type="number"
                  value={String(form.sortOrder)}
                  onChange={(event) => change({ sortOrder: Number(event.target.value) })}
                />
              </div>
            </div>
          </DashboardSection.Body>
        </DashboardSection>

        <DashboardSection className="overflow-hidden">
          <DashboardSection.Header
            icon={<GaugeIcon weight="duotone" className="size-4" />}
            title={dm.planLimitsTitle}
          />
          <DashboardSection.Body>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <FormLabel htmlFor="plan-rpm">{dm.detailRateLimitMinute}</FormLabel>
                <DashboardInput
                  id="plan-rpm"
                  type="number"
                  min={1}
                  value={String(form.requestsPerMinute)}
                  onChange={(event) => change({ requestsPerMinute: Number(event.target.value) })}
                />
              </div>
              <div>
                <FormLabel htmlFor="plan-rpd">{dm.detailRateLimitDay}</FormLabel>
                <DashboardInput
                  id="plan-rpd"
                  type="number"
                  min={1}
                  value={String(form.requestsPerDay)}
                  onChange={(event) => change({ requestsPerDay: Number(event.target.value) })}
                />
              </div>
              <LabeledSwitch
                id="plan-attribution"
                label={dm.colAttribution}
                checked={form.attributionRequired}
                onChange={(attributionRequired) => change({ attributionRequired })}
              />
            </div>
            {!limitsUsable && <p className="mt-2 text-xs text-amber-400">{dm.planLimitsInvalid}</p>}
          </DashboardSection.Body>
        </DashboardSection>

        <DashboardSection className="overflow-hidden">
          <DashboardSection.Header
            icon={<ListBulletsIcon weight="duotone" className="size-4" />}
            title={dm.featuresLabel}
          />
          <DashboardSection.Body>
            <TierFeatureBulletsEditor features={form.features} onChange={(features) => change({ features })} dm={dm} />
          </DashboardSection.Body>
          <DashboardSection.Footer>
            <DashboardActionButton
              action={DashboardActionId.Save}
              label={saved ? messages.common.saved : messages.common.save}
              onClick={save}
              disabled={!savable}
              type="button"
            />
            {updateTier.isError && (
              <p role="alert" className="mr-auto text-sm text-[var(--ds-danger-text)]">
                {updateTier.error instanceof Error ? updateTier.error.message : messages.common.saveError}
              </p>
            )}
          </DashboardSection.Footer>
        </DashboardSection>

        <PlanOffersSection tierId={plan.id} offers={offersQuery.data ?? []} />

        <TierCreemProductsSection tier={plan} offers={offersQuery.data ?? []} />
      </div>
    </PageLayout>
  );
}
