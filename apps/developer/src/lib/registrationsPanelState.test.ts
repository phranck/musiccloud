import { describe, expect, it } from "vitest";
import { type ApiClientDto, ClientRegistrationType } from "./apiAccessClient";
import { FormPhase } from "./formPhase";
import {
  REGISTRATIONS_PANEL_INITIAL_STATE,
  RegistrationsPanelActionType,
  registrationsPanelReducer,
} from "./registrationsPanelState";

function makeRegistration(overrides: Partial<ApiClientDto> = {}): ApiClientDto {
  return {
    id: "client-1",
    projectId: "project-1",
    publicClientId: "mc_client_1",
    registrationType: ClientRegistrationType.Development,
    capabilities: [],
    projectDisplayName: "My Music App",
    projectStatus: "active",
    appName: "My Music App",
    description: "",
    websiteUrl: null,
    status: "active",
    requestsPerMinute: 60,
    requestsPerDay: 10000,
    createdAt: "2026-08-30T00:00:00.000Z",
    tokens: [],
    ...overrides,
  };
}

describe("registrationsPanelReducer", () => {
  it("prepends a created registration without refetching the list", () => {
    const loaded = registrationsPanelReducer(REGISTRATIONS_PANEL_INITIAL_STATE, {
      type: RegistrationsPanelActionType.RegistrationsLoaded,
      registrations: [makeRegistration()],
    });

    const next = registrationsPanelReducer(loaded, {
      type: RegistrationsPanelActionType.CreateSucceeded,
      registration: makeRegistration({ id: "client-2", appName: "Second app" }),
    });

    expect(next.registrations?.map((entry) => entry.id)).toEqual(["client-2", "client-1"]);
    expect(next.formOpen).toBe(false);
    expect(next.phase).toBe(FormPhase.Success);
  });

  it("adds a second registration without disturbing the first", () => {
    const loaded = registrationsPanelReducer(REGISTRATIONS_PANEL_INITIAL_STATE, {
      type: RegistrationsPanelActionType.RegistrationsLoaded,
      registrations: [makeRegistration()],
    });

    const next = registrationsPanelReducer(loaded, {
      type: RegistrationsPanelActionType.CreateSucceeded,
      registration: makeRegistration({ id: "client-2", registrationType: ClientRegistrationType.Public }),
    });

    expect(next.registrations?.find((entry) => entry.id === "client-1")).toEqual(makeRegistration());
  });

  it("replaces the registration whose state changed and leaves the rest alone", () => {
    const loaded = registrationsPanelReducer(REGISTRATIONS_PANEL_INITIAL_STATE, {
      type: RegistrationsPanelActionType.RegistrationsLoaded,
      registrations: [makeRegistration(), makeRegistration({ id: "client-2" })],
    });

    const next = registrationsPanelReducer(loaded, {
      type: RegistrationsPanelActionType.RegistrationChanged,
      registration: makeRegistration({ id: "client-2", status: "revoked" }),
    });

    expect(next.registrations?.find((entry) => entry.id === "client-1")?.status).toBe("active");
    expect(next.registrations?.find((entry) => entry.id === "client-2")?.status).toBe("revoked");
  });

  it("carries the code and the error id of a refused action", () => {
    const next = registrationsPanelReducer(REGISTRATIONS_PANEL_INITIAL_STATE, {
      type: RegistrationsPanelActionType.ActionFailed,
      failure: { code: "MC-REQ-0004", message: "This project already holds 5 registrations.", errorId: "abc" },
    });

    expect(next.phase).toBe(FormPhase.Error);
    expect(next.actionFailure?.code).toBe("MC-REQ-0004");
    expect(next.actionFailure?.errorId).toBe("abc");
  });

  it("starts every form on the development profile and empties it when it closes", () => {
    const typed = registrationsPanelReducer(
      { ...REGISTRATIONS_PANEL_INITIAL_STATE, formOpen: true },
      { type: RegistrationsPanelActionType.FieldEdited, field: "name", value: "half typed" },
    );
    const chosen = registrationsPanelReducer(typed, {
      type: RegistrationsPanelActionType.ProfileChosen,
      profile: ClientRegistrationType.Public,
    });

    const closed = registrationsPanelReducer(chosen, { type: RegistrationsPanelActionType.FormToggled, open: false });

    expect(closed.fields).toEqual({ name: "", websiteUrl: "" });
    expect(closed.profile).toBe(ClientRegistrationType.Development);
  });
});
