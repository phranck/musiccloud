import { describe, expect, it } from "vitest";
import { parseJamendoUrl } from "./jamendoUrl";

describe("parseJamendoUrl", () => {
  it("maps a track URL to a `jamendo:` candidate", () => {
    expect(parseJamendoUrl("https://www.jamendo.com/track/26738/alone")).toBe("jamendo:26738");
  });

  it("maps an album URL to a `jamendo-album:` candidate", () => {
    expect(parseJamendoUrl("https://www.jamendo.com/album/3661/listen")).toBe("jamendo-album:3661");
  });

  it("accepts the apex host, localized subdomains, missing slug, and query strings", () => {
    expect(parseJamendoUrl("https://jamendo.com/track/26738")).toBe("jamendo:26738");
    expect(parseJamendoUrl("https://en.jamendo.com/track/26738/alone")).toBe("jamendo:26738");
    expect(parseJamendoUrl("http://www.jamendo.com/album/3661/listen?from=x")).toBe("jamendo-album:3661");
    expect(parseJamendoUrl("  https://www.jamendo.com/track/26738/alone  ")).toBe("jamendo:26738");
  });

  it("returns null for artist URLs, other paths, non-numeric ids, other hosts, and non-URLs", () => {
    expect(parseJamendoUrl("https://www.jamendo.com/artist/350694")).toBeNull();
    expect(parseJamendoUrl("https://www.jamendo.com/track/abc/x")).toBeNull();
    expect(parseJamendoUrl("https://www.jamendo.com/")).toBeNull();
    expect(parseJamendoUrl("https://notjamendo.com/track/26738")).toBeNull();
    expect(parseJamendoUrl("https://open.spotify.com/track/123")).toBeNull();
    expect(parseJamendoUrl("just some text")).toBeNull();
  });
});
