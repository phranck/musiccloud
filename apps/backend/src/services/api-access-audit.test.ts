import { describe, expect, it } from "vitest";

import type { ApiAccessAuditEntry } from "../db/api-access-repository.js";
import {
  AUDIT_DEFAULT_LIMIT,
  AUDIT_DEFAULT_RANGE_MS,
  AUDIT_MAX_RANGE_MS,
  isAuditWindowRejection,
  resolveAuditWindow,
  toAuditTrailResponse,
} from "./api-access-audit.js";

const NOW = Date.parse("2026-10-12T12:00:00.000Z");

function entry(overrides: Partial<ApiAccessAuditEntry>): ApiAccessAuditEntry {
  return {
    id: "event-1",
    projectId: "project-1",
    clientId: null,
    tokenId: null,
    eventType: "project_updated",
    actorAdminId: "admin-1",
    actorDeveloperAccountId: null,
    occurredAt: Date.parse("2026-10-01T08:00:00.000Z"),
    eventData: {},
    actorAdminUsername: "olive",
    actorDeveloperEmail: null,
    ...overrides,
  };
}

describe("resolveAuditWindow", () => {
  it("reads the last thirty days with the default ceiling when nothing is named", () => {
    expect(resolveAuditWindow({}, NOW)).toEqual({
      from: NOW - AUDIT_DEFAULT_RANGE_MS,
      to: NOW,
      limit: AUDIT_DEFAULT_LIMIT,
    });
  });

  it("takes a named range and ceiling", () => {
    expect(resolveAuditWindow({ from: "2026-09-01T00:00:00Z", to: "2026-10-01T00:00:00Z", limit: 10 }, NOW)).toEqual({
      from: Date.parse("2026-09-01T00:00:00Z"),
      to: Date.parse("2026-10-01T00:00:00Z"),
      limit: 10,
    });
  });

  it("allows a range exactly as wide as the trail is kept and refuses a wider one", () => {
    expect(
      isAuditWindowRejection(resolveAuditWindow({ from: new Date(NOW - AUDIT_MAX_RANGE_MS).toISOString() }, NOW)),
    ).toBe(false);
    expect(resolveAuditWindow({ from: new Date(NOW - AUDIT_MAX_RANGE_MS - 1).toISOString() }, NOW)).toEqual({
      message: "The range may cover at most 365 days.",
    });
  });

  it.each([
    [{ from: "yesterday" }, "from must be an ISO date."],
    [{ to: "soon" }, "to must be an ISO date."],
    [{ from: "2026-10-02T00:00:00Z", to: "2026-10-01T00:00:00Z" }, "from must be before to."],
  ])("refuses %o", (query, message) => {
    expect(resolveAuditWindow(query, NOW)).toEqual({ message });
  });
});

describe("toAuditTrailResponse", () => {
  const window = { from: NOW - AUDIT_DEFAULT_RANGE_MS, to: NOW, limit: 2 };

  it("names the acting admin or developer, and nobody once the account is gone", () => {
    const { entries } = toAuditTrailResponse("project-1", window, [
      entry({ id: "a" }),
      entry({
        id: "b",
        actorAdminId: null,
        actorAdminUsername: null,
        actorDeveloperAccountId: "dev-1",
        actorDeveloperEmail: "jane@example.com",
      }),
    ]);

    expect(entries.map((item) => item.actor)).toEqual([
      { type: "admin", id: "admin-1", name: "olive" },
      { type: "developer", id: "dev-1", name: "jane@example.com" },
    ]);
    expect(
      toAuditTrailResponse("project-1", window, [entry({ actorAdminId: null, actorAdminUsername: null })]).entries[0]
        ?.actor,
    ).toBeNull();
  });

  it("passes only the allowed details, whatever a writer stored", () => {
    const { entries } = toAuditTrailResponse("project-1", window, [
      entry({
        eventData: { requestsPerMinute: 500, status: "suspended", rawToken: "mc_live_secret", tokenHash: "deadbeef" },
      }),
    ]);

    expect(entries[0]?.details).toEqual({ requestsPerMinute: 500, status: "suspended" });
    expect(JSON.stringify(entries)).not.toMatch(/mc_live_secret|deadbeef/);
  });

  it("says when the range holds more than the ceiling let through", () => {
    const full = toAuditTrailResponse("project-1", window, [entry({ id: "a" }), entry({ id: "b" })]);
    const truncated = toAuditTrailResponse("project-1", window, [
      entry({ id: "a" }),
      entry({ id: "b" }),
      entry({ id: "c" }),
    ]);

    expect(full.truncated).toBe(false);
    expect(truncated.truncated).toBe(true);
    expect(truncated.entries.map((item) => item.id)).toEqual(["a", "b"]);
  });
});
