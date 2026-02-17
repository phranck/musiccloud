import { describe, it, expect } from "vitest";
import { generateOGMeta } from "../lib/og-helpers";
import type { Platform } from "../lib/utils";

describe("generateOGMeta", () => {
  const baseInput = {
    title: "Bohemian Rhapsody",
    artist: "Queen",
    albumArtUrl: "https://img.example.com/art.jpg",
    shortId: "abc12",
    availablePlatforms: ["spotify", "apple-music", "youtube"] as Platform[],
  };

  it("should generate og:title as 'title - artist'", () => {
    const og = generateOGMeta(baseInput);
    expect(og.ogTitle).toBe("Bohemian Rhapsody - Queen");
  });

  it("should truncate long og:title at 60 chars", () => {
    const og = generateOGMeta({
      ...baseInput,
      title: "A Very Long Song Title That Goes On And On And On",
      artist: "A Very Long Artist Name",
    });
    expect(og.ogTitle.length).toBeLessThanOrEqual(60);
    expect(og.ogTitle).toMatch(/\.\.\.$/);
  });

  it("should generate description with all 3 platforms", () => {
    const og = generateOGMeta(baseInput);
    expect(og.ogDescription).toBe("Listen on Spotify, Apple Music, and YouTube");
  });

  it("should generate description with 2 platforms", () => {
    const og = generateOGMeta({
      ...baseInput,
      availablePlatforms: ["spotify", "apple-music"] as Platform[],
    });
    expect(og.ogDescription).toBe("Listen on Spotify and Apple Music");
  });

  it("should generate description with 1 platform", () => {
    const og = generateOGMeta({
      ...baseInput,
      availablePlatforms: ["spotify"] as Platform[],
    });
    expect(og.ogDescription).toBe("Listen on Spotify");
  });

  it("should generate fallback description with 0 platforms", () => {
    const og = generateOGMeta({
      ...baseInput,
      availablePlatforms: [],
    });
    expect(og.ogDescription).toBe("Find this song on musiccloud");
  });

  it("should append album to description if it fits", () => {
    const og = generateOGMeta({
      ...baseInput,
      album: "A Night at the Opera",
      availablePlatforms: ["spotify"] as Platform[],
    });
    expect(og.ogDescription).toContain("A Night at the Opera");
    expect(og.ogDescription.length).toBeLessThanOrEqual(65);
  });

  it("should not append album if it would exceed 65 chars", () => {
    const og = generateOGMeta({
      ...baseInput,
      album: "A Very Long Album Name That Would Definitely Exceed The Limit",
    });
    expect(og.ogDescription).not.toContain("A Very Long Album");
  });

  it("should use album art URL as og:image", () => {
    const og = generateOGMeta(baseInput);
    expect(og.ogImageUrl).toBe("https://img.example.com/art.jpg");
  });

  it("should use default image when no album art", () => {
    const og = generateOGMeta({
      ...baseInput,
      albumArtUrl: "",
    });
    expect(og.ogImageUrl).toBe("/og/default.jpg");
  });

  it("should set og:url with shortId", () => {
    const og = generateOGMeta(baseInput);
    expect(og.ogUrl).toBe("https://musiccloud.io/abc12");
  });

  it("should use custom origin when provided", () => {
    const og = generateOGMeta({
      ...baseInput,
      origin: "http://localhost:4321",
    });
    expect(og.ogUrl).toBe("http://localhost:4321/abc12");
  });

  it("should set twitter:card to summary_large_image", () => {
    const og = generateOGMeta(baseInput);
    expect(og.twitterCard).toBe("summary_large_image");
  });

  it("should set pageTitle with musiccloud suffix", () => {
    const og = generateOGMeta(baseInput);
    expect(og.pageTitle).toBe("Bohemian Rhapsody - Queen | musiccloud");
  });
});
