/**
 * @file Tests for the operator-set bounds on self-service creation.
 *
 * The one thing that must never happen is a ceiling that disappears: an absent
 * row, a value somebody typed by hand, or a stored value outside the permitted
 * range all have to resolve to a real limit rather than to none.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./site-settings.js", () => ({
  getSetting: vi.fn(async (): Promise<string | null> => null),
  setSetting: vi.fn(async () => undefined),
}));

import {
  DEFAULT_MAX_PROJECTS_PER_ACCOUNT,
  getMaxProjectsPerAccount,
  isAssignableMaxProjects,
  MAX_MAX_PROJECTS_PER_ACCOUNT,
  MIN_MAX_PROJECTS_PER_ACCOUNT,
  setMaxProjectsPerAccount,
} from "./developer-limits.js";
import { getSetting, setSetting } from "./site-settings.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the project ceiling", () => {
  it("starts at three, which is more than an evaluation needs and less than a loop wants", () => {
    expect(DEFAULT_MAX_PROJECTS_PER_ACCOUNT).toBe(3);
  });

  it("reads the value the operator stored", async () => {
    vi.mocked(getSetting).mockResolvedValue("25");

    await expect(getMaxProjectsPerAccount()).resolves.toBe(25);
  });

  it("falls back to the default when nothing is stored", async () => {
    vi.mocked(getSetting).mockResolvedValue(null);

    await expect(getMaxProjectsPerAccount()).resolves.toBe(DEFAULT_MAX_PROJECTS_PER_ACCOUNT);
  });

  it("falls back to the default rather than to no limit on an unusable value", async () => {
    for (const stored of ["", "none", "0", "-4", "2.5", String(MAX_MAX_PROJECTS_PER_ACCOUNT + 1)]) {
      vi.mocked(getSetting).mockResolvedValue(stored);
      await expect(getMaxProjectsPerAccount(), stored).resolves.toBe(DEFAULT_MAX_PROJECTS_PER_ACCOUNT);
    }
  });

  it("accepts only whole numbers inside the permitted range", () => {
    expect(isAssignableMaxProjects(MIN_MAX_PROJECTS_PER_ACCOUNT)).toBe(true);
    expect(isAssignableMaxProjects(MAX_MAX_PROJECTS_PER_ACCOUNT)).toBe(true);
    expect(isAssignableMaxProjects(MIN_MAX_PROJECTS_PER_ACCOUNT - 1)).toBe(false);
    expect(isAssignableMaxProjects(MAX_MAX_PROJECTS_PER_ACCOUNT + 1)).toBe(false);
    expect(isAssignableMaxProjects(2.5)).toBe(false);
    expect(isAssignableMaxProjects(Number.NaN)).toBe(false);
  });

  it("stores the ceiling as a string, because every setting is one", async () => {
    await setMaxProjectsPerAccount(12);

    expect(vi.mocked(setSetting)).toHaveBeenCalledWith("developer_max_projects_per_account", "12");
  });
});
