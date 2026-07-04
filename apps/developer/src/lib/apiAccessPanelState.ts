/**
 * @file Reducer + state model for the "API access" dashboard panel.
 *
 * The panel is one finite state machine (request list + submission form), so
 * its transitions live here as a pure reducer per the project Doctor policy
 * (group related state, keep logic out of component files). The component
 * only dispatches; every transition is testable in isolation.
 */
import type { AccessRequestDto } from "@/lib/apiAccessClient";
import { FormPhase, type FormPhaseValue } from "@/lib/formPhase";

/**
 * Action kinds for {@link accessPanelReducer}, as a PascalCase `as const`
 * namespace per the project domain-literals policy.
 */
export const AccessPanelActionType = {
  /** The mount fetch delivered the caller's requests. */
  RequestsLoaded: "RequestsLoaded",
  /** The mount fetch failed; the list shows an error line. */
  RequestsUnavailable: "RequestsUnavailable",
  /** The developer edited one of the form fields. */
  FieldEdited: "FieldEdited",
  /** The form was submitted; a request is in flight. */
  SubmitStarted: "SubmitStarted",
  /** Client-side validation rejected the form before any request. */
  ValidationFailed: "ValidationFailed",
  /** The backend accepted the request; it is prepended to the list. */
  SubmitSucceeded: "SubmitSucceeded",
  /** The backend rejected the request; the message is shown inline. */
  SubmitFailed: "SubmitFailed",
} as const;

/** An {@link AccessPanelActionType} member value. */
export type AccessPanelActionTypeValue = (typeof AccessPanelActionType)[keyof typeof AccessPanelActionType];

/** The editable form fields, kept together so edits are one action shape. */
export interface AccessPanelFields {
  /** App name input value. */
  appName: string;
  /** App description textarea value. */
  appDescription: string;
  /** Raw "estimated requests per day" input value (parsed on submit). */
  estimatedPerDay: string;
}

/** Full state of the API-access panel. */
export interface AccessPanelState {
  /** The caller's requests, newest first; `null` while loading. */
  requests: AccessRequestDto[] | null;
  /** Whether the list fetch failed. */
  listError: boolean;
  /** Current form field values. */
  fields: AccessPanelFields;
  /** Submission lifecycle phase. */
  phase: FormPhaseValue;
  /** Inline form error (validation or backend), or `null`. */
  formError: string | null;
}

/** Discriminated union of every panel action. */
export type AccessPanelAction =
  | { type: typeof AccessPanelActionType.RequestsLoaded; requests: AccessRequestDto[] }
  | { type: typeof AccessPanelActionType.RequestsUnavailable }
  | { type: typeof AccessPanelActionType.FieldEdited; field: keyof AccessPanelFields; value: string }
  | { type: typeof AccessPanelActionType.SubmitStarted }
  | { type: typeof AccessPanelActionType.ValidationFailed; message: string }
  | { type: typeof AccessPanelActionType.SubmitSucceeded; request: AccessRequestDto }
  | { type: typeof AccessPanelActionType.SubmitFailed; message: string };

/** Initial panel state: list loading, empty pristine form. */
export const ACCESS_PANEL_INITIAL_STATE: AccessPanelState = {
  requests: null,
  listError: false,
  fields: { appName: "", appDescription: "", estimatedPerDay: "" },
  phase: FormPhase.Idle,
  formError: null,
};

/**
 * Pure transition function for the API-access panel. A successful submit
 * prepends the created request (the POST response carries it, so no refetch
 * is needed) and resets the form.
 *
 * @param state - The current panel state.
 * @param action - The dispatched action.
 * @returns The next panel state.
 */
export function accessPanelReducer(state: AccessPanelState, action: AccessPanelAction): AccessPanelState {
  switch (action.type) {
    case AccessPanelActionType.RequestsLoaded:
      return { ...state, requests: action.requests, listError: false };
    case AccessPanelActionType.RequestsUnavailable:
      return { ...state, listError: true };
    case AccessPanelActionType.FieldEdited:
      return { ...state, fields: { ...state.fields, [action.field]: action.value } };
    case AccessPanelActionType.SubmitStarted:
      return { ...state, phase: FormPhase.Submitting, formError: null };
    case AccessPanelActionType.ValidationFailed:
      return { ...state, phase: FormPhase.Idle, formError: action.message };
    case AccessPanelActionType.SubmitSucceeded:
      return {
        ...state,
        requests: [action.request, ...(state.requests ?? [])],
        fields: ACCESS_PANEL_INITIAL_STATE.fields,
        phase: FormPhase.Success,
        formError: null,
      };
    case AccessPanelActionType.SubmitFailed:
      return { ...state, phase: FormPhase.Error, formError: action.message };
    default:
      return state;
  }
}
