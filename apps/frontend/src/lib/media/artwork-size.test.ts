import { describe, expect, it } from "vitest";
import { artworkUrlAtSize } from "./artwork-size";

describe("artworkUrlAtSize", () => {
  it("asks Deezer for a cover at the requested size", () => {
    expect(
      artworkUrlAtSize(
        "https://cdn-images.dzcdn.net/images/cover/803b9908e22fc5e948ad627e48fe66ee/1000x1000-000000-80-0-0.jpg",
        250,
      ),
    ).toBe("https://cdn-images.dzcdn.net/images/cover/803b9908e22fc5e948ad627e48fe66ee/250x250-000000-80-0-0.jpg");
  });

  it("asks Deezer for an artist picture at the requested size", () => {
    expect(
      artworkUrlAtSize("https://cdn-images.dzcdn.net/images/artist/0a1b2c3d/1000x1000-000000-80-0-0.jpg", 250),
    ).toBe("https://cdn-images.dzcdn.net/images/artist/0a1b2c3d/250x250-000000-80-0-0.jpg");
  });

  it("asks Apple Music for artwork at the requested size", () => {
    expect(
      artworkUrlAtSize(
        "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/aa/bb/cc/aabbcc/source/640x640bb.jpg",
        250,
      ),
    ).toBe("https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/aa/bb/cc/aabbcc/source/250x250bb.jpg");
  });

  it("leaves a URL from any other CDN unchanged", () => {
    const spotify = "https://i.scdn.co/image/ab67616d0000b273abcdef";
    expect(artworkUrlAtSize(spotify, 250)).toBe(spotify);
  });

  it("passes a missing URL through", () => {
    expect(artworkUrlAtSize(undefined, 250)).toBeUndefined();
  });
});
