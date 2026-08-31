import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetchUsage: vi.fn() }));

vi.mock("@/features/developer/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/developer/api")>()),
  fetchProjectUsage: mocks.fetchUsage,
}));

import { ProjectUsageSection } from "./ProjectUsageSection";

/** A usage report the tests override piece by piece. */
function makeUsage(overrides: Record<string, unknown> = {}) {
  return {
    windows: {
      minute: { from: "2026-08-31T11:59:00.000Z", to: "2026-08-31T12:00:00.000Z", total: 12 },
      day: { from: "2026-08-30T12:00:00.000Z", to: "2026-08-31T12:00:00.000Z", total: 1200 },
      ...((overrides.windows as Record<string, unknown>) ?? {}),
    },
    range: {
      from: "2026-08-30T12:00:00.000Z",
      to: "2026-08-31T12:00:00.000Z",
      bucket: "hour",
      total: 1200,
      byRegistration: [{ registrationId: "client-1", total: 1200 }],
      buckets: [
        { startedAt: "2026-08-30T13:00:00.000Z", total: 500 },
        { startedAt: "2026-08-30T14:00:00.000Z", total: 700 },
      ],
      ...((overrides.range as Record<string, unknown>) ?? {}),
    },
    quota: { requestsPerMinute: 60, requestsPerDay: 10000, ...((overrides.quota as Record<string, unknown>) ?? {}) },
  };
}

function renderSection() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProjectUsageSection projectId="project-1" />
    </QueryClientProvider>,
  );
}

describe("ProjectUsageSection", () => {
  beforeEach(() => {
    mocks.fetchUsage.mockReset();
  });

  it("reads each window against what the plan grants", async () => {
    mocks.fetchUsage.mockResolvedValue(makeUsage());
    renderSection();

    expect(await screen.findByText("12 / 60")).not.toBeNull();
    expect(screen.getByText("1,200 / 10,000")).not.toBeNull();
  });

  it("says nothing is granted rather than dividing by a limit that does not exist", async () => {
    mocks.fetchUsage.mockResolvedValue(makeUsage({ quota: { requestsPerMinute: null, requestsPerDay: null } }));
    renderSection();

    expect(await screen.findByText("12 · no limit granted")).not.toBeNull();
    expect(screen.getByText("1,200 · no limit granted")).not.toBeNull();
  });

  it("draws the series with one bar per step that saw traffic", async () => {
    mocks.fetchUsage.mockResolvedValue(makeUsage());
    const { container } = renderSection();

    await screen.findByText("12 / 60");
    expect(container.querySelectorAll("svg rect")).toHaveLength(2);
  });

  it("tells a project that has never been called apart from a failed read", async () => {
    mocks.fetchUsage.mockResolvedValue(
      makeUsage({
        windows: {
          minute: { from: "", to: "", total: 0 },
          day: { from: "", to: "", total: 0 },
        },
        range: { from: "", to: "", bucket: "hour", total: 0, byRegistration: [], buckets: [] },
      }),
    );
    const quiet = renderSection();
    expect(await screen.findByText(/has not been called yet/)).not.toBeNull();
    expect(screen.queryByText(/Could not load/)).toBeNull();
    quiet.unmount();

    mocks.fetchUsage.mockRejectedValue(new Error("nope"));
    renderSection();
    expect(await screen.findByText(/Could not load the usage figures/)).not.toBeNull();
    expect(screen.queryByText(/has not been called yet/)).toBeNull();
  });
});
