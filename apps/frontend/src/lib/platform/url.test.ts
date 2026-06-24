import { Service } from "@musiccloud/shared";
import { describe, expect, it } from "vitest";
import { detectMusicService, isMusicUrl } from "./url";

describe("detectMusicService", () => {
  it("identifies a standard YouTube watch URL as YouTube", () => {
    expect(detectMusicService("https://www.youtube.com/watch?v=fJ9rUzIMcZQ")).toBe(Service.YouTube);
  });

  it("identifies a mobile YouTube watch URL as YouTube", () => {
    expect(detectMusicService("https://m.youtube.com/watch?v=fLbsQrJI63s")).toBe(Service.YouTube);
  });

  it("still identifies a music.youtube.com URL as YouTube Music", () => {
    expect(detectMusicService("https://music.youtube.com/watch?v=fJ9rUzIMcZQ")).toBe(Service.YouTubeMusic);
  });

  it("returns null for an unrecognised URL", () => {
    expect(detectMusicService("https://www.google.com")).toBeNull();
  });
});

describe("isMusicUrl", () => {
  it("accepts a mobile YouTube watch URL with extra params and fragment", () => {
    expect(isMusicUrl("https://m.youtube.com/watch?v=fLbsQrJI63s&pp=0gcJCUECo7VqN5tD&ra=m#searching")).toBe(true);
  });
});
