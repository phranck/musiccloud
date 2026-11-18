import { describe, expect, it } from "vitest";
import { DESCRIPTION_MAX_LENGTH, describeContentPage } from "./pageDescription";
import { SITE_DESCRIPTION } from "./siteMeta";

describe("describeContentPage", () => {
  it("passes over a line too short to describe the page, such as a date", () => {
    const html =
      "<h1>Privacy Policy</h1><p><em>Last updated: 18 November 2026</em></p><p>This Privacy Policy explains how musiccloud processes personal data.</p>";

    expect(describeContentPage(html)).toBe("This Privacy Policy explains how musiccloud processes personal data.");
  });

  it("reads a paragraph standing inside a card, as plain text with its references decoded", () => {
    const html =
      '<div class="mc-card"><h2>Support musiccloud</h2><p><strong>musiccloud</strong> is free, and it&#39;s meant to stay that way &amp; open.</p></div>';

    expect(describeContentPage(html)).toBe("musiccloud is free, and it's meant to stay that way & open.");
  });

  it("cuts a long paragraph at the last whole word, with an ellipsis", () => {
    const words = Array.from({ length: 60 }, (_, index) => `word${index}`).join(" ");

    const description = describeContentPage(`<p>${words}</p>`);

    expect(description.length).toBeLessThanOrEqual(DESCRIPTION_MAX_LENGTH);
    expect(description.endsWith("…")).toBe(true);
    expect(words.startsWith(description.slice(0, -1))).toBe(true);
    expect(description.slice(0, -1).endsWith(" ")).toBe(false);
  });

  it("falls back to the site's description where no paragraph says enough", () => {
    expect(describeContentPage("<h1>Links</h1><p>Short.</p>")).toBe(SITE_DESCRIPTION);
    expect(describeContentPage("")).toBe(SITE_DESCRIPTION);
  });
});
