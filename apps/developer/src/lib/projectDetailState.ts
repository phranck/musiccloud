/**
 * @file Reducer and state model for one project's own screen.
 *
 * The screen loads a project with its registrations, renames it, and moves it
 * between the three lifecycle states the route admits. Keeping the transitions
 * in a pure reducer keeps them testable without rendering, and keeps the
 * component to dispatching.
 */
import type { ApiClientDto, DeveloperProjectDto } from "@/lib/apiAccessClient";
import { FormPhase, type FormPhaseValue } from "@/lib/formPhase";
import type { PanelFailure } from "@/lib/projectsPanelState";

/** Action kinds for {@link projectDetailReducer}. */
export const ProjectDetailActionType = {
  /** The mount fetch delivered the project and its registrations. */
  ProjectLoaded: "ProjectLoaded",
  /** The mount fetch failed. */
  ProjectUnavailable: "ProjectUnavailable",
  /** The developer typed in the name field. */
  NameEdited: "NameEdited",
  /** A rename or a status change is in flight. */
  SaveStarted: "SaveStarted",
  /** Validation rejected the name before any request was made. */
  ValidationFailed: "ValidationFailed",
  /** The backend accepted the change and returned the project. */
  SaveSucceeded: "SaveSucceeded",
  /** The backend refused the change. */
  SaveFailed: "SaveFailed",
} as const;

/** A {@link ProjectDetailActionType} member value. */
export type ProjectDetailActionTypeValue = (typeof ProjectDetailActionType)[keyof typeof ProjectDetailActionType];

/** Full state of one project's screen. */
export interface ProjectDetailState {
  /** The project, or `null` while loading. */
  project: DeveloperProjectDto | null;
  /** Its registrations, newest first; `null` while loading. */
  registrations: ApiClientDto[] | null;
  /** Why the project could not be loaded, or `null`. */
  loadFailure: PanelFailure | null;
  /** The name field's current value. */
  name: string;
  /** Save lifecycle phase. */
  phase: FormPhaseValue;
  /** Why the last change was refused, or `null`. */
  saveFailure: PanelFailure | null;
}

/** Discriminated union of every action the screen dispatches. */
export type ProjectDetailAction =
  | {
      type: typeof ProjectDetailActionType.ProjectLoaded;
      project: DeveloperProjectDto;
      registrations: ApiClientDto[];
    }
  | { type: typeof ProjectDetailActionType.ProjectUnavailable; failure: PanelFailure }
  | { type: typeof ProjectDetailActionType.NameEdited; value: string }
  | { type: typeof ProjectDetailActionType.SaveStarted }
  | { type: typeof ProjectDetailActionType.ValidationFailed; message: string }
  | { type: typeof ProjectDetailActionType.SaveSucceeded; project: DeveloperProjectDto }
  | { type: typeof ProjectDetailActionType.SaveFailed; failure: PanelFailure };

/** Initial state: everything loading, nothing typed. */
export const PROJECT_DETAIL_INITIAL_STATE: ProjectDetailState = {
  project: null,
  registrations: null,
  loadFailure: null,
  name: "",
  phase: FormPhase.Idle,
  saveFailure: null,
};

/**
 * Pure transition function for one project's screen.
 *
 * A load and a successful save both set the name field from the project the
 * backend returned, so the field always shows what is actually stored rather
 * than what was last typed.
 *
 * @param state - The current state.
 * @param action - The dispatched action.
 * @returns The next state.
 */
export function projectDetailReducer(state: ProjectDetailState, action: ProjectDetailAction): ProjectDetailState {
  switch (action.type) {
    case ProjectDetailActionType.ProjectLoaded:
      return {
        ...state,
        project: action.project,
        registrations: action.registrations,
        name: action.project.displayName,
        loadFailure: null,
      };
    case ProjectDetailActionType.ProjectUnavailable:
      return { ...state, loadFailure: action.failure };
    case ProjectDetailActionType.NameEdited:
      return { ...state, name: action.value, phase: FormPhase.Idle, saveFailure: null };
    case ProjectDetailActionType.SaveStarted:
      return { ...state, phase: FormPhase.Submitting, saveFailure: null };
    case ProjectDetailActionType.ValidationFailed:
      return { ...state, phase: FormPhase.Error, saveFailure: { message: action.message } };
    case ProjectDetailActionType.SaveSucceeded:
      return {
        ...state,
        project: action.project,
        name: action.project.displayName,
        phase: FormPhase.Success,
        saveFailure: null,
      };
    case ProjectDetailActionType.SaveFailed:
      return { ...state, phase: FormPhase.Error, saveFailure: action.failure };
    default:
      return state;
  }
}
