import { describe, expect, it } from "vitest";
import { resolveSelectedProjectId } from "./selectedProject";

describe("resolveSelectedProjectId", () => {
  it("keeps the remembered project when the account still holds it", () => {
    expect(resolveSelectedProjectId(["p1", "p2"], "p2")).toBe("p2");
  });

  it("falls back to the first project when the remembered one is gone", () => {
    // A deleted project, or a different account's, must not leave the screen
    // pointing at something that cannot be loaded.
    expect(resolveSelectedProjectId(["p1", "p2"], "p-deleted")).toBe("p1");
  });

  it("falls back to the first project when nothing is remembered", () => {
    expect(resolveSelectedProjectId(["p1", "p2"], null)).toBe("p1");
  });

  it("resolves to nothing when the account holds no project", () => {
    expect(resolveSelectedProjectId([], "p1")).toBeNull();
    expect(resolveSelectedProjectId([], null)).toBeNull();
  });
});
