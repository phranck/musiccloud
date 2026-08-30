import { describe, expect, it } from "vitest";
import type { DeveloperProjectDto } from "./apiAccessClient";
import { FormPhase } from "./formPhase";
import {
  PROJECTS_PANEL_INITIAL_STATE,
  ProjectsPanelActionType,
  projectsPanelReducer,
  toPanelFailure,
} from "./projectsPanelState";

function makeProject(overrides: Partial<DeveloperProjectDto> = {}): DeveloperProjectDto {
  return {
    id: "project-1",
    displayName: "My Music App",
    status: "active",
    subscription: { tierId: "tier_free", tierName: "Free" },
    quota: {
      requestsPerMinute: 60,
      requestsPerDay: 10000,
      overrideRequestsPerMinute: null,
      overrideRequestsPerDay: null,
    },
    createdAt: "2026-08-30T00:00:00.000Z",
    updatedAt: "2026-08-30T00:00:00.000Z",
    ...overrides,
  };
}

describe("projectsPanelReducer", () => {
  it("keeps the registration counts that came with the list", () => {
    const next = projectsPanelReducer(PROJECTS_PANEL_INITIAL_STATE, {
      type: ProjectsPanelActionType.ProjectsLoaded,
      projects: [makeProject()],
      registrationCounts: { "project-1": 3 },
    });

    expect(next.projects).toHaveLength(1);
    expect(next.registrationCounts["project-1"]).toBe(3);
    expect(next.listFailure).toBeNull();
  });

  it("prepends a created project and gives it no registrations", () => {
    const loaded = projectsPanelReducer(PROJECTS_PANEL_INITIAL_STATE, {
      type: ProjectsPanelActionType.ProjectsLoaded,
      projects: [makeProject()],
      registrationCounts: { "project-1": 2 },
    });

    const next = projectsPanelReducer(loaded, {
      type: ProjectsPanelActionType.CreateSucceeded,
      project: makeProject({ id: "project-2", displayName: "Second app" }),
    });

    expect(next.projects?.map((project) => project.id)).toEqual(["project-2", "project-1"]);
    // A project that has just been created cannot hold a registration yet, so
    // the count is stated rather than left absent.
    expect(next.registrationCounts["project-2"]).toBe(0);
    expect(next.registrationCounts["project-1"]).toBe(2);
    expect(next.formOpen).toBe(false);
    expect(next.name).toBe("");
    expect(next.phase).toBe(FormPhase.Success);
  });

  it("carries the code, the message and the error id of a refused creation", () => {
    const next = projectsPanelReducer(PROJECTS_PANEL_INITIAL_STATE, {
      type: ProjectsPanelActionType.CreateFailed,
      failure: toPanelFailure({
        ok: false,
        status: 409,
        code: "MC-REQ-0003",
        message: "You already hold 10 projects, which is the maximum.",
        errorId: "7f0f2c2e-0b1e-4a1a-9c1a-1a2b3c4d5e6f",
      }),
    });

    expect(next.phase).toBe(FormPhase.Error);
    expect(next.createFailure).toEqual({
      code: "MC-REQ-0003",
      message: "You already hold 10 projects, which is the maximum.",
      errorId: "7f0f2c2e-0b1e-4a1a-9c1a-1a2b3c4d5e6f",
      retryAfterSeconds: undefined,
    });
  });

  it("clears a previous failure as soon as the name is edited again", () => {
    const failed = projectsPanelReducer(PROJECTS_PANEL_INITIAL_STATE, {
      type: ProjectsPanelActionType.ValidationFailed,
      message: "A project name is required.",
    });

    const next = projectsPanelReducer(failed, { type: ProjectsPanelActionType.NameEdited, value: "A" });

    expect(next.createFailure).toBeNull();
    expect(next.phase).toBe(FormPhase.Idle);
  });

  it("empties the form whenever it is opened or closed", () => {
    const typed = projectsPanelReducer(
      { ...PROJECTS_PANEL_INITIAL_STATE, formOpen: true },
      { type: ProjectsPanelActionType.NameEdited, value: "half typed" },
    );

    expect(projectsPanelReducer(typed, { type: ProjectsPanelActionType.FormToggled, open: false }).name).toBe("");
    expect(projectsPanelReducer(typed, { type: ProjectsPanelActionType.FormToggled, open: true }).name).toBe("");
  });
});
