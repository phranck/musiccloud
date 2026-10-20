import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ServiceAdapter } from "../../../types.js";

const fetchMock = vi.fn();
vi.mock("../../../../lib/infra/fetch.js", () => ({
  fetchWithTimeout: (url: string, init?: RequestInit, timeout?: number) => fetchMock(url, init, timeout),
}));
vi.mock("../../../../lib/infra/token-manager.js", () => ({
  TokenManager: class {
    isConfigured() {
      return true;
    }
    async getAccessToken() {
      return "test-only-token";
    }
    reset() {}
  },
}));

import { listPlugins } from "../../registry.js";

/** A public search operation whose transport is replaced before any provider request. */
interface SearchControl {
  name: string;
  run: () => Promise<unknown>;
}

/**
 * Derives executable search boundaries from the registered adapter, not a second provider list.
 * @param adapter - Registry adapter with all outbound transport mocked.
 * @returns Implemented search and supported identifier operations, preserving their receiver.
 */
function controlsFor(adapter: ServiceAdapter): SearchControl[] {
  const trackQuery = { title: "Get Lucky", artist: "Daft Punk", artists: ["Daft Punk"] };
  const controls: SearchControl[] = [{ name: "track", run: () => adapter.searchTrack(trackQuery) }];
  const candidates = adapter.searchTrackWithCandidates?.bind(adapter);
  const album = adapter.searchAlbum?.bind(adapter);
  const artist = adapter.searchArtist?.bind(adapter);
  if (candidates) controls.push({ name: "candidates", run: () => candidates(trackQuery) });
  if (album)
    controls.push({ name: "album", run: () => album({ title: "Random Access Memories", artist: "Daft Punk" }) });
  if (artist) controls.push({ name: "artist", run: () => artist({ name: "Daft Punk" }) });
  if (adapter.capabilities.supportsIsrc) controls.push({ name: "ISRC", run: () => adapter.findByIsrc("USQX91300108") });
  const upc = adapter.findAlbumByUpc?.bind(adapter);
  if (upc) controls.push({ name: "UPC", run: () => upc("886443919266") });
  return controls;
}

beforeEach(() => {
  fetchMock.mockReset();
  for (const { manifest } of listPlugins()) {
    for (const key of [...(manifest.requiredEnv ?? []), ...(manifest.alternativeEnv ?? [])]) {
      vi.stubEnv(key, "test-only-value");
    }
  }
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

for (const { adapter } of listPlugins()) {
  describe(`${adapter.id}: registered failure contract`, () => {
    it("implements each operation advertised by its capability declarations", () => {
      if (adapter.albumCapabilities) {
        expect(adapter.detectAlbumUrl).toBeTypeOf("function");
        expect(adapter.getAlbum).toBeTypeOf("function");
        if (adapter.albumCapabilities.supportsUpc) expect(adapter.findAlbumByUpc).toBeTypeOf("function");
        if (adapter.albumCapabilities.supportsAlbumSearch) expect(adapter.searchAlbum).toBeTypeOf("function");
      }
      if (adapter.artistCapabilities?.supportsArtistSearch) {
        expect(adapter.detectArtistUrl).toBeTypeOf("function");
        expect(adapter.getArtist).toBeTypeOf("function");
        expect(adapter.searchArtist).toBeTypeOf("function");
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });

    for (const control of controlsFor(adapter)) {
      it(`${control.name} rejects HTTP 503 instead of returning a catalog miss`, async () => {
        if (adapter.isConfigured) vi.spyOn(adapter, "isConfigured").mockReturnValue(true);
        fetchMock.mockImplementation(async () => Response.json({ error: "test-only-unavailable" }, { status: 503 }));
        const [result] = await Promise.allSettled([control.run()]);
        expect(fetchMock).toHaveBeenCalled();
        expect(result.status).toBe("rejected");
      });

      it(`${control.name} rejects an unrecognized HTTP-200 document instead of returning a catalog miss`, async () => {
        if (adapter.isConfigured) vi.spyOn(adapter, "isConfigured").mockReturnValue(true);
        fetchMock.mockImplementation(async () => Response.json({ unexpected: "not a provider search document" }));
        const [result] = await Promise.allSettled([control.run()]);
        expect(fetchMock).toHaveBeenCalled();
        expect(result.status).toBe("rejected");
      });
    }
  });
}
