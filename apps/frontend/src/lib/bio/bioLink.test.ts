import { describe, expect, it } from "vitest";
import { BioLinkKind, resolveBioLink } from "@/lib/bio/bioLink";

describe("resolveBioLink", () => {
  describe("commercial streaming platforms → logo", () => {
    it.each([
      ["https://open.spotify.com/track/abc", "spotify"],
      ["https://music.apple.com/us/album/x/123", "apple-music"],
      ["https://music.youtube.com/watch?v=x", "youtube-music"],
      ["https://www.youtube.com/watch?v=x", "youtube"],
      ["https://soundcloud.com/artist/track", "soundcloud"],
      ["https://tidal.com/browse/track/123", "tidal"],
      ["https://www.deezer.com/en/track/123", "deezer"],
      ["https://open.qobuz.com/track/123", "qobuz"],
      ["https://artist.bandcamp.com/album/x", "bandcamp"],
    ])("classifies %s as platform %s", (url, service) => {
      const link = resolveBioLink(url);
      expect(link.kind).toBe(BioLinkKind.Platform);
      if (link.kind === BioLinkKind.Platform) expect(link.service).toBe(service);
      expect(link.href).toBe(url);
    });

    it("does not treat a non-track spotify URL (playlist) as a platform link", () => {
      expect(resolveBioLink("https://open.spotify.com/playlist/123").kind).toBe(BioLinkKind.Web);
    });
  });

  describe("social channels → host/@handle", () => {
    it.each([
      ["https://twitter.com/username", "twitter.com/@username"],
      ["https://x.com/username", "twitter.com/@username"],
      ["https://bsky.app/profile/handle.bsky.social", "bsky.app/@handle.bsky.social"],
      ["https://chaos.social/@user", "chaos.social/@user"],
      ["https://www.instagram.com/username", "instagram.com/@username"],
      ["https://facebook.com/pagename", "facebook.com/@pagename"],
      ["https://www.pinterest.com/username", "pinterest.com/@username"],
      ["https://snapchat.com/add/username", "snapchat.com/@username"],
      ["https://t.me/username", "t.me/@username"],
    ])("normalises %s to %s", (url, label) => {
      const link = resolveBioLink(url);
      expect(link.kind).toBe(BioLinkKind.Social);
      if (link.kind === BioLinkKind.Social) expect(link.label).toBe(label);
    });

    it("falls back to web for a reserved twitter route", () => {
      expect(resolveBioLink("https://twitter.com/search").kind).toBe(BioLinkKind.Web);
    });

    it("falls back to web for a facebook profile.php link", () => {
      expect(resolveBioLink("https://facebook.com/profile.php?id=123").kind).toBe(BioLinkKind.Web);
    });
  });

  describe("plain websites → domain.tld", () => {
    it.each([
      ["https://www.pornophonique.de/music", "pornophonique.de"],
      ["http://example.com/some/path", "example.com"],
      ["music.example.com", "example.com"],
      ["https://blog.example.co.uk/post", "example.co.uk"],
      ["www.signal.me/#p/xyz", "signal.me"],
    ])("reduces %s to %s", (url, domain) => {
      const link = resolveBioLink(url);
      expect(link.kind).toBe(BioLinkKind.Web);
      if (link.kind === BioLinkKind.Web) expect(link.label).toBe(domain);
    });

    it("prefixes a scheme-less www URL with https in the href", () => {
      expect(resolveBioLink("www.pornophonique.de").href).toBe("https://www.pornophonique.de");
    });
  });

  describe("emails", () => {
    it("classifies an email as a mailto link", () => {
      const link = resolveBioLink("foo.bar@band.de");
      expect(link.kind).toBe(BioLinkKind.Email);
      expect(link.href).toBe("mailto:foo.bar@band.de");
      if (link.kind === BioLinkKind.Email) expect(link.label).toBe("foo.bar@band.de");
    });
  });
});
