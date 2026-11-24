import { describe, expect, it } from "vitest";

import { AdminRole, isAdminRole } from "../admin-user.js";

describe("isAdminRole", () => {
  it.each(Object.values(AdminRole))("accepts %s", (role) => {
    expect(isAdminRole(role)).toBe(true);
  });

  it.each([
    ["a name no permission check knows", "superuser"],
    ["a role in another case", "Owner"],
    ["an empty string", ""],
    ["a number", 1],
    ["null", null],
    ["nothing", undefined],
  ])("rejects %s", (_case, value) => {
    expect(isAdminRole(value)).toBe(false);
  });
});
