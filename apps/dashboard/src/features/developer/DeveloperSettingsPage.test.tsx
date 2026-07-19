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

import { DeveloperSettingsPage } from "./DeveloperSettingsPage";

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DeveloperSettingsPage />
    </QueryClientProvider>,
  );
}

describe("DeveloperSettingsPage", () => {
  beforeEach(() => {
    mocks.fetchAvailability.mockReset();
    mocks.updateAvailability.mockReset();
    mocks.fetchAvailability.mockResolvedValue({ public: false, maintenance: true });
  });

  it("loads the persisted portal state and updates one toggle at a time", async () => {
    mocks.updateAvailability.mockResolvedValue({ public: true, maintenance: true });
    renderPage();

    const publicSwitch = (await screen.findByRole("switch", { name: "Developer Portal" })) as HTMLButtonElement;
    const maintenanceSwitch = (await screen.findByRole("switch", { name: "Maintenance" })) as HTMLButtonElement;
    await waitFor(() => expect(publicSwitch.disabled).toBe(false));
    expect(publicSwitch.getAttribute("aria-checked")).toBe("false");
    expect(maintenanceSwitch.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Maintenance")).not.toBeNull();
    expect(screen.getByText(/API reference remains available/i)).not.toBeNull();

    fireEvent.click(publicSwitch);

    await waitFor(() => {
      expect(mocks.updateAvailability.mock.calls[0]?.[0]).toEqual({ public: true, maintenance: true });
    });
  });

  it("disables both switches while an availability update is pending", async () => {
    let resolveUpdate: ((value: { public: boolean; maintenance: boolean }) => void) | undefined;
    mocks.updateAvailability.mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }),
    );
    renderPage();

    const publicSwitch = (await screen.findByRole("switch", { name: "Developer Portal" })) as HTMLButtonElement;
    const maintenanceSwitch = (await screen.findByRole("switch", { name: "Maintenance" })) as HTMLButtonElement;
    await waitFor(() => expect(maintenanceSwitch.disabled).toBe(false));

    fireEvent.click(maintenanceSwitch);

    await waitFor(() => {
      expect(publicSwitch.disabled).toBe(true);
      expect(maintenanceSwitch.disabled).toBe(true);
    });

    resolveUpdate?.({ public: false, maintenance: false });
  });
});
