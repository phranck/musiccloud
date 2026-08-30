import { type ColumnDef, DataTable } from "@musiccloud/dashboard-ui";
import { type ChangeEvent, type SyntheticEvent, useCallback, useEffect, useMemo, useReducer } from "react";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { TextField } from "@/components/auth/TextField";
import { ApiFailureNotice } from "@/components/dashboard/ApiFailureNotice";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { ContentCard } from "@/components/docs/ContentCard";
import { ContentPanel } from "@/components/docs/ContentPanel";
import {
  createDeveloperProject,
  type DeveloperProjectDto,
  listApiClients,
  listDeveloperProjects,
  MAX_APP_NAME_LENGTH,
} from "@/lib/apiAccessClient";
import { ButtonVariant } from "@/lib/buttonVariant";
import { formatDate } from "@/lib/formatDate";
import { FormPhase } from "@/lib/formPhase";
import { AddIcon, DataIcon } from "@/lib/icons";
import { projectPath } from "@/lib/projectPath";
import {
  ProjectsPanelActionType,
  type ProjectsPanelSeed,
  projectsPanelInitialState,
  projectsPanelReducer,
  toPanelFailure,
} from "@/lib/projectsPanelState";
import { quotaSummaryLabel } from "@/lib/quotaLabel";

/**
 * Props for {@link ProjectsPanel}.
 */
export interface ProjectsPanelProps {
  /**
   * What the page read server-side, so the rows are in the first paint. Left
   * out, the panel reads the list itself once it has hydrated.
   */
  seed?: ProjectsPanelSeed;
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
 * Rendered with `client:load` from `dashboard/projects/index.astro`, which
 * hands it the list it already read.
 *
 * @param props - See {@link ProjectsPanelProps}.
 * @returns The project list content.
 */
export function ProjectsPanel({ seed }: ProjectsPanelProps) {
  const [state, dispatch] = useReducer(projectsPanelReducer, seed, projectsPanelInitialState);
  const { projects, registrationCounts, maxProjects, usedProjects, listFailure, formOpen, name, phase, createFailure } =
    state;

  // A page that read the list server-side has already put it in the first
  // paint, so there is nothing to fetch on mount.
  const seeded = seed !== undefined;

  useEffect(() => {
    if (seeded) return;
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
          maxProjects: projectResult.data.limits.maxProjects,
          usedProjects: projectResult.data.limits.usedProjects,
        });
      },
    );
    return () => controller.abort();
  }, [seeded]);

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
        dispatch({ type: ProjectsPanelActionType.CreateSucceeded, project: result.data.project });
        return;
      }
      dispatch({ type: ProjectsPanelActionType.CreateFailed, failure: toPanelFailure(result) });
    },
    [name],
  );

  const columns = useMemo<ColumnDef<DeveloperProjectDto>[]>(
    () => [
      {
        id: "name",
        header: "Project",
        sortKey: (project) => project.displayName.toLocaleLowerCase(),
        cell: (project) => (
          <a href={projectPath(project.id)} className="text-body text-fg hover:underline">
            {project.displayName}
          </a>
        ),
      },
      {
        id: "status",
        header: "Status",
        headerClassName: "w-28",
        sortKey: (project) => project.status,
        cell: (project) => <StatusBadge status={project.status} />,
      },
      {
        id: "quota",
        header: "Quota",
        headerClassName: "w-72",
        cell: (project) => (
          <span className="text-nav text-fg-muted">
            {quotaSummaryLabel(project.quota.requestsPerMinute, project.quota.requestsPerDay)}
          </span>
        ),
      },
      {
        id: "registrations",
        header: "Registrations",
        sortKey: (project) => registrationCounts[project.id] ?? 0,
        // A count is compared by size, so its figures line up at the right edge.
        headerClassName: "w-32 text-right",
        cellClassName: "text-right",
        cell: (project) => <span className="text-nav text-fg-muted">{registrationCounts[project.id] ?? 0}</span>,
      },
      {
        id: "created",
        header: "Created",
        headerClassName: "w-36",
        sortKey: (project) => project.createdAt,
        cell: (project) => <span className="text-nav text-fg-muted">{formatDate(project.createdAt)}</span>,
      },
      {
        id: "actions",
        header: "",
        headerClassName: "w-24 text-right",
        cellClassName: "text-right",
        cell: (project) => (
          <a href={projectPath(project.id)} className="button button--secondary text-body">
            Edit
          </a>
        ),
      },
    ],
    [registrationCounts],
  );

  const remaining = Math.max(maxProjects - usedProjects, 0);
  const allowance = `You have ${maxProjects} ${maxProjects === 1 ? "project" : "projects"} available. ${
    remaining === 0
      ? "None are left, so a new one needs an existing project removed first."
      : `There ${remaining === 1 ? "is" : "are"} still ${remaining} ${remaining === 1 ? "project" : "projects"} left.`
  }`;

  return (
    <ContentCard>
      <ContentCard.Header>
        <ContentCard.Header.Icon>
          <DataIcon aria-hidden="true" />
        </ContentCard.Header.Icon>
        <ContentCard.Header.Title>Your projects</ContentCard.Header.Title>
        {!formOpen && projects !== null && projects.length > 0 && remaining > 0 && (
          <ContentCard.Header.Addon>
            <button type="button" onClick={onOpenForm} className="button button--secondary text-body">
              <AddIcon className="size-5" aria-hidden="true" />
              New project
            </button>
          </ContentCard.Header.Addon>
        )}
      </ContentCard.Header>

      {formOpen ? (
        <form onSubmit={onSubmit} noValidate>
          <ContentCard.Body>
            <ContentCard.Body.Copy>
              <TextField
                name="displayName"
                label="Project name"
                value={name}
                onChange={onName}
                placeholder="My Music App"
                hint="Only you and the operator see this. It can be changed later."
              />
              {createFailure && <ApiFailureNotice {...createFailure} />}
            </ContentCard.Body.Copy>
          </ContentCard.Body>
          <ContentCard.Footer>
            <span className="text-nav mr-auto">{allowance}</span>
            <SubmitButton variant={ButtonVariant.Secondary} type="button" onClick={onCloseForm}>
              Cancel
            </SubmitButton>
            <SubmitButton loading={phase === FormPhase.Submitting}>Create project</SubmitButton>
          </ContentCard.Footer>
        </form>
      ) : (
        <>
          <ContentCard.Body>
            <ContentCard.Body.Copy>
              {projects === null && !listFailure && <p className="text-body text-fg-muted">Loading…</p>}
              {listFailure && <ApiFailureNotice {...listFailure} />}

              {projects !== null && projects.length === 0 && (
                <p className="text-body text-fg-muted">
                  A project holds your plan, your registrations and your quota. Everything else in this portal hangs off
                  one, so this is the first thing to create.
                </p>
              )}
            </ContentCard.Body.Copy>

            {projects !== null && projects.length > 0 && (
              <ContentCard.Body.Stack>
                <ContentPanel className="content-panel--table">
                  <DataTable columns={columns} data={projects} getRowKey={(project) => project.id}>
                    <DataTable.Viewport>
                      <DataTable.Head />
                      <DataTable.Rows />
                    </DataTable.Viewport>
                  </DataTable>
                </ContentPanel>
              </ContentCard.Body.Stack>
            )}
          </ContentCard.Body>
          <ContentCard.Footer>
            <span className="text-nav mr-auto">{allowance}</span>
            {projects !== null && projects.length === 0 && remaining > 0 && (
              <SubmitButton type="button" onClick={onOpenForm}>
                <AddIcon className="size-5" aria-hidden="true" />
                Create your first project
              </SubmitButton>
            )}
          </ContentCard.Footer>
        </>
      )}
    </ContentCard>
  );
}
