import { describe, expect, it } from "vitest";
import {
  detectMusicLinkService,
  isMusicLink,
  isMusicLinkHost,
  isShortLinkHost,
  MUSIC_LINK_SOURCES,
} from "./music-links.js";
import { Service, type ServiceId } from "./services.js";

const HOSTS_BY_SERVICE = Object.entries(MUSIC_LINK_SOURCES).flatMap(([service, source]) =>
  [...source.hosts, ...(source.shortLinkHosts ?? [])].map((host) => [host, service as ServiceId] as const),
);

describe("detectMusicLinkService", () => {
  it.each(HOSTS_BY_SERVICE)("reads %s as %s", (host, service) => {
    expect(detectMusicLinkService(`https://${host}/some/path`)).toBe(service);
  });

  it("reads an artist's own Bandcamp subdomain as Bandcamp", () => {
    expect(detectMusicLinkService("https://artist.bandcamp.com/album/x")).toBe(Service.BandCamp);
  });

  it("tells a YouTube link from a YouTube Music link", () => {
    expect(detectMusicLinkService("https://www.youtube.com/watch?v=fJ9rUzIMcZQ")).toBe(Service.YouTube);
    expect(detectMusicLinkService("https://m.youtube.com/watch?v=fLbsQrJI63s")).toBe(Service.YouTube);
    expect(detectMusicLinkService("https://music.youtube.com/watch?v=fJ9rUzIMcZQ")).toBe(Service.YouTubeMusic);
  });

  it("reads a link pasted without its scheme", () => {
    expect(detectMusicLinkService("open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC")).toBe(Service.Spotify);
  });

  it("reads a host in capitals", () => {
    expect(detectMusicLinkService("https://OPEN.SPOTIFY.COM/track/1")).toBe(Service.Spotify);
  });

  it.each([
    ["an unrelated site", "https://www.google.com"],
    ["a host that only ends like a service's", "https://notbandcamp.com/album/x"],
    ["a service's host under somebody else's domain", "https://open.spotify.com.example.org/track/1"],
    ["a sentence containing a link", "listen to open.spotify.com/track/1"],
    ["an empty string", ""],
  ])("refuses %s", (_label, input) => {
    expect(detectMusicLinkService(input)).toBeNull();
  });

  it("leaves Jamendo to its own parser, because its links resolve through the Creative Commons endpoint", () => {
    expect(detectMusicLinkService("https://www.jamendo.com/track/1886257")).toBeNull();
  });
});

describe("isMusicLink", () => {
  it("accepts a link with extra parameters and a fragment", () => {
    expect(isMusicLink("https://m.youtube.com/watch?v=fLbsQrJI63s&pp=0gcJCUECo7VqN5tD&ra=m#searching")).toBe(true);
  });

  it("refuses a link on no service's host", () => {
    expect(isMusicLink("https://example.org/track/1")).toBe(false);
  });
});

describe("isMusicLinkHost", () => {
  it("admits a short-link host, because the backend has to fetch it to follow the redirect", () => {
    expect(isMusicLinkHost("on.soundcloud.com")).toBe(true);
    expect(isMusicLinkHost("link.deezer.com")).toBe(true);
  });

  it("admits a Bandcamp subdomain and refuses a lookalike", () => {
    expect(isMusicLinkHost("artist.bandcamp.com")).toBe(true);
    expect(isMusicLinkHost("evilbandcamp.com")).toBe(false);
  });

  it("refuses a host no service serves links from", () => {
    expect(isMusicLinkHost("169.254.169.254")).toBe(false);
    expect(isMusicLinkHost("localhost")).toBe(false);
  });
});

describe("isShortLinkHost", () => {
  it("names the short-link hosts and nothing else", () => {
    expect(isShortLinkHost("on.soundcloud.com")).toBe(true);
    expect(isShortLinkHost("LINK.DEEZER.COM")).toBe(true);
    expect(isShortLinkHost("soundcloud.com")).toBe(false);
    expect(isShortLinkHost("open.spotify.com")).toBe(false);
  });
});
