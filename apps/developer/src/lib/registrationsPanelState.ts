/**
 * @file Reducer and state model for the registrations under one project.
 *
 * The screen is one finite state machine: it loads the registrations, creates
 * one from an inline form, and moves an existing one between lifecycle states.
 * Keeping the transitions here as a pure reducer follows the same shape as the
 * other panels and keeps every transition testable without rendering.
 */
import { type ApiClientDto, ClientRegistrationType, type ClientRegistrationTypeValue } from "@/lib/apiAccessClient";
import { FormPhase, type FormPhaseValue } from "@/lib/formPhase";
import type { PanelFailure } from "@/lib/projectsPanelState";

/** Action kinds for {@link registrationsPanelReducer}. */
export const RegistrationsPanelActionType = {
  /** The mount fetch delivered the project's registrations. */
  RegistrationsLoaded: "RegistrationsLoaded",
  /** The mount fetch failed. */
  RegistrationsUnavailable: "RegistrationsUnavailable",
  /** The create form was opened or closed. */
  FormToggled: "FormToggled",
  /** The developer edited one of the form fields. */
  FieldEdited: "FieldEdited",
  /** The developer picked a client profile. */
  ProfileChosen: "ProfileChosen",
  /** A create or a lifecycle change is in flight. */
  ActionStarted: "ActionStarted",
  /** Validation rejected the form before any request was made. */
  ValidationFailed: "ValidationFailed",
  /** A registration was created; it is prepended to the list. */
  CreateSucceeded: "CreateSucceeded",
  /** A registration changed state; it replaces its entry in the list. */
  RegistrationChanged: "RegistrationChanged",
  /** The backend refused a create or a lifecycle change. */
  ActionFailed: "ActionFailed",
} as const;

/** A {@link RegistrationsPanelActionType} member value. */
export type RegistrationsPanelActionTypeValue =
  (typeof RegistrationsPanelActionType)[keyof typeof RegistrationsPanelActionType];

/** The editable form fields, kept together so an edit is one action shape. */
export interface RegistrationFields {
  /** The application's name. */
  name: string;
  /** Where the application can be looked at; optional. */
  websiteUrl: string;
}

/** Full state of the registrations screen. */
export interface RegistrationsPanelState {
  /** The project's registrations, newest first; `null` while loading. */
  registrations: ApiClientDto[] | null;
  /** Why the list could not be loaded, or `null`. */
  loadFailure: PanelFailure | null;
  /** Whether the create form is open. */
  formOpen: boolean;
  /** Current form values. */
  fields: RegistrationFields;
  /** The client profile currently chosen. */
  profile: ClientRegistrationTypeValue;
  /** Lifecycle phase of the last create or change. */
  phase: FormPhaseValue;
  /** Why the last create or change was refused, or `null`. */
  actionFailure: PanelFailure | null;
}

/** Discriminated union of every action the screen dispatches. */
export type RegistrationsPanelAction =
  | { type: typeof RegistrationsPanelActionType.RegistrationsLoaded; registrations: ApiClientDto[] }
  | { type: typeof RegistrationsPanelActionType.RegistrationsUnavailable; failure: PanelFailure }
  | { type: typeof RegistrationsPanelActionType.FormToggled; open: boolean }
  | { type: typeof RegistrationsPanelActionType.FieldEdited; field: keyof RegistrationFields; value: string }
  | { type: typeof RegistrationsPanelActionType.ProfileChosen; profile: ClientRegistrationTypeValue }
  | { type: typeof RegistrationsPanelActionType.ActionStarted }
  | { type: typeof RegistrationsPanelActionType.ValidationFailed; message: string }
  | { type: typeof RegistrationsPanelActionType.CreateSucceeded; registration: ApiClientDto }
  | { type: typeof RegistrationsPanelActionType.RegistrationChanged; registration: ApiClientDto }
  | { type: typeof RegistrationsPanelActionType.ActionFailed; failure: PanelFailure };

/** A pristine, closed form. Development is the profile a developer starts on. */
const EMPTY_FORM: RegistrationFields = { name: "", websiteUrl: "" };

/** Initial state: list loading, form closed and empty. */
export const REGISTRATIONS_PANEL_INITIAL_STATE: RegistrationsPanelState = {
  registrations: null,
  loadFailure: null,
  formOpen: false,
  fields: EMPTY_FORM,
  profile: ClientRegistrationType.Development,
  phase: FormPhase.Idle,
  actionFailure: null,
};

/**
 * Pure transition function for the registrations screen.
 *
 * A created registration is prepended from the response, and a changed one
 * replaces its entry, so neither needs the list to be fetched again.
 *
 * @param state - The current state.
 * @param action - The dispatched action.
 * @returns The next state.
 */
export function registrationsPanelReducer(
  state: RegistrationsPanelState,
  action: RegistrationsPanelAction,
): RegistrationsPanelState {
  switch (action.type) {
    case RegistrationsPanelActionType.RegistrationsLoaded:
      return { ...state, registrations: action.registrations, loadFailure: null };
    case RegistrationsPanelActionType.RegistrationsUnavailable:
      return { ...state, loadFailure: action.failure };
    case RegistrationsPanelActionType.FormToggled:
      return {
        ...state,
        formOpen: action.open,
        fields: EMPTY_FORM,
        profile: ClientRegistrationType.Development,
        phase: FormPhase.Idle,
        actionFailure: null,
      };
    case RegistrationsPanelActionType.FieldEdited:
      return {
        ...state,
        fields: { ...state.fields, [action.field]: action.value },
        phase: FormPhase.Idle,
        actionFailure: null,
      };
    case RegistrationsPanelActionType.ProfileChosen:
      return { ...state, profile: action.profile };
    case RegistrationsPanelActionType.ActionStarted:
      return { ...state, phase: FormPhase.Submitting, actionFailure: null };
    case RegistrationsPanelActionType.ValidationFailed:
      return { ...state, phase: FormPhase.Error, actionFailure: { message: action.message } };
    case RegistrationsPanelActionType.CreateSucceeded:
      return {
        ...state,
        registrations: [action.registration, ...(state.registrations ?? [])],
        formOpen: false,
        fields: EMPTY_FORM,
        profile: ClientRegistrationType.Development,
        phase: FormPhase.Success,
        actionFailure: null,
      };
    case RegistrationsPanelActionType.RegistrationChanged:
      return {
        ...state,
        registrations:
          state.registrations?.map((entry) => (entry.id === action.registration.id ? action.registration : entry)) ??
          state.registrations,
        phase: FormPhase.Success,
        actionFailure: null,
      };
    case RegistrationsPanelActionType.ActionFailed:
      return { ...state, phase: FormPhase.Error, actionFailure: action.failure };
    default:
      return state;
  }
}
