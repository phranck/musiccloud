import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchProject: vi.fn(),
  updateProject: vi.fn(),
  fetchTiers: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  fetchDeveloperProject: mocks.fetchProject,
  updateDeveloperProject: mocks.updateProject,
  fetchTiers: mocks.fetchTiers,
}));

vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  useNavigate: () => mocks.navigate,
  useParams: () => ({ id: "project-1" }),
}));

// The real header is mocked down to the two things these tests read: the
// title, and the leading slot that carries the back button.
vi.mock("@/components/ui/PageHeader", () => ({
  PageHeader: ({ title, renderLeading }: { title: string; renderLeading?: () => React.ReactNode }) => (
    <div>
      {renderLeading?.()}
      <h1>{title}</h1>
    </div>
  ),
}));

import { ProjectDetailPage } from "./ProjectDetailPage";

/** A project detail response the tests override field by field. */
function makeDetail(overrides: Record<string, unknown> = {}) {
  return {
    project: {
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
      ...((overrides.project as Record<string, unknown>) ?? {}),
    },
    subscription: null,
    registrations: (overrides.registrations as unknown[]) ?? [],
  };
}

/** One registration under the project. */
function makeRegistration(overrides: Record<string, unknown> = {}) {
  return {
    id: "registration-1",
    developerAccountId: "account-1",
    projectId: "project-1",
    publicClientId: "mc_client_1",
    registrationType: "development",
    capabilities: ["legacy_api_key"],
    projectDisplayName: "Beat Machine",
    projectStatus: "active",
    projectRequestsPerMinute: null,
    projectRequestsPerDay: null,
    appName: "Beat Machine iOS",
    contactEmail: "dev@example.com",
    description: "",
    websiteUrl: null,
    status: "active",
    requestsPerMinute: null,
    requestsPerDay: null,
    tierName: "Free",
    tierRequestsPerMinute: 60,
    tierRequestsPerDay: 10000,
    effectiveRequestsPerMinute: 60,
    effectiveRequestsPerDay: 10000,
    createdAt: "2026-07-01T10:00:00.000Z",
    updatedAt: "2026-07-01T10:00:00.000Z",
    tokens: [{ id: "token-1", tokenPrefix: "abc", status: "active", createdAt: "", lastUsedAt: null, revokedAt: null }],
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProjectDetailPage />
    </QueryClientProvider>,
  );
}

describe("ProjectDetailPage", () => {
  beforeEach(() => {
    mocks.fetchProject.mockReset();
    mocks.updateProject.mockReset();
    mocks.fetchTiers.mockReset();
    mocks.fetchTiers.mockResolvedValue([]);
    mocks.navigate.mockReset();
  });

  it("carries the plan and quota section, which owns the limit figures", async () => {
    mocks.fetchProject.mockResolvedValue(makeDetail());
    renderPage();

    expect(await screen.findByText("Beat Machine")).not.toBeNull();
    // The section's own test covers what it shows; here the page only has to
    // hand it the project it loaded.
    expect(screen.getByText("Plan and quota")).not.toBeNull();
    expect(screen.getByText("Enforced now: 60")).not.toBeNull();
  });

  it("says what suspending does before the action, and suspends on it", async () => {
    mocks.fetchProject.mockResolvedValue(makeDetail());
    mocks.updateProject.mockResolvedValue({ project: makeDetail().project });
    renderPage();

    const suspend = await screen.findByRole("button", { name: /Suspend project/ });
    expect(screen.getByText(/stops every token under this project/i)).not.toBeNull();

    fireEvent.click(suspend);

    await waitFor(() => {
      expect(mocks.updateProject.mock.calls[0]?.[0]).toBe("project-1");
      expect(mocks.updateProject.mock.calls[0]?.[1]).toEqual({ status: "suspended" });
    });
  });

  it("offers reactivation for a suspended project and no action for a deleted one", async () => {
    mocks.fetchProject.mockResolvedValue(makeDetail({ project: { status: "suspended" } }));
    const suspended = renderPage();
    expect(await screen.findByRole("button", { name: /Reactivate project/ })).not.toBeNull();
    suspended.unmount();

    mocks.fetchProject.mockResolvedValue(makeDetail({ project: { status: "deleted" } }));
    renderPage();
    expect(await screen.findByText(/This project is deleted/i)).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Suspend project|Reactivate project/ })).toBeNull();
  });

  it("lists the registrations under the project and its empty state", async () => {
    mocks.fetchProject.mockResolvedValue(makeDetail());
    const empty = renderPage();
    expect(await screen.findByText("No registrations under this project.")).not.toBeNull();
    empty.unmount();

    mocks.fetchProject.mockResolvedValue(makeDetail({ registrations: [makeRegistration()] }));
    renderPage();
    expect(await screen.findByText("Beat Machine iOS")).not.toBeNull();
    expect(screen.getByText(/development · mc_client_1/)).not.toBeNull();
    expect(screen.getByText("Tokens: 1")).not.toBeNull();
  });

  it("goes back to the account that owns the project", async () => {
    mocks.fetchProject.mockResolvedValue(makeDetail());
    renderPage();

    // The loading state carries the same back button, so the title is what
    // says the project has arrived and the target is known.
    await screen.findByText("Beat Machine");
    fireEvent.click(screen.getByRole("button", { name: /Developer Account/ }));

    expect(mocks.navigate).toHaveBeenCalledWith("/developer/accounts/account-1");
  });
});
