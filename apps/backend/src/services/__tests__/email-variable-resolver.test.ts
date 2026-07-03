/**
 * @file Service tests for the email variable resolver (MC-081): system-scope
 * values from server env, recipient-scope values from the addressee. Pure
 * functions — only `vi.stubEnv` is needed, no mocks.
 */

import { EmailRecipientKind } from "@musiccloud/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { applySampleValues, resolveRecipientVariables, resolveSystemVariables } from "../email-variable-resolver.js";

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("PUBLIC_URL", "https://musiccloud.example");
  vi.stubEnv("DASHBOARD_URL", "https://dashboard.musiccloud.example");
  vi.stubEnv("DEVELOPER_URL", "https://developer.musiccloud.example");
});

describe("resolveSystemVariables", () => {
  it("maps the URL env vars onto the system-scope variable names", () => {
    expect(resolveSystemVariables()).toEqual({
      websiteUrl: "https://musiccloud.example",
      dashboardUrl: "https://dashboard.musiccloud.example",
      developerUrl: "https://developer.musiccloud.example",
      loginUrl: "https://dashboard.musiccloud.example/login",
    });
  });

  it("throws when a required env var is missing", () => {
    vi.stubEnv("DEVELOPER_URL", "");
    expect(() => resolveSystemVariables()).toThrow(/DEVELOPER_URL/);
  });
});

describe("resolveRecipientVariables", () => {
  it("resolves username, email, and role for an admin user", () => {
    expect(
      resolveRecipientVariables({
        kind: EmailRecipientKind.AdminUser,
        username: "alice",
        email: "alice@example.com",
        role: "admin",
      }),
    ).toEqual({ username: "alice", email: "alice@example.com", role: "admin" });
  });

  it("resolves a developer account's display name as username (no role)", () => {
    expect(
      resolveRecipientVariables({
        kind: EmailRecipientKind.DeveloperAccount,
        email: "dev@example.com",
        displayName: "Dev Jane",
      }),
    ).toEqual({ username: "Dev Jane", email: "dev@example.com" });
  });

  it("falls back to the email local part when a developer account has no display name", () => {
    expect(
      resolveRecipientVariables({
        kind: EmailRecipientKind.DeveloperAccount,
        email: "dev.jane@example.com",
        displayName: null,
      }),
    ).toEqual({ username: "dev.jane", email: "dev.jane@example.com" });
  });
});

describe("applySampleValues", () => {
  it("fills missing catalog variables with their sample values", () => {
    const filled = applySampleValues({ username: "alice" }, ["username", "inviteUrl"]);
    expect(filled.username).toBe("alice");
    expect(filled.inviteUrl).toBe("https://dashboard.musiccloud.io/invite/sample-token");
  });

  it("never overwrites an already-resolved value", () => {
    const filled = applySampleValues({ inviteUrl: "https://real/invite" }, ["inviteUrl"]);
    expect(filled.inviteUrl).toBe("https://real/invite");
  });

  it("skips names the catalog does not know", () => {
    const filled = applySampleValues({}, ["totallyUnknown"]);
    expect(filled).not.toHaveProperty("totallyUnknown");
  });
});
