import { loadRenderers } from "astro:container";
import { getContainerRenderer } from "@astrojs/react";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import { DashboardTab } from "../../lib/dashboardTabs";

/** The destinations that are one row in each render mode, so twice in total. */
const PLAIN_DESTINATIONS = ["API access", "Usage", "Profile"];

describe("DashboardNavigation", () => {
  it("shares active and disabled state across desktop and mobile navigation", async () => {
    const { default: DashboardNavigation } = await import("./DashboardNavigation.astro");
    const container = await AstroContainer.create({ renderers: await loadRenderers([getContainerRenderer()]) });
    const html = await container.renderToString(DashboardNavigation, {
      props: { active: DashboardTab.Projects },
    });

    expect(html).toContain('data-dashboard-navigation="desktop"');
    expect(html).toContain('data-dashboard-navigation="mobile"');
    expect(html).toContain('data-dashboard-active-tab="true"');

    for (const label of PLAIN_DESTINATIONS) {
      expect(html.match(new RegExp(`>\\s*${label}\\s*<`, "g"))).toHaveLength(2);
    }
  });

  it("opens Projects as a section whose first entry is the list", async () => {
    const { default: DashboardNavigation } = await import("./DashboardNavigation.astro");
    const container = await AstroContainer.create({ renderers: await loadRenderers([getContainerRenderer()]) });
    const html = await container.renderToString(DashboardNavigation, {
      props: { active: DashboardTab.Projects },
    });

    // Projects is a disclosure rather than a row, and it stands open on its own
    // pages so the entry a reader came for is visible without a click.
    expect(html).toMatch(/<details[^>]*\bopen\b/);
    expect(html).toMatch(/<details[^>]*class="[^"]*sidebar__section[^"]*"/);
    expect(html).toContain('href="/dashboard/projects"');
    // Two Overviews on the desktop rail (the top destination and the section's
    // first entry) plus the one mobile tab.
    expect(html.match(/>\s*Overview\s*</g)).toHaveLength(3);
    // The list entry is the current page whilst no single project is open.
    expect(html).toMatch(/href="\/dashboard\/projects"[^>]*aria-current="page"[^>]*api-reference-nav__link--counted/);
  });
});
