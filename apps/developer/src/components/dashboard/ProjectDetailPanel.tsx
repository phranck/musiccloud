import { type ChangeEvent, type SyntheticEvent, useCallback, useEffect, useReducer } from "react";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { TextField } from "@/components/auth/TextField";
import { ApiFailureNotice } from "@/components/dashboard/ApiFailureNotice";
import { RegistrationsPanel } from "@/components/dashboard/RegistrationsPanel";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import {
  DeveloperProjectStatus,
  type DeveloperProjectStatusValue,
  getDeveloperProject,
  MAX_APP_NAME_LENGTH,
  updateDeveloperProject,
} from "@/lib/apiAccessClient";
import { ButtonVariant } from "@/lib/buttonVariant";
import { FormPhase } from "@/lib/formPhase";
import { PROJECT_DETAIL_INITIAL_STATE, ProjectDetailActionType, projectDetailReducer } from "@/lib/projectDetailState";
import { toPanelFailure } from "@/lib/projectsPanelState";
import { perDayQuotaLabel, perMinuteQuotaLabel } from "@/lib/quotaLabel";
import { writeSelectedProjectId } from "@/lib/selectedProject";

/**
 * Props for {@link ProjectDetailPanel}.
 */
export interface ProjectDetailPanelProps {
  /** The project this screen is about, taken from the route. */
  projectId: string;
}

/**
 * One project's own screen: its name, its plan's limits, its lifecycle and the
 * registrations it holds.
 *
 * Deleting is a soft delete, which is why the copy says the project stops
 * working rather than that it disappears, and why a suspended project can come
 * back whilst a deleted one is stated as final in the interface even though
 * the row survives.
 *
 * Rendered with `client:load` from `dashboard/projects/[id].astro`.
 *
 * @param props - See {@link ProjectDetailPanelProps}.
 * @returns The project screen content.
 */
export function ProjectDetailPanel({ projectId }: ProjectDetailPanelProps) {
  const [state, dispatch] = useReducer(projectDetailReducer, PROJECT_DETAIL_INITIAL_STATE);
  const { project, loadFailure, name, phase, saveFailure } = state;

  useEffect(() => {
    // The screen is showing this project, so it is the one to remember.
    writeSelectedProjectId(projectId);
    const controller = new AbortController();
    getDeveloperProject(projectId, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (result.ok && result.data) {
        dispatch({
          type: ProjectDetailActionType.ProjectLoaded,
          project: result.data.project,
          registrations: result.data.registrations,
        });
        return;
      }
      dispatch({ type: ProjectDetailActionType.ProjectUnavailable, failure: toPanelFailure(result) });
    });
    return () => controller.abort();
  }, [projectId]);

  const onName = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      dispatch({ type: ProjectDetailActionType.NameEdited, value: event.target.value }),
    [],
  );

  const save = useCallback(
    async (body: { displayName?: string; status?: DeveloperProjectStatusValue }) => {
      dispatch({ type: ProjectDetailActionType.SaveStarted });
      const result = await updateDeveloperProject(projectId, body);
      if (result.ok && result.data) {
        dispatch({ type: ProjectDetailActionType.SaveSucceeded, project: result.data.project });
        return;
      }
      dispatch({ type: ProjectDetailActionType.SaveFailed, failure: toPanelFailure(result) });
    },
    [projectId],
  );

  const onRename = useCallback(
    async (event: SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault();
      const displayName = name.trim();
      if (!displayName || displayName.length > MAX_APP_NAME_LENGTH) {
        dispatch({
          type: ProjectDetailActionType.ValidationFailed,
          message: `A project name is required, and it may be at most ${MAX_APP_NAME_LENGTH} characters.`,
        });
        return;
      }
      await save({ displayName });
    },
    [name, save],
  );

  const onSuspend = useCallback(() => save({ status: DeveloperProjectStatus.Suspended }), [save]);
  const onReactivate = useCallback(() => save({ status: DeveloperProjectStatus.Active }), [save]);
  const onDelete = useCallback(() => save({ status: DeveloperProjectStatus.Deleted }), [save]);

  if (loadFailure) {
    return <ApiFailureNotice {...loadFailure} />;
  }

  if (!project) {
    return <p className="text-body text-fg-muted">Loading…</p>;
  }

  const isActive = project.status === DeveloperProjectStatus.Active;
  const isDeleted = project.status === DeveloperProjectStatus.Deleted;

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="card-content-inset text-card-title font-medium tracking-tight mb-3">Project</h2>
        <div className="surface-card px-6 py-5 flex flex-col gap-4">
          {project.subscription.tierId === null && (
            <p className="text-body text-fg-muted">
              This project has no plan yet, so any key under it is refused.{" "}
              <a href={`/dashboard/projects/${project.id}/plan`} className="content-link text-fg">
                Choose a plan
              </a>{" "}
              to make it work.
            </p>
          )}
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
            <div>
              <dt className="text-nav text-fg-subtle mb-0.5">State</dt>
              <dd className="text-body text-fg">
                <StatusBadge status={project.status} />
              </dd>
            </div>
            <div>
              <dt className="text-nav text-fg-subtle mb-0.5">Plan</dt>
              <dd className="text-body text-fg">
                {project.subscription.tierName ?? "No plan yet"}{" "}
                <a href={`/dashboard/projects/${project.id}/plan`} className="content-link text-nav text-fg-muted ml-1">
                  {project.subscription.tierId === null ? "choose one" : "change"}
                </a>
              </dd>
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

          <form onSubmit={onRename} className="flex flex-col gap-4" noValidate>
            <TextField name="displayName" label="Project name" value={name} onChange={onName} />
            {saveFailure && <ApiFailureNotice {...saveFailure} />}
            <div className="sm:max-w-xs">
              <SubmitButton loading={phase === FormPhase.Submitting}>
                {phase === FormPhase.Success ? "Saved" : "Save name"}
              </SubmitButton>
            </div>
          </form>
        </div>
      </section>

      <RegistrationsPanel projectId={projectId} />

      <section>
        <h2 className="card-content-inset text-card-title font-medium tracking-tight mb-3">Lifecycle</h2>
        <div className="surface-card px-6 py-5 flex flex-col gap-4">
          <p className="text-body text-fg-muted">
            Suspending a project stops every key under it from working and can be undone. Deleting it is how a project
            leaves this list; its registrations stop working with it.
          </p>
          {!isDeleted && (
            <div className="flex flex-wrap gap-3">
              <div className="sm:max-w-xs flex-1">
                <SubmitButton
                  variant={ButtonVariant.Secondary}
                  type="button"
                  onClick={isActive ? onSuspend : onReactivate}
                  loading={phase === FormPhase.Submitting}
                >
                  {isActive ? "Suspend project" : "Reactivate project"}
                </SubmitButton>
              </div>
              <div className="sm:max-w-xs flex-1">
                <SubmitButton variant={ButtonVariant.Danger} type="button" onClick={onDelete}>
                  Delete project
                </SubmitButton>
              </div>
            </div>
          )}
          {isDeleted && (
            <p className="text-body text-fg-muted">This project is deleted and no longer serves traffic.</p>
          )}
        </div>
      </section>
    </div>
  );
}
