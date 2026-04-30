import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deezerChartsSource } from "../deezer-charts.js";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  // Drop the 250ms inter-genre throttle to keep tests fast.
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function chartResponse(tracks: Array<{ link?: string; isrc?: string }>): Response {
  return new Response(JSON.stringify({ data: tracks }), { status: 200 });
}

describe("deezerChartsSource.fetch", () => {
  it("emits one URL candidate per chart-track with ISRC propagated", async () => {
    fetchMock.mockResolvedValueOnce(
      chartResponse([
        { link: "https://www.deezer.com/track/1", isrc: "USRC11111111" },
        { link: "https://www.deezer.com/track/2", isrc: "USRC22222222" },
      ]),
    );

    const result = await deezerChartsSource.fetch({ genres: [0], limit: 100 }, null);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("https://api.deezer.com/chart/0/tracks?limit=100");
    expect(result.candidates).toEqual([
      { kind: "url", url: "https://www.deezer.com/track/1", isrc: "USRC11111111" },
      { kind: "url", url: "https://www.deezer.com/track/2", isrc: "USRC22222222" },
    ]);
    expect(result.nextCursor).toBeNull();
  });

  it("issues one fetch per genre id and concatenates results", async () => {
    // A fresh Response per call — Response bodies can only be read once.
    fetchMock.mockImplementation(async () => chartResponse([{ link: "https://www.deezer.com/track/1" }]));

    const result = await deezerChartsSource.fetch({ genres: [0, 132, 116], limit: 50 }, null);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://api.deezer.com/chart/0/tracks?limit=50");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://api.deezer.com/chart/132/tracks?limit=50");
    expect(fetchMock).toHaveBeenNthCalledWith(3, "https://api.deezer.com/chart/116/tracks?limit=50");
    expect(result.candidates).toHaveLength(3);
  });

  it("skips genres whose response is non-2xx and continues with the rest", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("nope", { status: 500 }))
      .mockResolvedValueOnce(chartResponse([{ link: "https://www.deezer.com/track/1", isrc: "USRC11111111" }]));

    const result = await deezerChartsSource.fetch({ genres: [0, 132], limit: 100 }, null);

    expect(result.candidates).toEqual([{ kind: "url", url: "https://www.deezer.com/track/1", isrc: "USRC11111111" }]);
  });

  it("drops tracks without a `link` field but keeps tracks without ISRC", async () => {
    fetchMock.mockResolvedValueOnce(
      chartResponse([
        { isrc: "USRC11111111" }, // no link — dropped
        { link: "https://www.deezer.com/track/1" }, // no isrc — kept
        { link: "https://www.deezer.com/track/2", isrc: "USRC22222222" },
      ]),
    );

    const result = await deezerChartsSource.fetch({ genres: [0], limit: 100 }, null);

    expect(result.candidates).toEqual([
      { kind: "url", url: "https://www.deezer.com/track/1", isrc: undefined },
      { kind: "url", url: "https://www.deezer.com/track/2", isrc: "USRC22222222" },
    ]);
  });

  it("falls back to `[0]` genres + `100` limit when config keys are missing", async () => {
    fetchMock.mockResolvedValueOnce(chartResponse([]));

    await deezerChartsSource.fetch({}, null);

    expect(fetchMock).toHaveBeenCalledWith("https://api.deezer.com/chart/0/tracks?limit=100");
  });
});

describe("deezerChartsSource manifest", () => {
  it("declares default-enabled, 360min interval, and the canonical id", () => {
    expect(deezerChartsSource.id).toBe("deezer-charts");
    expect(deezerChartsSource.defaultEnabled).toBe(true);
    expect(deezerChartsSource.defaultIntervalMinutes).toBe(360);
    expect(deezerChartsSource.defaultConfig).toEqual({
      genres: [0, 132, 116, 152, 113, 165, 153, 144, 75, 84, 464],
      limit: 100,
    });
  });
});
