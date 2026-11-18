import { BANK_CONNECTION_CALLBACK_DASHBOARD_PATH, BANK_CONNECTION_DASHBOARD_PATH } from "@musiccloud/shared";
import { isValidElement } from "react";
import { matchRoutes } from "react-router";
import { describe, expect, it } from "vitest";
import { RequireArea } from "@/features/auth/RequireArea";
import { BANK_CONNECTION_CALLBACK_ROUTE, BANK_CONNECTION_ROUTE } from "@/features/sponsoring/bankConnectionPaths";
import { routes } from "@/routes";
import { AdminArea } from "@/shared/constants/domain";

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

describe("Bank connection routes", () => {
  it.each([
    [BANK_CONNECTION_DASHBOARD_PATH, BANK_CONNECTION_ROUTE],
    // The backend builds the address the bank returns to from the same constant,
    // so the return lands on this route rather than in the catch-all.
    [BANK_CONNECTION_CALLBACK_DASHBOARD_PATH, BANK_CONNECTION_CALLBACK_ROUTE],
  ])("resolves %s behind the owner's guard", (pathname, routePath) => {
    const matches = matchRoutes(routes, pathname) ?? [];

    expect(matches.at(-1)?.route.path).toBe(routePath);
    expect(
      matches.some(
        ({ route }) =>
          isValidElement<{ area: AdminArea }>(route.element) &&
          route.element.type === RequireArea &&
          route.element.props.area === AdminArea.BankConnection,
      ),
    ).toBe(true);
  });
});

describe("Developer project routes", () => {
  it("resolves a project by id", () => {
    const matches = matchRoutes(routes, "/developer/projects/project-1") ?? [];

    expect(matches.some((match) => match.route.path === "developer/projects/:id")).toBe(true);
  });
});
