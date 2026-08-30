import { type ChangeEvent, type SyntheticEvent, useCallback, useEffect, useReducer } from "react";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { TextField } from "@/components/auth/TextField";
import { ApiFailureNotice } from "@/components/dashboard/ApiFailureNotice";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import {
  createDeveloperProject,
  listApiClients,
  listDeveloperProjects,
  MAX_APP_NAME_LENGTH,
} from "@/lib/apiAccessClient";
import { ButtonVariant } from "@/lib/buttonVariant";
import { formatDate } from "@/lib/formatDate";
import { FormPhase } from "@/lib/formPhase";
import { AddIcon } from "@/lib/icons";
import {
  PROJECTS_PANEL_INITIAL_STATE,
  ProjectsPanelActionType,
  projectsPanelReducer,
  toPanelFailure,
} from "@/lib/projectsPanelState";
import { perDayQuotaLabel, perMinuteQuotaLabel } from "@/lib/quotaLabel";
import { writeSelectedProjectId } from "@/lib/selectedProject";

/** Where a project's own screen lives. */
function projectPath(projectId: string): string {
  return `/dashboard/projects/${projectId}`;
}

/**
 * The project list screen.
 *
 * A project is the root of the access model: the plan hangs off it, the
 * registrations hang off it, and the quota is counted against it. This is
 * where a developer sees the ones they hold and creates the next one, so an
 * account with none is led straight into creating its first.
 *
 * The registration counts come from one list of the account's registrations
 * grouped by project, rather than from a detail call per project.
 *
 * Rendered with `client:load` from `dashboard/projects/index.astro`.
 *
 * @returns The project list content.
 */
export function ProjectsPanel() {
  const [state, dispatch] = useReducer(projectsPanelReducer, PROJECTS_PANEL_INITIAL_STATE);
  const { projects, registrationCounts, listFailure, formOpen, name, phase, createFailure } = state;

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([listDeveloperProjects(controller.signal), listApiClients(controller.signal)]).then(
      ([projectResult, registrationResult]) => {
        if (controller.signal.aborted) return;
        if (!projectResult.ok || !projectResult.data) {
          dispatch({ type: ProjectsPanelActionType.ProjectsUnavailable, failure: toPanelFailure(projectResult) });
          return;
        }
        const counts: Record<string, number> = {};
        for (const registration of registrationResult.data?.clients ?? []) {
          counts[registration.projectId] = (counts[registration.projectId] ?? 0) + 1;
        }
        dispatch({
          type: ProjectsPanelActionType.ProjectsLoaded,
          projects: projectResult.data.projects,
          registrationCounts: counts,
        });
      },
    );
    return () => controller.abort();
  }, []);

  const onName = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      dispatch({ type: ProjectsPanelActionType.NameEdited, value: event.target.value }),
    [],
  );

  const onOpenForm = useCallback(() => dispatch({ type: ProjectsPanelActionType.FormToggled, open: true }), []);
  const onCloseForm = useCallback(() => dispatch({ type: ProjectsPanelActionType.FormToggled, open: false }), []);

  const onSubmit = useCallback(
    async (event: SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault();
      const displayName = name.trim();
      if (!displayName || displayName.length > MAX_APP_NAME_LENGTH) {
        dispatch({
          type: ProjectsPanelActionType.ValidationFailed,
          message: `A project name is required, and it may be at most ${MAX_APP_NAME_LENGTH} characters.`,
        });
        return;
      }

      dispatch({ type: ProjectsPanelActionType.CreateStarted });
      const result = await createDeveloperProject(displayName);
      if (result.ok && result.data) {
        // The project the developer just made is the one they are looking at.
        writeSelectedProjectId(result.data.project.id);
        dispatch({ type: ProjectsPanelActionType.CreateSucceeded, project: result.data.project });
        return;
      }
      dispatch({ type: ProjectsPanelActionType.CreateFailed, failure: toPanelFailure(result) });
    },
    [name],
  );

  return (
    <div className="flex flex-col gap-6">
      <section>
        <div className="card-content-inset flex items-center justify-between gap-3 mb-3">
          <h2 className="text-card-title font-medium tracking-tight">Your projects</h2>
          {!formOpen && projects !== null && projects.length > 0 && (
            <button type="button" onClick={onOpenForm} className="button button--secondary text-body">
              <AddIcon className="size-5" aria-hidden="true" />
              New project
            </button>
          )}
        </div>

        <div className="surface-card px-6 py-5 flex flex-col gap-4">
          {projects === null && !listFailure && <p className="text-body text-fg-muted">Loading…</p>}
          {listFailure && <ApiFailureNotice {...listFailure} />}

          {projects !== null && projects.length === 0 && !formOpen && (
            <>
              <p className="text-body text-fg-muted">
                A project holds your plan, your registrations and your quota. Everything else in this portal hangs off
                one, so this is the first thing to create.
              </p>
              <div className="sm:max-w-xs">
                <SubmitButton type="button" onClick={onOpenForm}>
                  <AddIcon className="size-5" aria-hidden="true" />
                  Create your first project
                </SubmitButton>
              </div>
            </>
          )}

          {formOpen && (
            <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
              <TextField
                name="displayName"
                label="Project name"
                value={name}
                onChange={onName}
                placeholder="My Music App"
                hint="Only you and the operator see this. It can be changed later."
              />
              {createFailure && <ApiFailureNotice {...createFailure} />}
              <div className="flex gap-3">
                <div className="sm:max-w-xs flex-1">
                  <SubmitButton loading={phase === FormPhase.Submitting}>Create project</SubmitButton>
                </div>
                <div className="sm:max-w-xs flex-1">
                  <SubmitButton variant={ButtonVariant.Secondary} type="button" onClick={onCloseForm}>
                    Cancel
                  </SubmitButton>
                </div>
              </div>
            </form>
          )}

          {projects !== null && projects.length > 0 && (
            <ul className="flex flex-col divide-y divide-border">
              {projects.map((project) => (
                <li key={project.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <a
                      href={projectPath(project.id)}
                      className="text-body font-medium text-fg truncate hover:underline"
                    >
                      {project.displayName}
                    </a>
                    <StatusBadge status={project.status} />
                  </div>
                  <p className="text-nav text-fg-subtle">
                    {perMinuteQuotaLabel(project.quota.requestsPerMinute)} ·{" "}
                    {perDayQuotaLabel(project.quota.requestsPerDay)}
                  </p>
                  <p className="text-nav text-fg-subtle">
                    {registrationCounts[project.id] ?? 0} registration
                    {(registrationCounts[project.id] ?? 0) === 1 ? "" : "s"} · created {formatDate(project.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
