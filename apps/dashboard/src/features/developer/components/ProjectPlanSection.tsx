import { DashboardActionButton, DashboardActionId, DashboardInput } from "@musiccloud/dashboard-ui";
import { Gauge as GaugeIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { DashboardSection } from "@/components/ui/DashboardSection";
import { Dropdown, type DropdownOption } from "@/components/ui/Dropdown";
import { dashboardCopy } from "@/copy/dashboard";
import type { DeveloperProjectResponse, DeveloperProjectSubscriptionResponse } from "@/features/developer/api";
import { TierDropdown } from "@/features/developer/components/TierDropdown";
import { ProjectSubscriptionStatus } from "@/features/developer/domain";
import { useSetProjectSubscription, useUpdateDeveloperProject } from "@/features/developer/hooks/useDeveloperData";

const messages = dashboardCopy;
const dm = messages.developer;

const labelClass = "block text-xs font-medium text-[var(--ds-text-muted)] mb-1";

/**
 * Label and explanation per subscription state.
 *
 * Each state is explained where it is chosen rather than shown as a bare
 * identifier, because "past_due" and "scheduled_cancel" do not say what they
 * mean for the project's quota to somebody picking one.
 */
const SUBSCRIPTION_STATES: { value: string; label: string; hint: string }[] = [
  { value: ProjectSubscriptionStatus.Active, label: dm.subscriptionStateActive, hint: dm.subscriptionStateActiveHint },
  {
    value: ProjectSubscriptionStatus.Trialing,
    label: dm.subscriptionStateTrialing,
    hint: dm.subscriptionStateTrialingHint,
  },
  { value: ProjectSubscriptionStatus.Paused, label: dm.subscriptionStatePaused, hint: dm.subscriptionStatePausedHint },
  {
    value: ProjectSubscriptionStatus.PastDue,
    label: dm.subscriptionStatePastDue,
    hint: dm.subscriptionStatePastDueHint,
  },
  {
    value: ProjectSubscriptionStatus.Expired,
    label: dm.subscriptionStateExpired,
    hint: dm.subscriptionStateExpiredHint,
  },
  {
    value: ProjectSubscriptionStatus.Canceled,
    label: dm.subscriptionStateCanceled,
    hint: dm.subscriptionStateCanceledHint,
  },
  {
    value: ProjectSubscriptionStatus.ScheduledCancel,
    label: dm.subscriptionStateScheduledCancel,
    hint: dm.subscriptionStateScheduledCancelHint,
  },
];

/**
 * Parses an override field into what the route accepts.
 *
 * An empty field means "take the plan's number", which the route expresses as
 * `null`. Anything that is not a positive whole number is rejected here rather
 * than sent, because the route refuses it anyway.
 *
 * @param raw - The field's current text.
 * @returns The value to send, or `undefined` when the text is not usable.
 */
function parseOverride(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * What the project's own field holds, as text, so an emptied field is
 * distinguishable from one that was never touched.
 */
function overrideText(value: number | null): string {
  return value === null ? "" : String(value);
}

/**
 * Props for {@link ProjectPlanSection}.
 */
export interface ProjectPlanSectionProps {
  /** The project being administered. */
  project: DeveloperProjectResponse;
  /** Its granting subscription, or `null` when it has no plan. */
  subscription: DeveloperProjectSubscriptionResponse | null;
}

/**
 * The plan a project runs on and the quota that follows from it.
 *
 * Two writes live here and they are separate on purpose: the plan and its
 * state go through the subscription route, whilst the administrative override
 * is a column on the project itself. Both write an audit event server-side.
 *
 * The enforced figure stands beside each override, because an override
 * adjusts a plan's number rather than standing in for one: a project with no
 * plan has no quota however large a number is typed here, and the section says
 * so rather than letting the field imply otherwise.
 *
 * @param props - See {@link ProjectPlanSectionProps}.
 * @returns The plan and quota section.
 */
export function ProjectPlanSection({ project, subscription }: ProjectPlanSectionProps) {
  const setSubscription = useSetProjectSubscription();
  const updateProject = useUpdateDeveloperProject();

  const [tierDraft, setTierDraft] = useState<string | null | undefined>(undefined);
  const [stateDraft, setStateDraft] = useState<string | undefined>(undefined);
  const [minuteDraft, setMinuteDraft] = useState<string | undefined>(undefined);
  const [dayDraft, setDayDraft] = useState<string | undefined>(undefined);

  const tierId = tierDraft === undefined ? project.tierId : tierDraft;
  const state = stateDraft ?? subscription?.status ?? ProjectSubscriptionStatus.Active;
  const minute = minuteDraft ?? overrideText(project.requestsPerMinute);
  const day = dayDraft ?? overrideText(project.requestsPerDay);

  const stateOptions = useMemo<DropdownOption[]>(
    () => SUBSCRIPTION_STATES.map((entry) => ({ value: entry.value, label: entry.label })),
    [],
  );
  const stateHint = SUBSCRIPTION_STATES.find((entry) => entry.value === state)?.hint ?? "";

  const parsedMinute = parseOverride(minute);
  const parsedDay = parseOverride(day);
  const overridesUsable = parsedMinute !== undefined && parsedDay !== undefined;

  function handleSavePlan() {
    setSubscription.mutate({ id: project.id, tierId, status: state });
  }

  function handleSaveQuota() {
    if (!overridesUsable) return;
    updateProject.mutate({ id: project.id, requestsPerMinute: parsedMinute, requestsPerDay: parsedDay });
  }

  function handleClearOverrides() {
    setMinuteDraft("");
    setDayDraft("");
    updateProject.mutate({ id: project.id, requestsPerMinute: null, requestsPerDay: null });
  }

  return (
    <DashboardSection className="overflow-hidden">
      <DashboardSection.Header icon={<GaugeIcon weight="duotone" className="size-4" />} title={dm.projectPlanTitle} />
      <DashboardSection.Body>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <span className={labelClass}>{dm.colTier}</span>
            <TierDropdown value={tierId} onChange={setTierDraft} aria-label={dm.colTier} />
          </div>
          <div>
            <span className={labelClass}>{dm.projectSubscriptionState}</span>
            <Dropdown
              value={state}
              onChange={setStateDraft}
              options={stateOptions}
              aria-label={dm.projectSubscriptionState}
            />
            <p className="mt-1 text-xs text-[var(--ds-text-muted)]">{stateHint}</p>
          </div>
        </div>
      </DashboardSection.Body>
      <DashboardSection.Footer>
        <DashboardActionButton
          action={DashboardActionId.Save}
          label={setSubscription.isSuccess ? dm.projectPlanSaved : messages.common.save}
          onClick={handleSavePlan}
          disabled={setSubscription.isPending}
          type="button"
        />
      </DashboardSection.Footer>

      <DashboardSection.Body>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="project-override-minute" className={labelClass}>
              {dm.projectOverrideMinute}
            </label>
            <DashboardInput
              id="project-override-minute"
              type="number"
              min={1}
              value={minute}
              placeholder={dm.projectOverridePlaceholder}
              onChange={(event) => setMinuteDraft(event.target.value)}
            />
            <p className="mt-1 text-xs text-[var(--ds-text-muted)]">
              {dm.projectEnforcedNow}: {project.effectiveRequestsPerMinute ?? dm.clientTrafficNoPlan}
            </p>
          </div>
          <div>
            <label htmlFor="project-override-day" className={labelClass}>
              {dm.projectOverrideDay}
            </label>
            <DashboardInput
              id="project-override-day"
              type="number"
              min={1}
              value={day}
              placeholder={dm.projectOverridePlaceholder}
              onChange={(event) => setDayDraft(event.target.value)}
            />
            <p className="mt-1 text-xs text-[var(--ds-text-muted)]">
              {dm.projectEnforcedNow}: {project.effectiveRequestsPerDay ?? dm.clientTrafficNoPlan}
            </p>
          </div>
        </div>
        {project.tierName === null && <p className="mt-3 text-xs text-amber-400">{dm.projectOverrideNeedsPlan}</p>}
      </DashboardSection.Body>
      <DashboardSection.Footer>
        <DashboardActionButton
          action={DashboardActionId.Cancel}
          label={dm.projectOverrideClear}
          onClick={handleClearOverrides}
          disabled={updateProject.isPending || (project.requestsPerMinute === null && project.requestsPerDay === null)}
          type="button"
        />
        <DashboardActionButton
          action={DashboardActionId.Save}
          label={updateProject.isSuccess ? dm.projectQuotaSaved : messages.common.save}
          onClick={handleSaveQuota}
          disabled={updateProject.isPending || !overridesUsable}
          type="button"
        />
      </DashboardSection.Footer>
    </DashboardSection>
  );
}
