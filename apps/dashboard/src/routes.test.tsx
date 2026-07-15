import { matchRoutes } from "react-router";
import { describe, expect, it } from "vitest";
import { routes } from "@/routes";

describe("Dashboard route retirement", () => {
  it("has no dedicated Dynamic Forms route", () => {
    const matches = matchRoutes(routes, "/forms") ?? [];

    expect(matches.some((match) => match.route.path === "forms")).toBe(false);
  });
});
