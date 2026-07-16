import { describe, expect, it } from "vitest";

import { PortalGateMode, renderPortalGateHtml } from "./coming-soon";

describe("renderPortalGateHtml", () => {
  it("renders maintenance copy while retaining the API reference link", () => {
    const html = renderPortalGateHtml(PortalGateMode.Maintenance);

    expect(html).toContain("musiccloud for developers · maintenance");
    expect(html).toContain("temporarily closed for maintenance");
    expect(html).toContain('href="/docs/api"');
  });
});
