import type { ApiAccessAuditTrail, ApiAccessAuditTrailEntry } from "@musiccloud/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchProjectAudit: vi.fn(),
}));

vi.mock("@/features/developer/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/developer/api")>()),
  fetchProjectAudit: mocks.fetchProjectAudit,
}));

import { ProjectAuditSection } from "./ProjectAuditSection";

function entry(overrides: Partial<ApiAccessAuditTrailEntry>): ApiAccessAuditTrailEntry {
  return {
    id: "event-1",
    eventType: "project_updated",
    occurredAt: "2026-10-01T08:00:00.000Z",
    applicationId: null,
    apiKeyId: null,
    actor: { type: "admin", id: "admin-1", name: "olive" },
    details: {},
    ...overrides,
  };
}

function trail(entries: ApiAccessAuditTrailEntry[], truncated = false): ApiAccessAuditTrail {
  return {
    projectId: "project-1",
    from: "2026-09-12T12:00:00.000Z",
    to: "2026-10-12T12:00:00.000Z",
    limit: 50,
    truncated,
    entries,
  };
}

function renderSection() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProjectAuditSection projectId="project-1" />
    </QueryClientProvider>,
  );
}

describe("ProjectAuditSection", () => {
  beforeEach(() => {
    mocks.fetchProjectAudit.mockReset();
  });

  it("says who changed what, with the recorded details in words", async () => {
    mocks.fetchProjectAudit.mockResolvedValue(
      trail([
        entry({ id: "a", details: { requestsPerDay: 5000, requestsPerMinute: null, status: "suspended" } }),
        entry({
          id: "b",
          eventType: "token_rotated",
          actor: { type: "developer", id: "dev-1", name: "jane@example.com" },
          details: { cancelAtPeriodEnd: true },
        }),
        entry({ id: "c", eventType: "something_new", actor: null }),
      ]),
    );
    renderSection();

    const rows = (await screen.findAllByRole("row")).slice(1);
    expect(mocks.fetchProjectAudit).toHaveBeenCalledWith("project-1");
    expect(within(rows[0]!).getByText("Project changed")).not.toBeNull();
    expect(within(rows[0]!).getByText("olive")).not.toBeNull();
    expect(within(rows[0]!).getByText("Admin")).not.toBeNull();
    expect(rows[0]?.textContent).toContain("Requests / day: 5,000");
    expect(rows[0]?.textContent).toContain("Requests / minute: cleared");
    expect(rows[0]?.textContent).toContain("Status: suspended");
    expect(within(rows[1]!).getByText("API-Key rotated")).not.toBeNull();
    expect(within(rows[1]!).getByText("Developer")).not.toBeNull();
    expect(rows[1]?.textContent).toContain("Ends with the period: yes");
    expect(within(rows[2]!).getByText("something_new")).not.toBeNull();
    expect(within(rows[2]!).getByText("Removed account")).not.toBeNull();
  });

  it("says when nothing was changed", async () => {
    mocks.fetchProjectAudit.mockResolvedValue(trail([]));
    renderSection();

    expect(await screen.findByText("Nothing on this project was changed in the last thirty days.")).not.toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("says how many it shows when the range holds more", async () => {
    mocks.fetchProjectAudit.mockResolvedValue(trail([entry({ id: "a" }), entry({ id: "b" })], true));
    renderSection();

    expect(await screen.findByText("The latest 2 changes of the last thirty days.")).not.toBeNull();
  });

  it("names the failure with its error id", async () => {
    mocks.fetchProjectAudit.mockRejectedValue(
      Object.assign(new Error("The database is not reachable."), { status: 503, errorId: "err-7" }),
    );
    renderSection();

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Could not load the audit trail. The database is not reachable. Error ID: err-7",
    );
  });
});
