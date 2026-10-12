import { describe, expect, it } from "vitest";
import {
  API_CLIENT_STATUSES,
  API_TOKEN_STATUSES,
  CLIENT_REGISTRATION_TYPES,
  DEVELOPER_ACCESS_STATUS_LABELS,
  DEVELOPER_ACCOUNT_STATUSES,
  DEVELOPER_PROJECT_STATUSES,
  developerAccessStatusLabel,
  formatApiTokenForDisplay,
} from "../developer-access.js";

const STATUS_LISTS = {
  account: DEVELOPER_ACCOUNT_STATUSES,
  project: DEVELOPER_PROJECT_STATUSES,
  application: API_CLIENT_STATUSES,
  token: API_TOKEN_STATUSES,
};

describe("developer access states", () => {
  it("names every state of every lifecycle", () => {
    for (const [lifecycle, statuses] of Object.entries(STATUS_LISTS)) {
      for (const status of statuses) {
        expect(DEVELOPER_ACCESS_STATUS_LABELS[status], `${lifecycle}: ${status}`).toBeTruthy();
      }
    }
  });

  it("repeats no value within a list", () => {
    for (const values of [...Object.values(STATUS_LISTS), CLIENT_REGISTRATION_TYPES]) {
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it("shows a state it does not know as it is", () => {
    expect(developerAccessStatusLabel("revoked")).toBe("Revoked");
    expect(developerAccessStatusLabel("archived")).toBe("archived");
    expect(developerAccessStatusLabel("toString")).toBe("toString");
  });

  it("masks a token to its prefix", () => {
    expect(formatApiTokenForDisplay("abc123def456")).toBe("mc_live_abc123def456_...");
  });
});
