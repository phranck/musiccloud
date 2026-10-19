import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAppState } from "@/hooks/useAppState";
import type { DisambiguationCandidate } from "@/lib/types/disambiguation";

const CANDIDATE: DisambiguationCandidate = {
  id: "deezer:3129748",
  title: "Teardrop",
  artists: ["Massive Attack"],
  albumName: "Mezzanine",
};

const TRACK_RESPONSE = {
  type: "track",
  id: "track-1",
  shortUrl: "https://musiccloud.io/teardrop",
  track: {
    title: "Teardrop",
    artists: ["Massive Attack"],
    artistCredits: [{ name: "Massive Attack", role: "main", artistEntityId: "massive-attack" }],
    albumName: "Mezzanine",
    artworkUrl: "",
  },
  links: [],
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
}

/**
 * Answers search and selection at the HTTP boundary without provider traffic.
 * @param shortUrl - Isolated result identity for this test's artist-prefetch key.
 * @returns A fetch mock that also completes the artist-column prefetch.
 */
function candidateRequests(shortUrl = TRACK_RESPONSE.shortUrl) {
  return vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (String(url).startsWith("/api/artist-info")) return jsonResponse({ artistName: "Massive Attack" });
    const body = JSON.parse(String(init?.body ?? "{}")) as { selectedCandidate?: string };
    return body.selectedCandidate
      ? jsonResponse({ ...TRACK_RESPONSE, shortUrl })
      : jsonResponse({ status: "disambiguation", candidates: [CANDIDATE] });
  });
}

function requestedPaths(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map(([url]) => new URL(String(url), "https://musiccloud.test").pathname);
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("useAppState candidate selection", () => {
  it("keeps the resolved short URL as the reload target after the selected result unmounts", async () => {
    window.history.replaceState({ testMarker: "retained" }, "", "/");
    vi.stubGlobal("fetch", candidateRequests("https://musiccloud.io/reload-target"));
    const { result, unmount } = renderHook(() => useAppState());
    await act(() => result.current.handleSubmit("teardrop"));
    await act(() => result.current.handleSelectCandidate(CANDIDATE));

    expect(window.location.pathname).toBe("/reload-target");
    expect(window.history.state).toEqual({ testMarker: "retained" });
    unmount();
    expect(window.location.pathname).toBe("/reload-target");
  });

  it("restores the landing route only when the result has finished clearing", async () => {
    vi.stubGlobal("fetch", candidateRequests("https://musiccloud.io/return-target"));
    const { result } = renderHook(() => useAppState());
    await act(() => result.current.handleSubmit("teardrop"));
    await act(() => result.current.handleSelectCandidate(CANDIDATE));

    act(() => result.current.handleClear());
    expect(result.current.state.type).toBe("clearing");
    expect(window.location.pathname).toBe("/return-target");
    act(() => result.current.handleClear());
    expect(result.current.state.type).toBe("idle");
    expect(window.location.pathname).toBe("/");
  });

  it("does not rewrite a content overlay route on the initial idle render", () => {
    window.history.replaceState(null, "", "/privacy");
    const { unmount } = renderHook(() => useAppState());
    expect(window.location.pathname).toBe("/privacy");
    unmount();
    expect(window.location.pathname).toBe("/privacy");
  });

  /**
   * The panel's selection animation runs while the request is in flight. The
   * answer waits for the animation, and the artist column's request starts as
   * soon as the answer is in, not once the column has mounted.
   */
  it("applies the answer only after the animation and prefetches the artist column right away", async () => {
    const fetchMock = candidateRequests();
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useAppState());

    await act(() => result.current.handleSubmit("teardrop"));
    expect(result.current.state.type).toBe("disambiguation");

    let finishAnimation!: () => void;
    const animationDone = new Promise<void>((resolve) => {
      finishAnimation = resolve;
    });
    let selection!: Promise<void>;
    act(() => {
      selection = result.current.handleSelectCandidate(CANDIDATE, animationDone);
    });

    await waitFor(() => expect(requestedPaths(fetchMock)).toContain("/api/artist-info"));
    expect(result.current.state.type).toBe("disambiguation_loading");

    await act(async () => {
      finishAnimation();
      await selection;
    });
    expect(result.current.state.type).toBe("result");
  });
});

describe("useAppState Jamendo links", () => {
  /**
   * A Jamendo link belongs to the Creative Commons catalog, so it goes to the CC
   * endpoint unchanged even while the commercial mode is active. The endpoint
   * resolves the linked entity itself.
   */
  it("sends a pasted Jamendo link to the CC endpoint and shows the CC result", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        type: "cc-artist",
        id: "cc-artist-1",
        shortUrl: "https://musiccloud.io/juanitos",
        artist: { jamendoId: "5261", name: "Juanitos", shareUrl: "https://www.jamendo.com/artist/5261", topTracks: [] },
        artistInfo: { artistName: "Juanitos", topTracks: [], profile: null, events: [], similarArtistTracks: [] },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useAppState());

    await act(() => result.current.handleSubmit("https://www.jamendo.com/de/artist/5261"));

    expect(requestedPaths(fetchMock)).toEqual(["/api/cc/resolve"]);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      query: "https://www.jamendo.com/de/artist/5261",
    });
    expect(result.current.state.type).toBe("cc-result");
  });
});

describe("useAppState in-flight requests", () => {
  function deferredResponse() {
    let respond!: (body: unknown) => void;
    const response = new Promise<Response>((resolve) => {
      respond = (body) => resolve(jsonResponse(body));
    });
    return { response, respond };
  }

  /** Mirrors the browser: an aborted fetch rejects with an AbortError. */
  function abortable(response: Promise<Response>, init?: RequestInit): Promise<Response> {
    return new Promise((resolve, reject) => {
      init?.signal?.addEventListener("abort", () =>
        reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
      );
      response.then(resolve, reject);
    });
  }

  /**
   * Answers do not arrive in order. An older one that lands after a newer
   * request must not replace what the newer one put on screen.
   */
  it("drops the answer of a submit that a newer submit replaced", async () => {
    const slow = deferredResponse();
    const fetchMock = vi
      .fn()
      .mockImplementationOnce((_url: string, init?: RequestInit) => abortable(slow.response, init))
      .mockImplementationOnce(async () => jsonResponse({ status: "disambiguation", candidates: [CANDIDATE] }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useAppState());

    let first!: Promise<void>;
    act(() => {
      first = result.current.handleSubmit("https://www.deezer.com/track/1");
    });
    await act(() => result.current.handleSubmit("teardrop"));
    await act(async () => {
      slow.respond(TRACK_RESPONSE);
      await first;
    });

    expect(result.current.state.type).toBe("disambiguation");
  });

  it.each([
    ["clear", "handleClear"],
    ["back", "handleBack"],
  ] as const)("abandons the running request on %s", async (_label, action) => {
    const slow = deferredResponse();
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => abortable(slow.response, init));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useAppState());

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.handleSubmit("https://www.deezer.com/track/1");
    });
    act(() => {
      result.current[action]();
    });
    const stateAfterLeaving = result.current.state.type;
    await act(async () => {
      slow.respond(TRACK_RESPONSE);
      await pending;
    });

    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(result.current.state.type).toBe(stateAfterLeaving);
    expect(result.current.state.type).not.toBe("error");
  });
});
