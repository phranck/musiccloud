import { describe, expect, it } from "vitest";

import { ADMIN_EVENT_TYPES, AdminEventType, isAdminEvent } from "../admin-events.js";

describe("isAdminEvent", () => {
  it.each(ADMIN_EVENT_TYPES)("accepts %s with its payload", (type) => {
    expect(isAdminEvent(type, { count: 1, ids: ["row-1"] })).toBe(true);
  });

  it.each([
    ["a name nothing sends", "track-added", { count: 1, ids: ["row-1"] }],
    ["a name without a payload", AdminEventType.TracksDeleted, null],
    ["a payload without ids", AdminEventType.TracksDeleted, { count: 1 }],
    ["ids that are not strings", AdminEventType.TracksDeleted, { count: 1, ids: [1] }],
  ])("rejects %s", (_case, type, data) => {
    expect(isAdminEvent(type, data)).toBe(false);
  });
});
