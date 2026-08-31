import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchCreemSellingMode: vi.fn(),
  updateCreemSellingMode: vi.fn(),
}));

vi.mock("@/features/developer/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/developer/api")>()),
  fetchCreemSellingMode: mocks.fetchCreemSellingMode,
  updateCreemSellingMode: mocks.updateCreemSellingMode,
}));

import { dashboardCopy } from "@/copy/dashboard";
import { CreemSellingModeSection } from "./CreemSellingModeSection";

const dm = dashboardCopy.developer;

/** A backend holding both keys, with every plan set up in both environments. */
function readyForBoth() {
  return {
    sellingMode: "test",
    configuredModes: ["test", "live"],
    readiness: [
      { mode: "test", hasKey: true, missingProducts: [] },
      { mode: "live", hasKey: true, missingProducts: [] },
    ],
  };
}

function renderSection() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CreemSellingModeSection />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
});

describe("CreemSellingModeSection", () => {
  it("says which environment the shop sells from", async () => {
    mocks.fetchCreemSellingMode.mockResolvedValue(readyForBoth());

    renderSection();

    expect(await screen.findByText(dm.creemEnvironmentTest, { selector: "strong" })).not.toBeNull();
    expect(screen.getByText(dm.creemSellingTestNote)).not.toBeNull();
  });

  it("offers no switch whilst no Creem key exists for live, and says why", async () => {
    mocks.fetchCreemSellingMode.mockResolvedValue({
      sellingMode: "test",
      configuredModes: ["test"],
      readiness: [
        { mode: "test", hasKey: true, missingProducts: [] },
        { mode: "live", hasKey: false, missingProducts: [] },
      ],
    });

    renderSection();

    expect(await screen.findByText(dm.creemSellingNoKey.replaceAll("{mode}", dm.creemEnvironmentLive))).not.toBeNull();
    expect(mocks.updateCreemSellingMode).not.toHaveBeenCalled();
  });

  it("names the plans that have no product in production yet rather than only refusing", async () => {
    mocks.fetchCreemSellingMode.mockResolvedValue({
      sellingMode: "test",
      configuredModes: ["test", "live"],
      readiness: [
        { mode: "test", hasKey: true, missingProducts: [] },
        { mode: "live", hasKey: true, missingProducts: ["Club (year)", "Pro (month)"] },
      ],
    });

    renderSection();

    const expected = dm.creemSellingMissingProducts
      .replaceAll("{mode}", dm.creemEnvironmentLive)
      .replaceAll("{plans}", "Club (year), Pro (month)");
    expect(await screen.findByText(expected)).not.toBeNull();
  });

  it("asks a second time before the shop starts charging real cards", async () => {
    mocks.fetchCreemSellingMode.mockResolvedValue(readyForBoth());

    renderSection();
    await userEvent.click(await screen.findByText(dm.creemEnvironmentLive));

    expect(screen.getByText(dm.creemSellingLiveWarning)).not.toBeNull();
    expect(mocks.updateCreemSellingMode).not.toHaveBeenCalled();

    await userEvent.click(screen.getByText(dm.creemSellingConfirm));

    await waitFor(() => expect(mocks.updateCreemSellingMode.mock.calls[0]?.[0]).toBe("live"));
  });

  it("moves back to the sandbox without asking, because that charges nobody", async () => {
    mocks.fetchCreemSellingMode.mockResolvedValue({ ...readyForBoth(), sellingMode: "live" });

    renderSection();
    // Wait for the answer before clicking. Until it arrives the card reads as
    // selling from Test, and pressing Test would be asking for what is already
    // the case.
    await screen.findByText(dm.creemEnvironmentLive, { selector: "strong" });
    await userEvent.click(screen.getByText(dm.creemEnvironmentTest));

    await waitFor(() => expect(mocks.updateCreemSellingMode.mock.calls[0]?.[0]).toBe("test"));
    expect(screen.queryByText(dm.creemSellingLiveWarning)).toBeNull();
  });
});
