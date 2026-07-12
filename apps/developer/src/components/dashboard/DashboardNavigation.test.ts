import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import { DashboardTab } from "../../lib/dashboardTabs";

describe("DashboardNavigation", () => {
  it("shares active and disabled state across desktop and mobile navigation", async () => {
    const { default: DashboardNavigation } = await import("./DashboardNavigation.astro");
    const container = await AstroContainer.create();
    const html = await container.renderToString(DashboardNavigation, {
      props: { active: DashboardTab.ApiKeys },
    });

    expect(html).toContain('data-dashboard-navigation="desktop"');
    expect(html).toContain('data-dashboard-navigation="mobile"');
    expect(html).toContain('data-dashboard-active-tab="true"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(2);

    for (const label of ["Overview", "API access", "API keys", "Usage"]) {
      expect(html.match(new RegExp(`>\\s*${label}\\s*<`, "g"))).toHaveLength(2);
    }
  });
});
