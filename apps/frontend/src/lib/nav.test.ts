import type { NavItem } from "@musiccloud/shared";
import { describe, expect, it } from "vitest";
import { navHref } from "./nav";

function item(overrides: Partial<NavItem>): NavItem {
  return {
    id: 1,
    navId: "header",
    pageSlug: null,
    pageTitle: null,
    url: null,
    target: "_self",
    label: null,
    position: 0,
    pageType: null,
    pageDisplayMode: null,
    pageOverlayWidth: null,
    ...overrides,
  };
}

describe("navHref", () => {
  it("links a page by its slug", () => {
    expect(navHref(item({ pageSlug: "about" }))).toBe("/about");
  });

  it.each([
    "/docs",
    "https://musiccloud.io/blog",
    "mailto:team@musiccloud.io",
  ])("keeps a stored link the API accepts: %s", (url) => {
    expect(navHref(item({ url }))).toBe(url);
  });

  it.each([
    "//evil.example",
    "/\\evil.example",
    "http://evil.example",
    "tel:+43123",
    "javascript:alert(1)",
  ])("renders a stored link the API would refuse as #: %s", (url) => {
    expect(navHref(item({ url }))).toBe("#");
  });
});
