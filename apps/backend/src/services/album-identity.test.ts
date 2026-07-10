import { describe, expect, it } from "vitest";
import { createAlbumIdentityKey } from "./album-identity.js";

describe("createAlbumIdentityKey", () => {
  it("uses only the normalized main artist and album title", () => {
    expect(createAlbumIdentityKey({ artists: ["  JIMMY  SMITH  ", "Guest Artist"], title: "The Sérmon!" })).toBe(
      "jimmy smith::the sermon",
    );
  });

  it("returns undefined when either stable identity part is missing", () => {
    expect(createAlbumIdentityKey({ artists: [], title: "The Sermon!" })).toBeUndefined();
    expect(createAlbumIdentityKey({ artists: ["Jimmy Smith"], title: "   " })).toBeUndefined();
  });
});
