import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchOverview: vi.fn(),
  updateProject: vi.fn(),
  fetchTiers: vi.fn(),
}));

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  fetchApiAccessOverview: mocks.fetchOverview,
  updateDeveloperProject: mocks.updateProject,
  fetchTiers: mocks.fetchTiers,
}));

vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  useNavigate: () => vi.fn(),
  useParams: () => ({ id: "client-1" }),
}));

vi.mock("@/components/ui/PageHeader", () => ({ PageHeader: () => null }));

import { ClientDetailPage } from "./ClientDetailPage";
import { ProjectPlanSection } from "./components/ProjectPlanSection";

/** One application as the overview lists it, with no override on its project. */
function makeClient(overrides: Record<string, unknown> = {}) {
  return {
    id: "client-1",
    developerAccountId: "account-1",
    projectId: "project-1",
    publicClientId: "mc_client_1",
    registrationType: "development",
    capabilities: [],
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
    tokens: [],
    ...overrides,
  };
}

function renderWithQueries(node: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

async function renderPage() {
  renderWithQueries(<ClientDetailPage />);
  return (await screen.findByRole("button", { name: "Save" })) as HTMLButtonElement;
}

describe("ClientDetailPage limit overrides", () => {
  beforeEach(() => {
    mocks.fetchOverview.mockReset();
    mocks.updateProject.mockReset();
    mocks.fetchTiers.mockReset();
    mocks.fetchOverview.mockResolvedValue({ clients: [makeClient()] });
    mocks.fetchTiers.mockResolvedValue([]);
  });

  it.each(["0", "-3", "1.5"])("keeps Save off for %s, says why, and sends nothing", async (value) => {
    const save = await renderPage();

    fireEvent.change(screen.getByLabelText("Requests / Minute"), { target: { value } });

    expect(save.disabled).toBe(true);
    expect(screen.getByText(/A limit is a whole number of at least one/)).not.toBeNull();
    fireEvent.click(save);
    expect(mocks.updateProject).not.toHaveBeenCalled();
  });

  it("sends an empty field as the plan's number and a whole number as itself", async () => {
    mocks.updateProject.mockResolvedValue({ project: {} });
    const save = await renderPage();

    fireEvent.change(screen.getByLabelText("Requests / Minute"), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("Requests / Day"), { target: { value: "" } });
    fireEvent.click(save);

    await waitFor(() => {
      expect(mocks.updateProject.mock.calls[0]?.[1]).toEqual({ requestsPerMinute: 30, requestsPerDay: null });
    });
  });

  it("says why when the server refuses the save", async () => {
    mocks.updateProject.mockRejectedValue(
      new Error("requestsPerMinute must be a whole number of at least 1, or null."),
    );
    const save = await renderPage();

    fireEvent.change(screen.getByLabelText("Requests / Minute"), { target: { value: "30" } });
    fireEvent.click(save);

    expect((await screen.findByRole("alert")).textContent).toContain("requestsPerMinute must be a whole number");
  });

  it("refuses the same text the plan section refuses, because both read one parser", async () => {
    const save = await renderPage();
    fireEvent.change(screen.getByLabelText("Requests / Minute"), { target: { value: "1.5" } });

    renderWithQueries(
      <ProjectPlanSection
        project={
          {
            id: "project-1",
            requestsPerMinute: null,
            requestsPerDay: null,
            tierId: "tier_free",
            tierName: "Free",
            effectiveRequestsPerMinute: 60,
            effectiveRequestsPerDay: 10000,
          } as never
        }
        subscription={null}
      />,
    );
    fireEvent.change(screen.getByLabelText("Override, requests / minute"), { target: { value: "1.5" } });
    const sectionSave = screen.getAllByRole("button", { name: "Save" }).at(-1) as HTMLButtonElement;

    expect(save.disabled).toBe(true);
    expect(sectionSave.disabled).toBe(true);
  });
});
