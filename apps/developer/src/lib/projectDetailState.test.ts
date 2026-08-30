import { describe, expect, it } from "vitest";
import type { DeveloperProjectDto } from "./apiAccessClient";
import { FormPhase } from "./formPhase";
import { PROJECT_DETAIL_INITIAL_STATE, ProjectDetailActionType, projectDetailReducer } from "./projectDetailState";

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

describe("projectDetailReducer", () => {
  it("fills the name field from the project that was loaded", () => {
    const next = projectDetailReducer(PROJECT_DETAIL_INITIAL_STATE, {
      type: ProjectDetailActionType.ProjectLoaded,
      project: makeProject(),
      registrations: [],
    });

    expect(next.name).toBe("My Music App");
    expect(next.registrations).toEqual([]);
    expect(next.loadFailure).toBeNull();
  });

  it("puts the name field back to what was actually stored after a save", () => {
    const loaded = projectDetailReducer(PROJECT_DETAIL_INITIAL_STATE, {
      type: ProjectDetailActionType.ProjectLoaded,
      project: makeProject(),
      registrations: [],
    });
    const typed = projectDetailReducer(loaded, { type: ProjectDetailActionType.NameEdited, value: "  Renamed  " });

    const next = projectDetailReducer(typed, {
      type: ProjectDetailActionType.SaveSucceeded,
      project: makeProject({ displayName: "Renamed" }),
    });

    // The backend trims, so the field shows the trimmed value rather than the
    // one that was typed.
    expect(next.name).toBe("Renamed");
    expect(next.phase).toBe(FormPhase.Success);
  });

  it("keeps the project on screen when a status change is refused", () => {
    const loaded = projectDetailReducer(PROJECT_DETAIL_INITIAL_STATE, {
      type: ProjectDetailActionType.ProjectLoaded,
      project: makeProject(),
      registrations: [],
    });

    const next = projectDetailReducer(loaded, {
      type: ProjectDetailActionType.SaveFailed,
      failure: { code: "MC-REQ-0001", message: "Invalid project status.", errorId: "abc" },
    });

    expect(next.project?.id).toBe("project-1");
    expect(next.phase).toBe(FormPhase.Error);
    expect(next.saveFailure?.errorId).toBe("abc");
  });

  it("shows the failure instead of the project when the load itself failed", () => {
    const next = projectDetailReducer(PROJECT_DETAIL_INITIAL_STATE, {
      type: ProjectDetailActionType.ProjectUnavailable,
      failure: { code: "MC-RES-0003", message: "Project not found.", errorId: "def" },
    });

    expect(next.project).toBeNull();
    expect(next.loadFailure?.code).toBe("MC-RES-0003");
  });
});
