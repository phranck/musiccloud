import { ContentContext, expandSiteVariables, PLANS_PLACEHOLDER_ATTRIBUTE } from "@musiccloud/shared";
import { describe, expect, it } from "vitest";
import { PORTAL_PAGE_SEEDS } from "../content/portal-pages.js";
import { renderMarkdown } from "../markdown/renderer.js";
import { sanitizeMarkdownHtml } from "../markdown/sanitizer.js";

/** Figures no constant in the codebase holds, so nothing can pass by luck. */
const VARIABLE_VALUES = {
  freeRequestsPerMinute: 37,
  freeRequestsPerDay: 4321,
  projectsPerAccount: 7,
  registrationsPerProject: 9,
  keylessRequestsPerMinute: 11,
  keylessRequestsPerDay: 222,
};

/** One page, rendered exactly as the portal serves it. */
async function servedPage(slug: string): Promise<string> {
  const seed = PORTAL_PAGE_SEEDS.find((candidate) => candidate.slug === slug);
  if (!seed) throw new Error(`No portal page seeded for "${slug}"`);
  const expanded = expandSiteVariables(seed.content, VARIABLE_VALUES);
  return sanitizeMarkdownHtml(await renderMarkdown(expanded, ContentContext.DeveloperPortal));
}

describe("the seeded portal pages", () => {
  it("names a page for each path the portal serves from a route", () => {
    expect(PORTAL_PAGE_SEEDS.map((seed) => seed.path).sort()).toEqual(["/docs", "/pricing"]);
  });

  it("leaves no shortcode source standing on either page", async () => {
    // A shortcode that does not resolve appears as what was typed. That is the
    // right behaviour and the wrong outcome for a page that ships.
    for (const seed of PORTAL_PAGE_SEEDS) {
      const html = await servedPage(seed.slug);
      expect(html, seed.slug).not.toContain("[[");
      expect(html, seed.slug).not.toContain(":::");
    }
  });

  it("leaves no unexpanded variable standing on either page", async () => {
    for (const seed of PORTAL_PAGE_SEEDS) {
      const html = await servedPage(seed.slug);
      expect(html, seed.slug).not.toMatch(/\{[a-z][a-zA-Z]+\}/);
    }
  });
});

describe("/docs", () => {
  it("keeps the anchor the pricing page links to", async () => {
    // `/pricing` links to `/docs#how-it-fits-together`, so this heading's id is
    // part of the contract between the two pages rather than a detail of one.
    expect(await servedPage("docs")).toContain('id="how-it-fits-together"');
  });

  it("states what you can build, how it fits together, and how to start", async () => {
    const html = await servedPage("docs");

    expect(html).toContain("What you can build");
    expect(html).toContain("How it fits together");
    expect(html).toContain("Getting started");
  });

  it("renders each section as a card", async () => {
    const html = await servedPage("docs");

    expect(html.match(/<div class="mc-card">/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it("takes its figures from the variables rather than from the copy", async () => {
    const html = await servedPage("docs");

    expect(html).toContain(String(VARIABLE_VALUES.projectsPerAccount));
    expect(html).toContain(String(VARIABLE_VALUES.registrationsPerProject));
    expect(html).toContain(String(VARIABLE_VALUES.keylessRequestsPerMinute));
  });

  it("keeps the four levels an integration is built from", async () => {
    const html = await servedPage("docs");

    for (const level of ["Account", "Project", "Registration", "Key"]) {
      expect(html, level).toContain(`<dt>${level}:</dt>`);
    }
  });
});

describe("/pricing", () => {
  it("leaves the plan list to the plans, not to the copy", async () => {
    const html = await servedPage("pricing");

    expect(html).toContain(PLANS_PLACEHOLDER_ATTRIBUTE);
    // No price is written into the page: the only place one appears is the
    // component the placeholder is replaced with.
    expect(html).not.toMatch(/€\s*\d/);
  });

  it("keeps every commitment it makes", async () => {
    const html = await servedPage("pricing");

    for (const commitment of [
      "The free plan stays free",
      "Early users are grandfathered",
      "Plenty of notice",
      "No artificial friction",
    ]) {
      expect(html, commitment).toContain(commitment);
    }
  });

  it("leaves the link into /docs to the plan block, which carries it", async () => {
    // The sentence pointing at `/docs#how-it-fits-together` belongs to the
    // plans rather than to this page, so it renders wherever `[[plans]]` does
    // and is not written into the copy a second time.
    const html = await servedPage("pricing");

    expect(html).not.toContain("how-it-fits-together");
    expect(html).toContain(PLANS_PLACEHOLDER_ATTRIBUTE);
  });

  it("stands its two commitment groups side by side", async () => {
    const html = await servedPage("pricing");

    expect(html).toContain("mc-cards--2");
    expect(html.match(/<div class="mc-card">/g)).toHaveLength(2);
  });

  it("sets each commitment above the sentence explaining it, as it always has", async () => {
    const html = await servedPage("pricing");

    expect(html).toContain("mc-fields--stacked");
    // No trailing colon: the statement is a line of its own rather than a
    // label for the value beside it.
    expect(html).toContain("<dt>The free plan stays free.</dt>");
  });
});
