import { useCallback, useEffect, useState } from "react";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ApiFailureNotice } from "@/components/dashboard/ApiFailureNotice";
import { ContentCard } from "@/components/docs/ContentCard";
import { ContentPanel } from "@/components/docs/ContentPanel";
import { type DeveloperProjectDto, getDeveloperProject, setDeveloperProjectPlan } from "@/lib/apiAccessClient";
import { FormPhase, type FormPhaseValue } from "@/lib/formPhase";
import { CoinIcon, ForbiddenIcon } from "@/lib/icons";
import { type PanelFailure, toPanelFailure } from "@/lib/projectsPanelState";
import { perDayQuotaLabel, perMinuteQuotaLabel, quotaSummaryLabel } from "@/lib/quotaLabel";

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
  if (!project) return <p className="card-content-inset text-body text-fg-muted">Loading…</p>;

  const currentTierId = project.subscription.tierId;
  const assignable = plans.filter((plan) => plan.assignable);
  const unavailable = plans.filter((plan) => !plan.assignable);

  return (
    <div className="flex flex-col gap-6">
      <ContentCard>
        <ContentCard.Header>
          <ContentCard.Header.Icon>
            <CoinIcon aria-hidden="true" />
          </ContentCard.Header.Icon>
          <ContentCard.Header.Title>This project's plan</ContentCard.Header.Title>
        </ContentCard.Header>
        <ContentCard.Body>
          <ContentCard.Body.Copy>
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
          </ContentCard.Body.Copy>
        </ContentCard.Body>
      </ContentCard>

      <ContentCard>
        <ContentCard.Header>
          <ContentCard.Header.Icon>
            <CoinIcon aria-hidden="true" />
          </ContentCard.Header.Icon>
          <ContentCard.Header.Title>
            {assignable.length === 1 ? "The plan available to you" : "Choose a plan"}
          </ContentCard.Header.Title>
        </ContentCard.Header>
        <ContentCard.Body>
          {assignable.length === 0 ? (
            <ContentCard.Body.Copy>
              <p className="text-body text-fg-muted">No plan can be chosen at the moment. Please get in touch.</p>
            </ContentCard.Body.Copy>
          ) : (
            <ContentCard.Body.Stack>
              {assignable.map((plan) => (
                <ContentPanel key={plan.id} className="content-panel--inset">
                  <ContentPanel.Header>
                    <ContentPanel.Header.Title className="truncate">{plan.name}</ContentPanel.Header.Title>
                    {plan.id === currentTierId && (
                      <ContentPanel.Meta>
                        <span className="status-pill status-pill--success">On this plan</span>
                      </ContentPanel.Meta>
                    )}
                  </ContentPanel.Header>
                  <ContentPanel.Content>
                    <p className="text-body text-fg">
                      {quotaSummaryLabel(plan.requestsPerMinute, plan.requestsPerDay)}
                    </p>
                  </ContentPanel.Content>
                  {plan.id !== currentTierId && (
                    <ContentPanel.Footer>
                      <SubmitButton
                        type="button"
                        loading={phase === FormPhase.Submitting}
                        onClick={() => onChoose(plan.id)}
                      >
                        {currentTierId === null ? `Put this project on ${plan.name}` : `Move to ${plan.name}`}
                      </SubmitButton>
                    </ContentPanel.Footer>
                  )}
                </ContentPanel>
              ))}
            </ContentCard.Body.Stack>
          )}
        </ContentCard.Body>
      </ContentCard>

      {unavailable.length > 0 && (
        <ContentCard>
          <ContentCard.Header>
            <ContentCard.Header.Icon>
              <ForbiddenIcon aria-hidden="true" />
            </ContentCard.Header.Icon>
            <ContentCard.Header.Title>Not available to you</ContentCard.Header.Title>
          </ContentCard.Header>
          <ContentCard.Body>
            <ContentCard.Body.Copy>
              {unavailable.map((plan) => (
                <p key={plan.id} className="text-body text-fg-subtle">
                  <span className="text-fg">{plan.name}</span> · {plan.unavailableReason}
                </p>
              ))}
            </ContentCard.Body.Copy>
          </ContentCard.Body>
        </ContentCard>
      )}
    </div>
  );
}
