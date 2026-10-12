import { describe, expect, it } from "vitest";

import { AdminArea, AdminRole, canAccessArea, MINIMUM_ROLE_FOR_AREA } from "@/shared/constants/domain";

describe("canAccessArea", () => {
  it.each([
    [AdminRole.Owner, AdminArea.Administration, true],
    [AdminRole.Owner, AdminArea.Users, true],
    [AdminRole.Owner, AdminArea.DeveloperSettings, true],
    [AdminRole.Admin, AdminArea.Administration, true],
    [AdminRole.Admin, AdminArea.Users, false],
    [AdminRole.Admin, AdminArea.DeveloperSettings, false],
    [AdminRole.Moderator, AdminArea.Administration, false],
    [AdminRole.Moderator, AdminArea.Users, false],
    [AdminRole.Moderator, AdminArea.DeveloperSettings, false],
  ])("lets %s into %s: %s", (role, area, allowed) => {
    expect(canAccessArea(role, area)).toBe(allowed);
  });

  it("admits the minimum role of every area", () => {
    for (const [area, role] of Object.entries(MINIMUM_ROLE_FOR_AREA)) {
      expect(canAccessArea(role, area as AdminArea), area).toBe(true);
    }
  });

  it("admits nobody before a user is signed in", () => {
    for (const area of Object.values(AdminArea)) {
      expect(canAccessArea(undefined, area), area).toBe(false);
    }
  });
});
