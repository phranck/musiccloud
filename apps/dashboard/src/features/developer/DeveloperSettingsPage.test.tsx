import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchAvailability: vi.fn(),
  updateAvailability: vi.fn(),
}));

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  fetchDeveloperPortalAvailability: mocks.fetchAvailability,
  updateDeveloperPortalAvailability: mocks.updateAvailability,
}));

vi.mock("@/components/ui/PageHeader", () => ({ PageHeader: () => null }));

import { dashboardCopy } from "@/copy/dashboard";
import { DeveloperSettingsPage } from "./DeveloperSettingsPage";

const dm = dashboardCopy.developer;

const openedByOlive = {
  public: true,
  maintenance: false,
  occurredAt: "2026-10-11T20:00:00.000Z",
  actor: { username: "olive", firstName: "Olive", lastName: "Owner" },
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DeveloperSettingsPage />
    </QueryClientProvider>,
  );
}

async function findSwitches() {
  const publicSwitch = (await screen.findByRole("switch", { name: dm.portalPublicLabel })) as HTMLButtonElement;
  const maintenanceSwitch = (await screen.findByRole("switch", { name: dm.maintenanceLabel })) as HTMLButtonElement;
  await waitFor(() => expect(publicSwitch.disabled).toBe(false));
  return { publicSwitch, maintenanceSwitch };
}

describe("DeveloperSettingsPage", () => {
  beforeEach(() => {
    mocks.fetchAvailability.mockReset();
    mocks.updateAvailability.mockReset();
    mocks.fetchAvailability.mockResolvedValue({ public: false, maintenance: true, lastChange: null });
  });

  it("loads the stored portal state", async () => {
    renderPage();

    const { publicSwitch, maintenanceSwitch } = await findSwitches();
    expect(publicSwitch.getAttribute("aria-checked")).toBe("false");
    expect(maintenanceSwitch.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText(/API reference remains available/i)).not.toBeNull();
  });

  it("asks before opening the portal and sends nothing until the owner confirms", async () => {
    mocks.updateAvailability.mockResolvedValue({ public: true, maintenance: true, lastChange: openedByOlive });
    renderPage();
    const { publicSwitch } = await findSwitches();

    fireEvent.click(publicSwitch);

    expect(screen.getByText(dm.portalOpenWarning)).not.toBeNull();
    expect(mocks.updateAvailability).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: dm.portalOpenConfirm }));

    await waitFor(() => {
      expect(mocks.updateAvailability.mock.calls[0]?.[0]).toEqual({ public: true, maintenance: true });
    });
    expect(screen.queryByText(dm.portalOpenWarning)).toBeNull();
  });

  it("leaves the portal closed when the owner cancels", async () => {
    renderPage();
    const { publicSwitch } = await findSwitches();

    fireEvent.click(publicSwitch);
    fireEvent.click(screen.getByRole("button", { name: dashboardCopy.common.cancel }));

    expect(screen.queryByText(dm.portalOpenWarning)).toBeNull();
    expect(publicSwitch.getAttribute("aria-checked")).toBe("false");
    expect(mocks.updateAvailability).not.toHaveBeenCalled();
  });

  it("closes the portal on the first press", async () => {
    mocks.fetchAvailability.mockResolvedValue({ public: true, maintenance: false, lastChange: openedByOlive });
    mocks.updateAvailability.mockResolvedValue({ public: false, maintenance: false, lastChange: null });
    renderPage();
    const { publicSwitch } = await findSwitches();

    fireEvent.click(publicSwitch);

    await waitFor(() => {
      expect(mocks.updateAvailability.mock.calls[0]?.[0]).toEqual({ public: false, maintenance: false });
    });
    expect(screen.queryByText(dm.portalOpenWarning)).toBeNull();
  });

  it("says since when the portal is in its state and who set it", async () => {
    mocks.fetchAvailability.mockResolvedValue({ public: true, maintenance: false, lastChange: openedByOlive });
    renderPage();

    expect(await screen.findByText(/^Public since .+, set by Olive Owner\.$/)).not.toBeNull();
  });

  it("disables both switches while an availability update is pending", async () => {
    let resolveUpdate: ((value: unknown) => void) | undefined;
    mocks.updateAvailability.mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }),
    );
    renderPage();
    const { publicSwitch, maintenanceSwitch } = await findSwitches();

    fireEvent.click(maintenanceSwitch);

    await waitFor(() => {
      expect(publicSwitch.disabled).toBe(true);
      expect(maintenanceSwitch.disabled).toBe(true);
    });

    resolveUpdate?.({ public: false, maintenance: false, lastChange: null });
  });
});
