/**
 * The shared host table in `@musiccloud/shared` decides which links the web
 * input submits on paste and which hosts the backend fetches from. The
 * plugins' detectors decide which links resolve. These tests hold the two
 * together, so a plugin added, removed or moved to another host fails here
 * rather than as a link that is refused at the door or submitted to nothing.
 */
import { detectMusicLinkService, isMusicLinkHost, MUSIC_LINK_SOURCES, Service } from "@musiccloud/shared";
import { describe, expect, it } from "vitest";
import { validateMusicUrl } from "../lib/platform/url.js";
import { listPlugins } from "../services/plugins/registry.js";
import type { ServiceAdapter } from "../services/types.js";
import { MUSIC_LINK_SAMPLES } from "./music-link-samples.js";

/** Whether any of an adapter's detectors claims `url`. */
function claims(adapter: ServiceAdapter, url: string): boolean {
  return Boolean(adapter.detectUrl(url) ?? adapter.detectAlbumUrl?.(url) ?? adapter.detectArtistUrl?.(url));
}

const samples = listPlugins().flatMap((plugin) =>
  Object.entries(MUSIC_LINK_SAMPLES[plugin.manifest.id] ?? {}).map(([kind, url]) => ({
    pluginId: plugin.manifest.id,
    kind,
    url,
    adapter: plugin.adapter,
  })),
);

describe("the shared music-link hosts and the plugins", () => {
  it("has an entry for every plugin", () => {
    const missing = listPlugins()
      .map((plugin) => plugin.manifest.id)
      .filter((id) => !(id in MUSIC_LINK_SOURCES));
    expect(missing).toEqual([]);
  });

  it("has no entry without a plugin, apart from YouTube Music, which the YouTube plugin resolves", () => {
    const pluginIds = new Set<string>(listPlugins().map((plugin) => plugin.manifest.id));
    const orphaned = Object.keys(MUSIC_LINK_SOURCES).filter((id) => !pluginIds.has(id));
    expect(orphaned).toEqual([Service.YouTubeMusic]);
  });

  it.each(samples)("admits the $pluginId $kind sample and names its service", ({ pluginId, url, adapter }) => {
    expect(claims(adapter, url)).toBe(true);
    expect(isMusicLinkHost(new URL(url).hostname)).toBe(true);
    expect(detectMusicLinkService(url)).toBe(pluginId);
    expect(validateMusicUrl(url)).toEqual({ valid: true });
  });

  it("names a YouTube Music link as YouTube Music and has the YouTube plugin claim it", () => {
    const youtube = listPlugins().find((plugin) => plugin.manifest.id === Service.YouTube);
    const url = "https://music.youtube.com/watch?v=fJ9rUzIMcZQ";

    expect(youtube && claims(youtube.adapter, url)).toBe(true);
    expect(detectMusicLinkService(url)).toBe(Service.YouTubeMusic);
    expect(validateMusicUrl(url)).toEqual({ valid: true });
  });
});
