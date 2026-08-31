import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchProjects: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("@/features/developer/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/developer/api")>()),
  fetchDeveloperProjects: mocks.fetchProjects,
}));

vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  useNavigate: () => mocks.navigate,
}));

import { AccountProjectsSection } from "./AccountProjectsSection";

/** A project row the tests override field by field. */
function makeProject(overrides: Record<string, unknown> = {}) {
  return {
    id: "project-1",
    developerAccountId: "account-1",
    displayName: "Beat Machine",
    status: "active",
    requestsPerMinute: null,
    requestsPerDay: null,
    tierId: "tier_free",
    tierName: "Free",
    tierRequestsPerMinute: 60,
    tierRequestsPerDay: 10000,
    effectiveRequestsPerMinute: 60,
    effectiveRequestsPerDay: 10000,
    createdAt: "2026-07-01T10:00:00.000Z",
    updatedAt: "2026-07-01T10:00:00.000Z",
    suspendedAt: null,
    deletedAt: null,
    createdByAdminId: null,
    ...overrides,
  };
}

/** A registration, of which only the owning project matters here. */
function makeRegistration(projectId: string, id: string) {
  return { id, projectId } as never;
}

function renderSection(registrations: ReturnType<typeof makeRegistration>[] = []) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AccountProjectsSection accountId="account-1" registrations={registrations} />
    </QueryClientProvider>,
  );
}

describe("AccountProjectsSection", () => {
  beforeEach(() => {
    mocks.fetchProjects.mockReset();
    mocks.navigate.mockReset();
  });

  it("says the account holds no projects rather than showing an empty table", async () => {
    mocks.fetchProjects.mockResolvedValue({ projects: [] });
    renderSection();

    expect(await screen.findByText("This account holds no projects yet.")).not.toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("lists a project with its plan, enforced limits and registration count", async () => {
    mocks.fetchProjects.mockResolvedValue({ projects: [makeProject()] });
    renderSection([makeRegistration("project-1", "reg-1"), makeRegistration("project-1", "reg-2")]);

    expect(await screen.findByText("Beat Machine")).not.toBeNull();
    expect(screen.getByText("Free")).not.toBeNull();
    expect(screen.getByText("60/minute · 10000/day")).not.toBeNull();
    expect(screen.getByText("2")).not.toBeNull();
  });

  it("marks a project whose limits were overridden by an administrator", async () => {
    mocks.fetchProjects.mockResolvedValue({
      projects: [makeProject({ requestsPerMinute: 600, effectiveRequestsPerMinute: 600 })],
    });
    renderSection();

    expect(await screen.findByText("Custom")).not.toBeNull();
  });

  it("says a project without a granting plan has no quota", async () => {
    mocks.fetchProjects.mockResolvedValue({
      projects: [
        makeProject({
          tierName: null,
          effectiveRequestsPerMinute: null,
          effectiveRequestsPerDay: null,
        }),
      ],
    });
    renderSection();

    expect(await screen.findByText("No plan")).not.toBeNull();
    expect(screen.getByText("No active plan")).not.toBeNull();
  });

  it("opens the project detail from the row action", async () => {
    mocks.fetchProjects.mockResolvedValue({ projects: [makeProject()] });
    renderSection();

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));

    expect(mocks.navigate).toHaveBeenCalledWith("/developer/projects/project-1");
  });
});
