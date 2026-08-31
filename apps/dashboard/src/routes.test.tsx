import { matchRoutes } from "react-router";
import { describe, expect, it } from "vitest";
import { routes } from "@/routes";

describe("Dashboard route retirement", () => {
  it("has no dedicated Dynamic Forms route", () => {
    const matches = matchRoutes(routes, "/forms") ?? [];

    expect(matches.some((match) => match.route.path === "forms")).toBe(false);
  });

  it("has no dedicated Analytics route", () => {
    const matches = matchRoutes(routes, "/analytics") ?? [];

    expect(matches.some((match) => match.route.path === "analytics")).toBe(false);
  });

  it("has no access-request review routes", () => {
    for (const path of ["/developer/requests", "/developer/requests/req-1"]) {
      const matches = matchRoutes(routes, path) ?? [];
      expect(
        matches.some((match) => match.route.path?.startsWith("developer/requests")),
        path,
      ).toBe(false);
    }
  });
});

describe("Developer project routes", () => {
  it("resolves a project by id", () => {
    const matches = matchRoutes(routes, "/developer/projects/project-1") ?? [];

    expect(matches.some((match) => match.route.path === "developer/projects/:id")).toBe(true);
  });
});
