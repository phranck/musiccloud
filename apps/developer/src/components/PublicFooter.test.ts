import { loadRenderers } from "astro:container";
import { getContainerRenderer } from "@astrojs/react";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";

import PublicFooter from "./PublicFooter.astro";

describe("PublicFooter", () => {
  it("says who the portal belongs to and who built it", async () => {
    const container = await AstroContainer.create({ renderers: await loadRenderers([getContainerRenderer()]) });
    const html = await container.renderToString(PublicFooter);

    expect(html).toContain(`© ${new Date().getFullYear()} musiccloud`);
    expect(html).toContain('href="https://layered.work" target="_blank" rel="noopener noreferrer"');
    expect(html).toContain("LAYERED");
  });

  it("carries the legal pages between the two", async () => {
    const container = await AstroContainer.create({ renderers: await loadRenderers([getContainerRenderer()]) });
    const html = await container.renderToString(PublicFooter);

    expect(html).toMatch(/Imprint[\s\S]*Terms[\s\S]*Privacy/);
    for (const href of ["/imprint", "/terms", "/privacy"]) {
      expect(html).toContain(`href="${href}"`);
    }
  });
});
