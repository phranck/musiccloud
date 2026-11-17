import { afterEach, describe, expect, it } from "vitest";

import {
  countResolvedLink,
  parseResolvedLinks,
  RESOLVED_LINKS_STORAGE_KEY,
  readResolvedLinkCount,
  recordResolvedLink,
} from "./resolved-links";

describe("countResolvedLink", () => {
  it("counts a different link", () => {
    expect(countResolvedLink({ count: 0, last: null }, "/abc")).toEqual({ count: 1, last: "/abc" });
  });

  it("does not count the same result shown again", () => {
    const first = countResolvedLink({ count: 0, last: null }, "/abc");
    expect(countResolvedLink(first, "/abc")).toBe(first);
  });
});

describe("parseResolvedLinks", () => {
  it("returns nothing counted for nothing, for rubbish, and for the wrong shape", () => {
    expect(parseResolvedLinks(null)).toEqual({ count: 0, last: null });
    expect(parseResolvedLinks("{not json")).toEqual({ count: 0, last: null });
    expect(parseResolvedLinks('{"count":"many","last":7}')).toEqual({ count: 0, last: null });
  });
});

describe("recordResolvedLink", () => {
  afterEach(() => window.localStorage.removeItem(RESOLVED_LINKS_STORAGE_KEY));

  it("keeps the count in the browser across reads", () => {
    recordResolvedLink("/abc");
    recordResolvedLink("/abc");
    recordResolvedLink("/def");

    expect(readResolvedLinkCount()).toBe(2);
  });
});
