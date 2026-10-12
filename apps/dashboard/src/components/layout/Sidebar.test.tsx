import { render } from "@testing-library/react";
import { isValidElement } from "react";
import { MemoryRouter, matchRoutes } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { Sidebar } from "@/components/layout/Sidebar";
import { RequireArea } from "@/features/auth/RequireArea";
import { routes } from "@/routes";
import { type AdminArea, AdminRole, canAccessArea } from "@/shared/constants/domain";

vi.mock("@/features/content/hooks/useAdminContent", () => ({
  useContentPages: () => ({ data: [] }),
  useCreateContentPage: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/features/templates/hooks/useEmailTemplates", () => ({
  useEmailTemplates: () => ({ data: [] }),
  useCreateEmailTemplate: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/features/overview/hooks/useAdminStats", () => ({
  useAdminStats: () => ({ data: undefined }),
}));

vi.mock("@/features/content/state/PagesEditorContext", () => ({
  usePagesEditor: () => ({
    sidebar: { current: [] },
    segments: { byOwner: {} },
    meta: { pages: {} },
    content: { pages: {} },
    dispatch: { segments: vi.fn() },
  }),
}));

/** The areas whose guards stand between the root and a path, from `routes.tsx`. */
function guardingAreas(pathname: string): AdminArea[] {
  const matches = matchRoutes(routes, pathname) ?? [];
  return matches.flatMap(({ route }) =>
    isValidElement<{ area: AdminArea }>(route.element) && route.element.type === RequireArea
      ? [route.element.props.area]
      : [],
  );
}

describe("Sidebar", () => {
  it.each([
    AdminRole.Owner,
    AdminRole.Admin,
    AdminRole.Moderator,
  ])("offers %s only links whose route guard admits it", (role) => {
    const { container } = render(
      <MemoryRouter>
        <Sidebar role={role} onLogout={() => undefined} bare />
      </MemoryRouter>,
    );
    const links = [...container.querySelectorAll("a[href]")].map((link) => link.getAttribute("href") ?? "");

    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      for (const area of guardingAreas(link)) {
        expect(canAccessArea(role, area), `${link} needs ${area}`).toBe(true);
      }
    }
  });

  it("shows the Users link to the owner", () => {
    const { container } = render(
      <MemoryRouter>
        <Sidebar role={AdminRole.Owner} onLogout={() => undefined} bare />
      </MemoryRouter>,
    );

    expect(container.querySelector('a[href="/users"]')).not.toBeNull();
  });
});
