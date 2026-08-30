/**
 * @file Reducer and state model for the project list screen.
 *
 * The screen is one finite state machine: it loads the caller's projects and
 * their registration counts, and it creates a project from an inline form.
 * Keeping the transitions here as a pure reducer means every one of them is
 * testable without rendering anything, which is what the project's React
 * Doctor policy asks for.
 */
import type { ApiAccessResult, DeveloperProjectDto } from "@/lib/apiAccessClient";
import { FormPhase, type FormPhaseValue } from "@/lib/formPhase";

/** Action kinds for {@link projectsPanelReducer}. */
export const ProjectsPanelActionType = {
  /** The mount fetch delivered the caller's projects and their registration counts. */
  ProjectsLoaded: "ProjectsLoaded",
  /** The mount fetch failed; the list shows the failure with its error id. */
  ProjectsUnavailable: "ProjectsUnavailable",
  /** The developer typed in the name field. */
  NameEdited: "NameEdited",
  /** The create form was opened or closed. */
  FormToggled: "FormToggled",
  /** The form was submitted; a request is in flight. */
  CreateStarted: "CreateStarted",
  /** Validation rejected the name before any request was made. */
  ValidationFailed: "ValidationFailed",
  /** The backend created the project; it is prepended to the list. */
  CreateSucceeded: "CreateSucceeded",
  /** The backend refused; the failure is shown with its code and error id. */
  CreateFailed: "CreateFailed",
} as const;

/** A {@link ProjectsPanelActionType} member value. */
export type ProjectsPanelActionTypeValue = (typeof ProjectsPanelActionType)[keyof typeof ProjectsPanelActionType];

/** What the notice component needs in order to report a failed request. */
export interface PanelFailure {
  code?: string;
  message?: string;
  errorId?: string;
  retryAfterSeconds?: number;
}

/** Full state of the project list screen. */
export interface ProjectsPanelState {
  /** The caller's projects, newest first; `null` while loading. */
  projects: DeveloperProjectDto[] | null;
  /** How many registrations each project holds, keyed by project id. */
  registrationCounts: Record<string, number>;
  /** Why the list could not be loaded, or `null`. */
  listFailure: PanelFailure | null;
  /** Whether the create form is open. */
  formOpen: boolean;
  /** The name field's current value. */
  name: string;
  /** Creation lifecycle phase. */
  phase: FormPhaseValue;
  /** Why the creation was refused, or `null`. */
  createFailure: PanelFailure | null;
}

/** Discriminated union of every action the screen dispatches. */
export type ProjectsPanelAction =
  | {
      type: typeof ProjectsPanelActionType.ProjectsLoaded;
      projects: DeveloperProjectDto[];
      registrationCounts: Record<string, number>;
    }
  | { type: typeof ProjectsPanelActionType.ProjectsUnavailable; failure: PanelFailure }
  | { type: typeof ProjectsPanelActionType.NameEdited; value: string }
  | { type: typeof ProjectsPanelActionType.FormToggled; open: boolean }
  | { type: typeof ProjectsPanelActionType.CreateStarted }
  | { type: typeof ProjectsPanelActionType.ValidationFailed; message: string }
  | { type: typeof ProjectsPanelActionType.CreateSucceeded; project: DeveloperProjectDto }
  | { type: typeof ProjectsPanelActionType.CreateFailed; failure: PanelFailure };

/** Initial state: list loading, form closed and empty. */
export const PROJECTS_PANEL_INITIAL_STATE: ProjectsPanelState = {
  projects: null,
  registrationCounts: {},
  listFailure: null,
  formOpen: false,
  name: "",
  phase: FormPhase.Idle,
  createFailure: null,
};

/**
 * Reduces a failed request to what the failure notice shows.
 *
 * @param result - Any failed {@link ApiAccessResult}.
 * @returns The code, message, error id and retry window, where the backend sent them.
 */
export function toPanelFailure(result: ApiAccessResult<unknown>): PanelFailure {
  return {
    code: result.code,
    message: result.message,
    errorId: result.errorId,
    retryAfterSeconds: result.retryAfterSeconds,
  };
}

/**
 * Pure transition function for the project list screen.
 *
 * A successful creation prepends the project the response carried, so the list
 * does not have to be fetched again, and the new project starts with no
 * registrations because it cannot have any yet.
 *
 * @param state - The current state.
 * @param action - The dispatched action.
 * @returns The next state.
 */
export function projectsPanelReducer(state: ProjectsPanelState, action: ProjectsPanelAction): ProjectsPanelState {
  switch (action.type) {
    case ProjectsPanelActionType.ProjectsLoaded:
      return {
        ...state,
        projects: action.projects,
        registrationCounts: action.registrationCounts,
        listFailure: null,
      };
    case ProjectsPanelActionType.ProjectsUnavailable:
      return { ...state, listFailure: action.failure };
    case ProjectsPanelActionType.NameEdited:
      return { ...state, name: action.value, createFailure: null, phase: FormPhase.Idle };
    case ProjectsPanelActionType.FormToggled:
      return { ...state, formOpen: action.open, name: "", createFailure: null, phase: FormPhase.Idle };
    case ProjectsPanelActionType.CreateStarted:
      return { ...state, phase: FormPhase.Submitting, createFailure: null };
    case ProjectsPanelActionType.ValidationFailed:
      return { ...state, phase: FormPhase.Error, createFailure: { message: action.message } };
    case ProjectsPanelActionType.CreateSucceeded:
      return {
        ...state,
        projects: [action.project, ...(state.projects ?? [])],
        registrationCounts: { ...state.registrationCounts, [action.project.id]: 0 },
        formOpen: false,
        name: "",
        phase: FormPhase.Success,
        createFailure: null,
      };
    case ProjectsPanelActionType.CreateFailed:
      return { ...state, phase: FormPhase.Error, createFailure: action.failure };
    default:
      return state;
  }
}
