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

function requestedPaths(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map(([url]) => new URL(String(url), "https://musiccloud.test").pathname);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useAppState candidate selection", () => {
  /**
   * The panel's selection animation runs while the request is in flight. The
   * answer waits for the animation, and the artist column's request starts as
   * soon as the answer is in, not once the column has mounted.
   */
  it("applies the answer only after the animation and prefetches the artist column right away", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).startsWith("/api/artist-info")) return jsonResponse({ artistName: "Massive Attack" });
      const body = JSON.parse(String(init?.body ?? "{}")) as { selectedCandidate?: string };
      return body.selectedCandidate
        ? jsonResponse(TRACK_RESPONSE)
        : jsonResponse({ status: "disambiguation", candidates: [CANDIDATE] });
    });
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
