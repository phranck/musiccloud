import { describe, expect, it } from "vitest";

import { isDeezerSilhouette, pickDeezerArtistImage } from "../services/plugins/deezer/artist-image";

const SILHOUETTE_BIG =
  "https://e-cdns-images.dzcdn.net/images/artist/d41d8cd98f00b204e9800998ecf8427e/500x500-000000-80-0-0.jpg";
const REAL_XL = "https://e-cdns-images.dzcdn.net/images/artist/abc123/1000x1000.jpg";
const REAL_BIG = "https://e-cdns-images.dzcdn.net/images/artist/abc123/500x500.jpg";

describe("isDeezerSilhouette", () => {
  it("flags the empty-MD5 default-silhouette URL", () => {
    expect(isDeezerSilhouette(SILHOUETTE_BIG)).toBe(true);
  });

  it("treats undefined / empty as silhouette (no usable image)", () => {
    expect(isDeezerSilhouette(undefined)).toBe(true);
    expect(isDeezerSilhouette("")).toBe(true);
  });

  it("accepts real artist image URLs", () => {
    expect(isDeezerSilhouette(REAL_XL)).toBe(false);
    expect(isDeezerSilhouette(REAL_BIG)).toBe(false);
  });
});

describe("pickDeezerArtistImage", () => {
  it("returns picture_xl when present and not silhouette", () => {
    const url = pickDeezerArtistImage({ picture_xl: REAL_XL, picture_big: REAL_BIG });
    expect(url).toBe(REAL_XL);
  });

  it("falls through to picture_big when picture_xl is the silhouette", () => {
    const url = pickDeezerArtistImage({ picture_xl: SILHOUETTE_BIG, picture_big: REAL_BIG });
    expect(url).toBe(REAL_BIG);
  });

  it("returns null when all candidate URLs are silhouettes", () => {
    const url = pickDeezerArtistImage({
      picture_xl: SILHOUETTE_BIG,
      picture_big: SILHOUETTE_BIG,
      picture_medium: SILHOUETTE_BIG,
    });
    expect(url).toBeNull();
  });

  it("returns null when no picture fields are set", () => {
    expect(pickDeezerArtistImage({})).toBeNull();
  });
});
