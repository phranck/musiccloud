import { describe, expect, it } from "vitest";
import {
  EDITOR_MIN_HEIGHT_PX,
  editorHeightKey,
  readStoredEditorHeight,
  shouldStoreEditorHeight,
} from "./markdown-editor-height.js";

describe("editorHeightKey", () => {
  it("gives each identity a key of its own", () => {
    expect(editorHeightKey("page-body")).not.toBe(editorHeightKey("page-note"));
  });

  it("gives editors with the same identity one key", () => {
    expect(editorHeightKey("email-template-text-block")).toBe(editorHeightKey("email-template-text-block"));
  });

  it("remembers nothing for an editor without an identity", () => {
    // Two such editors cannot be told apart, and sharing one height between
    // them would move an editor somebody never touched.
    expect(editorHeightKey(undefined)).toBeNull();
  });
});

describe("EDITOR_MIN_HEIGHT_PX", () => {
  it("is the shortest height both reading and storing accept", () => {
    // The editor's frame uses it as its minimum height, so a height it can be
    // dragged to is one it remembers.
    expect(readStoredEditorHeight(String(EDITOR_MIN_HEIGHT_PX))).toBe(`${EDITOR_MIN_HEIGHT_PX}px`);
    expect(readStoredEditorHeight(String(EDITOR_MIN_HEIGHT_PX - 1))).toBeNull();
    expect(shouldStoreEditorHeight(EDITOR_MIN_HEIGHT_PX, null)).toBe(true);
    expect(shouldStoreEditorHeight(EDITOR_MIN_HEIGHT_PX - 1, null)).toBe(false);
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
