import { describe, expect, it, vi } from "vitest";
import { createDirtyRegistry } from "../dirtyRegistry";

describe("dirtyRegistry", () => {
  it("add/delete/has", () => {
    const r = createDirtyRegistry();
    r.add("content:info");
    expect(r.has("content:info")).toBe(true);
    r.delete("content:info");
    expect(r.has("content:info")).toBe(false);
  });

  it("subscribe is called on add and delete", () => {
    const r = createDirtyRegistry();
    const fn = vi.fn();
    r.subscribe(fn);
    r.add("a" as never);
    r.delete("a" as never);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("groupCount: distinct resource buckets", () => {
    const r = createDirtyRegistry();
    r.add("content:info");
    r.add("meta:info");
    r.add("segments:help");
    r.add("sidebar");
    r.add("translations:info");
    expect(r.groupCount()).toBe(4); // pages, segments, sidebar, translations
  });

  it("clear()", () => {
    const r = createDirtyRegistry();
    r.add("a" as never);
    r.add("b" as never);
    r.clear();
    expect(r.size()).toBe(0);
  });
});
