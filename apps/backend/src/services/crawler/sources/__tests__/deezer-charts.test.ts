import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchWithTimeoutMock = vi.hoisted(() => vi.fn());
vi.mock("../../../../lib/infra/fetch.js", () => ({
  fetchWithTimeout: (...args: unknown[]) => fetchWithTimeoutMock(...args),
}));

import { UpstreamUnavailableError } from "../../../../lib/infra/upstream-unavailable.js";
import { deezerChartsSource } from "../deezer-charts.js";

/** The global `fetch` bypasses the outbound address policy, so any call to it fails the test. */
const globalFetchMock = vi.fn(() => {
  throw new Error("The chart source called the global fetch.");
});

beforeEach(() => {
  fetchWithTimeoutMock.mockReset();
  globalFetchMock.mockClear();
  vi.stubGlobal("fetch", globalFetchMock);
  // Drop the 250ms inter-genre throttle to keep tests fast.
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  expect(globalFetchMock).not.toHaveBeenCalled();
});

function chartResponse(tracks: Array<{ link?: string; isrc?: string }>): Response {
  return new Response(JSON.stringify({ data: tracks }), { status: 200 });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("deezerChartsSource.fetch", () => {
  it("emits one URL candidate per chart-track with ISRC propagated", async () => {
    fetchWithTimeoutMock.mockResolvedValueOnce(
      chartResponse([
        { link: "https://www.deezer.com/track/1", isrc: "USRC11111111" },
        { link: "https://www.deezer.com/track/2", isrc: "USRC22222222" },
      ]),
    );

    const result = await deezerChartsSource.fetch({ genres: [0], limit: 100 }, null);

    expect(fetchWithTimeoutMock).toHaveBeenCalledTimes(1);
    expect(fetchWithTimeoutMock).toHaveBeenCalledWith(
      "https://api.deezer.com/chart/0/tracks?limit=100",
      {},
      expect.any(Number),
    );
    expect(result.candidates).toEqual([
      { kind: "url", url: "https://www.deezer.com/track/1", isrc: "USRC11111111" },
      { kind: "url", url: "https://www.deezer.com/track/2", isrc: "USRC22222222" },
    ]);
    expect(result.nextCursor).toBeNull();
  });

  it("bounds the request of every genre with a timeout and concatenates the results", async () => {
    // A fresh Response per call, because a Response body can be read only once.
    fetchWithTimeoutMock.mockImplementation(async () => chartResponse([{ link: "https://www.deezer.com/track/1" }]));

    const result = await deezerChartsSource.fetch({ genres: [0, 132, 116], limit: 50 }, null);

    expect(fetchWithTimeoutMock).toHaveBeenCalledTimes(3);
    for (const [index, genreId] of [0, 132, 116].entries()) {
      expect(fetchWithTimeoutMock).toHaveBeenNthCalledWith(
        index + 1,
        `https://api.deezer.com/chart/${genreId}/tracks?limit=50`,
        {},
        expect.any(Number),
      );
    }
    expect(result.candidates).toHaveLength(3);
  });

  it("fails the run when a genre's request answers with an error status", async () => {
    fetchWithTimeoutMock
      .mockResolvedValueOnce(chartResponse([{ link: "https://www.deezer.com/track/1" }]))
      .mockResolvedValueOnce(new Response("nope", { status: 500 }));

    await expect(deezerChartsSource.fetch({ genres: [0, 132], limit: 100 }, null)).rejects.toBeInstanceOf(
      UpstreamUnavailableError,
    );
  });

  it("fails the run when Deezer refuses the request in an error body, as it does for the quota", async () => {
    fetchWithTimeoutMock.mockResolvedValueOnce(jsonResponse({ error: { code: 4, message: "Quota limit exceeded" } }));

    await expect(deezerChartsSource.fetch({ genres: [0], limit: 100 }, null)).rejects.toThrow(/error 4/);
  });

  it("fails the run when a genre's request does not answer in time", async () => {
    fetchWithTimeoutMock.mockRejectedValueOnce(new DOMException("This operation was aborted", "AbortError"));

    await expect(deezerChartsSource.fetch({ genres: [0], limit: 100 }, null)).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("skips a genre Deezer has no chart for and continues with the rest", async () => {
    fetchWithTimeoutMock
      .mockResolvedValueOnce(jsonResponse({ error: { type: "DataException", message: "no data", code: 800 } }))
      .mockResolvedValueOnce(chartResponse([{ link: "https://www.deezer.com/track/1", isrc: "USRC11111111" }]));

    const result = await deezerChartsSource.fetch({ genres: [9999, 132], limit: 100 }, null);

    expect(result.candidates).toEqual([{ kind: "url", url: "https://www.deezer.com/track/1", isrc: "USRC11111111" }]);
  });

  it("drops tracks without a `link` field but keeps tracks without ISRC", async () => {
    fetchWithTimeoutMock.mockResolvedValueOnce(
      chartResponse([
        { isrc: "USRC11111111" },
        { link: "https://www.deezer.com/track/1" },
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
    fetchWithTimeoutMock.mockResolvedValueOnce(chartResponse([]));

    await deezerChartsSource.fetch({}, null);

    expect(fetchWithTimeoutMock).toHaveBeenCalledWith(
      "https://api.deezer.com/chart/0/tracks?limit=100",
      {},
      expect.any(Number),
    );
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
