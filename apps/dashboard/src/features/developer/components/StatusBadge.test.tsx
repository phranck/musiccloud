/**
 * @file Covers the shared `StatusBadge` and its tone map from
 * `@musiccloud/dashboard-ui`.
 *
 * The package carries no test runner, so it is exercised here from one of its
 * two consumers, the way the usage chart is.
 */
import { StatusBadge, StatusTone, statusTone } from "@musiccloud/dashboard-ui";
import {
  API_CLIENT_STATUSES,
  API_TOKEN_STATUSES,
  DEVELOPER_ACCOUNT_STATUSES,
  DEVELOPER_PROJECT_STATUSES,
} from "@musiccloud/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("statusTone", () => {
  it("gives every state of every lifecycle a tone of its meaning", () => {
    const expected: Record<string, string> = {
      active: StatusTone.Success,
      suspended: StatusTone.Warning,
      revoked: StatusTone.Danger,
      deleted: StatusTone.Danger,
      rotated: StatusTone.Neutral,
    };
    for (const status of [
      ...DEVELOPER_ACCOUNT_STATUSES,
      ...DEVELOPER_PROJECT_STATUSES,
      ...API_CLIENT_STATUSES,
      ...API_TOKEN_STATUSES,
    ]) {
      expect(statusTone(status), status).toBe(expected[status]);
    }
  });

  it("shows a state it does not know in the neutral tone", () => {
    expect(statusTone("archived")).toBe(StatusTone.Neutral);
    expect(statusTone("constructor")).toBe(StatusTone.Neutral);
  });
});

describe("StatusBadge", () => {
  it("writes the label and the tone's class, and no color", () => {
    render(<StatusBadge status="suspended" />);

    const badge = screen.getByText("Suspended");
    expect(badge.className).toBe("mc-status-badge mc-status-badge--warning");
    expect(badge.getAttribute("style")).toBeNull();
  });

  it("shows a state it does not know by its own value", () => {
    render(<StatusBadge status="archived" />);

    expect(screen.getByText("archived").className).toBe("mc-status-badge mc-status-badge--neutral");
  });
});
