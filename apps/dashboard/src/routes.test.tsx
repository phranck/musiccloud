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
});
