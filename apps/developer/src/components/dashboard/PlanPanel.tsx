import { useCallback, useEffect, useState } from "react";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ApiFailureNotice } from "@/components/dashboard/ApiFailureNotice";
import { type DeveloperProjectDto, getDeveloperProject, setDeveloperProjectPlan } from "@/lib/apiAccessClient";
import { FormPhase, type FormPhaseValue } from "@/lib/formPhase";
import { type PanelFailure, toPanelFailure } from "@/lib/projectsPanelState";
import { perDayQuotaLabel, perMinuteQuotaLabel } from "@/lib/quotaLabel";

/**
 * A plan as this screen needs to describe it: what it is called, what it
 * grants, and whether a developer may choose it right now.
 */
export interface PlanOption {
  id: string;
  name: string;
  requestsPerMinute: number;
  requestsPerDay: number;
  /** Whether a developer may put a project on it without anybody else being involved. */
  assignable: boolean;
  /** Why it cannot be chosen, when it cannot. Shown as written. */
  unavailableReason: string;
}

/**
 * Props for {@link PlanPanel}.
 */
export interface PlanPanelProps {
  /** The project whose plan this is. */
  projectId: string;
  /** The catalogue, resolved on the server so the browser never asks for it. */
  plans: readonly PlanOption[];
}

/**
 * The plan step: which plan a project is on, what that grants, and the choice.
 *
 * With one assignable plan the choice is shown as the plan for this project
 * rather than as a list of one pretending to be a decision. Plans that exist
 * but cannot be chosen are visible with the reason, because a developer who
 * saw them on the pricing page should not have to wonder where they went.
 *
 * @param props - See {@link PlanPanelProps}.
 * @returns The plan screen content.
 */
export function PlanPanel({ projectId, plans }: PlanPanelProps) {
  const [project, setProject] = useState<DeveloperProjectDto | null>(null);
  const [loadFailure, setLoadFailure] = useState<PanelFailure | null>(null);
  const [saveFailure, setSaveFailure] = useState<PanelFailure | null>(null);
  const [phase, setPhase] = useState<FormPhaseValue>(FormPhase.Idle);

  useEffect(() => {
    const controller = new AbortController();
    getDeveloperProject(projectId, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (result.ok && result.data) {
        setProject(result.data.project);
        return;
      }
      setLoadFailure(toPanelFailure(result));
    });
    return () => controller.abort();
  }, [projectId]);

  const onChoose = useCallback(
    async (tierId: string) => {
      setPhase(FormPhase.Submitting);
      setSaveFailure(null);
      const result = await setDeveloperProjectPlan(projectId, tierId);
      if (result.ok && result.data) {
        setProject(result.data.project);
        setPhase(FormPhase.Success);
        return;
      }
      setPhase(FormPhase.Error);
      setSaveFailure(toPanelFailure(result));
    },
    [projectId],
  );

  if (loadFailure) return <ApiFailureNotice {...loadFailure} />;
  if (!project) return <p className="text-body text-fg-muted">Loading…</p>;

  const currentTierId = project.subscription.tierId;
  const assignable = plans.filter((plan) => plan.assignable);
  const unavailable = plans.filter((plan) => !plan.assignable);

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="card-content-inset text-card-title font-medium tracking-tight mb-3">This project's plan</h2>
        <div className="surface-card px-6 py-5 flex flex-col gap-4">
          {currentTierId === null ? (
            <p className="text-body text-fg-muted">
              This project has no plan yet, so its keys are refused. A plan is what says how much the project may do;
              choose one below and it starts working.
            </p>
          ) : (
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-4">
              <div>
                <dt className="text-nav text-fg-subtle mb-0.5">Plan</dt>
                <dd className="text-body text-fg">{project.subscription.tierName ?? currentTierId}</dd>
              </div>
              <div>
                <dt className="text-nav text-fg-subtle mb-0.5">Rate limit</dt>
                <dd className="text-body text-fg">{perMinuteQuotaLabel(project.quota.requestsPerMinute)}</dd>
              </div>
              <div>
                <dt className="text-nav text-fg-subtle mb-0.5">Daily quota</dt>
                <dd className="text-body text-fg">{perDayQuotaLabel(project.quota.requestsPerDay)}</dd>
              </div>
            </dl>
          )}
          {saveFailure && <ApiFailureNotice {...saveFailure} />}
        </div>
      </section>

      <section>
        <h2 className="card-content-inset text-card-title font-medium tracking-tight mb-3">
          {assignable.length === 1 ? "The plan available to you" : "Choose a plan"}
        </h2>
        <div className="surface-card px-6 py-5 flex flex-col gap-5">
          {assignable.length === 0 && (
            <p className="text-body text-fg-muted">No plan can be chosen at the moment. Please get in touch.</p>
          )}
          {assignable.map((plan) => (
            <div key={plan.id} className="flex flex-col gap-2">
              <p className="text-body font-medium text-fg">{plan.name}</p>
              <p className="text-nav text-fg-subtle">
                {perMinuteQuotaLabel(plan.requestsPerMinute)} · {perDayQuotaLabel(plan.requestsPerDay)}
              </p>
              <div className="sm:max-w-xs">
                {plan.id === currentTierId ? (
                  <p className="text-body text-accent">This project is on this plan.</p>
                ) : (
                  <SubmitButton
                    type="button"
                    loading={phase === FormPhase.Submitting}
                    onClick={() => onChoose(plan.id)}
                  >
                    {currentTierId === null ? `Put this project on ${plan.name}` : `Move to ${plan.name}`}
                  </SubmitButton>
                )}
              </div>
            </div>
          ))}

          {unavailable.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-border pt-4">
              {unavailable.map((plan) => (
                <p key={plan.id} className="text-nav text-fg-subtle">
                  <span className="text-fg">{plan.name}</span> · {plan.unavailableReason}
                </p>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
