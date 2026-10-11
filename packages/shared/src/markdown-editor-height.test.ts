import { describe, expect, it } from "vitest";
import { editorHeightKey, readStoredEditorHeight, shouldStoreEditorHeight } from "./markdown-editor-height.js";

describe("editorHeightKey", () => {
  it("gives each editor a key of its own", () => {
    expect(editorHeightKey("page-body")).not.toBe(editorHeightKey("page-note"));
  });

  it("remembers nothing for an editor without an id", () => {
    // Two such editors cannot be told apart, and sharing one height between
    // them would move an editor somebody never touched.
    expect(editorHeightKey(undefined)).toBeNull();
  });
});

describe("readStoredEditorHeight", () => {
  it("reads a stored height back as a CSS length", () => {
    expect(readStoredEditorHeight("420")).toBe("420px");
  });

  it("rounds to the pixel", () => {
    expect(readStoredEditorHeight("419.6")).toBe("420px");
  });

  it("returns nothing where nothing was stored", () => {
    expect(readStoredEditorHeight(null)).toBeNull();
    expect(readStoredEditorHeight("")).toBeNull();
  });

  it("discards what is not a number", () => {
    expect(readStoredEditorHeight("tall")).toBeNull();
  });

  it("discards a height outside the bounds rather than clamping it", () => {
    // A value that far out was not a decision, and opening at the nearest
    // allowed height would present it as one.
    expect(readStoredEditorHeight("20")).toBeNull();
    expect(readStoredEditorHeight("99999")).toBeNull();
  });
});

describe("shouldStoreEditorHeight", () => {
  it("stores a height that differs from what stands there", () => {
    expect(shouldStoreEditorHeight(420, "300")).toBe(true);
  });

  it("stores the first height for an editor that has none", () => {
    expect(shouldStoreEditorHeight(420, null)).toBe(true);
  });

  it("writes nothing when the height has not changed", () => {
    // A drag reports on every frame, and storage is synchronous.
    expect(shouldStoreEditorHeight(420, "420")).toBe(false);
  });

  it("compares to the pixel, so a sub-pixel measurement is not a change", () => {
    expect(shouldStoreEditorHeight(420.4, "420")).toBe(false);
  });

  it("refuses a height outside the bounds", () => {
    expect(shouldStoreEditorHeight(20, null)).toBe(false);
    expect(shouldStoreEditorHeight(99_999, null)).toBe(false);
    expect(shouldStoreEditorHeight(Number.NaN, null)).toBe(false);
  });
});
