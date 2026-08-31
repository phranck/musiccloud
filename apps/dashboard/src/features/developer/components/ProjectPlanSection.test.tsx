import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchTiers: vi.fn(),
  setSubscription: vi.fn(),
  updateProject: vi.fn(),
}));

vi.mock("@/features/developer/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/developer/api")>()),
  fetchTiers: mocks.fetchTiers,
  updateDeveloperProjectSubscription: mocks.setSubscription,
  updateDeveloperProject: mocks.updateProject,
}));

import { ProjectPlanSection } from "./ProjectPlanSection";

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
  } as never;
}

/** The subscription that grants the project its plan. */
function makeSubscription(status: string) {
  return {
    id: "sub-1",
    projectId: "project-1",
    tierId: "tier_free",
    creemSubscriptionId: null,
    creemCustomerId: null,
    status,
    interval: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    createdAt: "2026-07-01T10:00:00.000Z",
    updatedAt: "2026-07-01T10:00:00.000Z",
  } as never;
}

function makeTier(overrides: Record<string, unknown> = {}) {
  return {
    id: "tier_free",
    name: "Free",
    requestsPerMinute: 60,
    requestsPerDay: 10000,
    attributionRequired: false,
    price: null,
    priceYearly: null,
    color: "#888888",
    icon: null,
    buttonLabel: null,
    description: "",
    enabled: true,
    disableReason: "",
    recommended: false,
    sortOrder: 1,
    features: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function renderSection(project = makeProject(), subscription: ReturnType<typeof makeSubscription> | null = null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProjectPlanSection project={project} subscription={subscription} />
    </QueryClientProvider>,
  );
}

describe("ProjectPlanSection", () => {
  beforeEach(() => {
    mocks.fetchTiers.mockReset();
    mocks.setSubscription.mockReset();
    mocks.updateProject.mockReset();
    mocks.fetchTiers.mockResolvedValue([makeTier()]);
  });

  it("explains the subscription state where it is chosen", async () => {
    renderSection(makeProject(), makeSubscription("past_due"));

    expect(await screen.findByText("Payment failed and is being retried.")).not.toBeNull();
  });

  it("sends the plan and the state together, because the route requires the tier on every call", async () => {
    mocks.setSubscription.mockResolvedValue({ subscription: makeSubscription("active") });
    renderSection(makeProject(), makeSubscription("active"));

    fireEvent.click(screen.getAllByRole("button", { name: "Save" })[0]);

    await waitFor(() => {
      expect(mocks.setSubscription.mock.calls[0]?.[0]).toBe("project-1");
      expect(mocks.setSubscription.mock.calls[0]?.[1]).toEqual({ tierId: "tier_free", status: "active" });
    });
  });

  it("shows the enforced figure beside each override", () => {
    renderSection(makeProject({ requestsPerMinute: 600, effectiveRequestsPerMinute: 600 }));

    expect(screen.getByText("Enforced now: 600")).not.toBeNull();
    expect(screen.getByText("Enforced now: 10000")).not.toBeNull();
  });

  it("warns that an override grants nothing whilst the project has no plan", () => {
    const withoutPlan = makeProject({
      tierId: null,
      tierName: null,
      tierRequestsPerMinute: null,
      tierRequestsPerDay: null,
      effectiveRequestsPerMinute: null,
      effectiveRequestsPerDay: null,
    });
    renderSection(withoutPlan);

    expect(screen.getByText(/An override adjusts a plan's number rather than standing in for one/)).not.toBeNull();
    expect(screen.getAllByText("Enforced now: No active plan")).toHaveLength(2);
  });

  it("refuses to send an override that is not a positive whole number", () => {
    renderSection(makeProject());

    fireEvent.change(screen.getByLabelText("Override, requests / minute"), { target: { value: "0" } });

    const save = screen.getAllByRole("button", { name: "Save" })[1] as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(mocks.updateProject).not.toHaveBeenCalled();
  });

  it("clears both overrides back to the plan's numbers", async () => {
    mocks.updateProject.mockResolvedValue({ project: makeProject() });
    renderSection(makeProject({ requestsPerMinute: 600, requestsPerDay: 90000 }));

    fireEvent.click(screen.getByRole("button", { name: "Clear overrides" }));

    await waitFor(() => {
      expect(mocks.updateProject.mock.calls[0]?.[1]).toEqual({ requestsPerMinute: null, requestsPerDay: null });
    });
  });

  it("offers nothing to clear when no override is set", () => {
    renderSection(makeProject());

    expect((screen.getByRole("button", { name: "Clear overrides" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
