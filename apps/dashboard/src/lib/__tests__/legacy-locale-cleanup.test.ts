import { describe, expect, it, vi } from "vitest";
import { clearLegacyDashboardLocalePreference } from "@/lib/legacy-locale-cleanup";

describe("clearLegacyDashboardLocalePreference", () => {
  it("removes the retired storage value", () => {
    const storage = { removeItem: vi.fn() };

    clearLegacyDashboardLocalePreference(storage);

    expect(storage.removeItem).toHaveBeenCalledWith("dashboard-locale");
  });

  it("keeps cleanup best-effort when browser storage is unavailable", () => {
    const storage = {
      removeItem: vi.fn(() => {
        throw new Error("blocked");
      }),
    };

    expect(() => clearLegacyDashboardLocalePreference(storage)).not.toThrow();
  });
});
