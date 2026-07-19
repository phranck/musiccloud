import { describe, expect, it, vi } from "vitest";
import { clearLegacyLocalePreference } from "@/lib/legacy-locale-cleanup";

describe("clearLegacyLocalePreference", () => {
  it("removes the retired storage value and expires its cookie", () => {
    const storage = { removeItem: vi.fn() };
    const cookieTarget = { cookie: "" };

    clearLegacyLocalePreference(storage, cookieTarget);

    expect(storage.removeItem).toHaveBeenCalledWith("mc:locale");
    expect(cookieTarget.cookie).toBe("mc:locale=; Max-Age=0; Path=/; SameSite=Lax");
  });

  it("keeps cleanup best-effort when browser storage is unavailable", () => {
    const storage = {
      removeItem: vi.fn(() => {
        throw new Error("blocked");
      }),
    };
    const cookieTarget = { cookie: "" };

    expect(() => clearLegacyLocalePreference(storage, cookieTarget)).not.toThrow();
    expect(cookieTarget.cookie).toContain("Max-Age=0");
  });
});
