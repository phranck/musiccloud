/**
 * The resolve routes send a link to the album, artist or track pipeline by
 * asking `classifyMusicUrl`, which returns the kind of the first detector that
 * claims the link. That only works while exactly one detector across all
 * plugins claims each link: a second claimant would decide the pipeline by
 * nothing more than the order the detectors are asked in.
 *
 * `music-link-samples.ts` holds one sample link per detector. A plugin that gains a
 * detector without a sample fails the first test, so the guarantee covers
 * every plugin the registry lists rather than the ones somebody remembered.
 */
import { describe, expect, it } from "vitest";
import { classifyMusicUrl, listPlugins, type MusicUrlKind } from "../services/plugins/registry.js";
import type { ServiceAdapter } from "../services/types.js";
import { MUSIC_LINK_SAMPLES } from "./music-link-samples.js";

type UrlDetector = (url: string) => string | null;

/**
 * Lists the detectors an adapter has, each with the kind it stands for.
 *
 * @param adapter - The plugin's adapter.
 * @returns `track` always, then `album` and `artist` where the adapter defines them.
 */
function detectorsOf(adapter: ServiceAdapter): Array<[MusicUrlKind, UrlDetector]> {
  const detectors: Array<[MusicUrlKind, UrlDetector]> = [["track", (url) => adapter.detectUrl(url)]];
  if (adapter.detectAlbumUrl) detectors.push(["album", (url) => adapter.detectAlbumUrl?.(url) ?? null]);
  if (adapter.detectArtistUrl) detectors.push(["artist", (url) => adapter.detectArtistUrl?.(url) ?? null]);
  return detectors;
}

const cases = listPlugins().flatMap((plugin) =>
  detectorsOf(plugin.adapter).map(([kind]) => ({ pluginId: plugin.manifest.id, kind })),
);

/** Every detector of every plugin that claims `url`, as `pluginId:kind`. */
function claimantsOf(url: string): string[] {
  return listPlugins().flatMap((plugin) =>
    detectorsOf(plugin.adapter)
      .filter(([, detect]) => detect(url) !== null)
      .map(([kind]) => `${plugin.manifest.id}:${kind}`),
  );
}

describe("classifyMusicUrl", () => {
  it("has a sample link for every detector of every plugin, and none for a detector that does not exist", () => {
    const missing = cases
      .filter(({ pluginId, kind }) => !MUSIC_LINK_SAMPLES[pluginId]?.[kind])
      .map(({ pluginId, kind }) => `${pluginId}:${kind}`);
    const detectorKeys = new Set(cases.map(({ pluginId, kind }) => `${pluginId}:${kind}`));
    const orphaned = Object.entries(MUSIC_LINK_SAMPLES).flatMap(([pluginId, samples]) =>
      Object.keys(samples)
        .map((kind) => `${pluginId}:${kind}`)
        .filter((key) => !detectorKeys.has(key)),
    );
    expect(missing).toEqual([]);
    expect(orphaned).toEqual([]);
  });

  it.each(cases)("routes the $pluginId $kind sample to the $kind pipeline", ({ pluginId, kind }) => {
    const sample = MUSIC_LINK_SAMPLES[pluginId]?.[kind];
    if (!sample) return;
    expect(claimantsOf(sample)).toEqual([`${pluginId}:${kind}`]);
    expect(classifyMusicUrl(sample)).toBe(kind);
  });

  it("classifies a localized Spotify album link as an album", () => {
    expect(classifyMusicUrl("https://open.spotify.com/intl-de/album/6dVIqQ8qmQ5GBnJ9shOYGE")).toBe("album");
  });

  it("returns null for a link no plugin claims", () => {
    expect(classifyMusicUrl("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M")).toBeNull();
    expect(classifyMusicUrl("https://youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf")).toBeNull();
    expect(classifyMusicUrl("https://music.youtube.com/playlist?list=OLAK5uy_abc123")).toBeNull();
    expect(classifyMusicUrl("https://audius.co/deadmau5/playlist/my-mix-12345")).toBeNull();
    expect(classifyMusicUrl("https://www.google.com/search?q=music")).toBeNull();
    expect(classifyMusicUrl("Bohemian Rhapsody Queen")).toBeNull();
  });
});
