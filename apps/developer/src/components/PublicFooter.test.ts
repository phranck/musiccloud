import { loadRenderers } from "astro:container";
import { getContainerRenderer } from "@astrojs/react";
import { NavigationSystemKey, NavigationTargetKind } from "@musiccloud/shared";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";

import PublicFooter from "./PublicFooter.astro";

describe("PublicFooter", () => {
  it("renders managed external and Search destinations with their canonical behavior", async () => {
    const container = await AstroContainer.create({ renderers: await loadRenderers([getContainerRenderer()]) });
    const html = await container.renderToString(PublicFooter, {
      props: {
        navigation: [
          {
            id: "status",
            label: "Service status",
            href: "https://status.musiccloud.io",
            target: "_blank",
            targetKind: NavigationTargetKind.Url,
            systemKey: null,
            behavior: "navigate",
          },
          {
            id: "search",
            label: "Search docs",
            href: "/docs/api?search=1",
            target: "_self",
            targetKind: NavigationTargetKind.System,
            systemKey: NavigationSystemKey.Search,
            behavior: "open-api-search",
          },
        ],
      },
    });

    expect(html).toContain('href="https://status.musiccloud.io" target="_blank" rel="noopener noreferrer"');
    expect(html).toContain("Service status");
    expect(html).toContain('data-public-search-command="true"');
    expect(html).toContain("Search docs");
    expect(html).not.toContain(">Terms<");
  });
});
