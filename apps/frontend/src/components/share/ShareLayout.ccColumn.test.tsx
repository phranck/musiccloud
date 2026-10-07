import type { ArtistInfoResponse } from "@musiccloud/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShareLayout } from "@/components/share/ShareLayout";
import { MediaCardContentTypeValue, type ShareContentConfiguration } from "@/lib/types/media-card";
import { createLocalStorageMock } from "@/test/localStorageMock";

// The real `useArtistInfo` runs here; only what renders around it is stubbed.
vi.mock("@/components/cards/SongInfo", () => ({
  SongInfo: ({ statusLine, title }: { statusLine?: string; title: string }) => (
    <div data-testid="song-info" data-status-line={statusLine ?? ""}>
      {title}
    </div>
  ),
}));

vi.mock("@/components/share/AnimatedArtistColumn", () => ({
  AnimatedArtistColumn: ({ onTrackResolve }: { onTrackResolve: (track: unknown) => Promise<void> }) => (
    <button
      data-testid="popular-track"
      onClick={() => void onTrackResolve({ title: "Glitter Bomb", artists: ["Juanitos"], deezerUrl: "jamendo:309780" })}
      type="button"
    />
  ),
}));

vi.mock("@/components/share/MobileArtistSheet", () => ({ MobileArtistSheet: () => null }));
vi.mock("@/components/cards/ServicesCard", () => ({ ServicesCard: () => null }));
vi.mock("@/components/cards/EmbossedCard", () => ({
  EmbossedCard: ({ children }: { children: ReactNode }) => <section>{children}</section>,
}));
vi.mock("@/lib/resolve/preload-media", () => ({ preloadResolvedMedia: () => Promise.resolve() }));

const ARTIST_COLUMN: ArtistInfoResponse = {
  artistName: "Juanitos",
  topTracks: [
    {
      title: "Glitter Bomb",
      artists: ["Juanitos"],
      albumName: "Best Of",
      artworkUrl: null,
      durationMs: 156000,
      deezerUrl: "jamendo:309780",
      shortId: null,
    },
  ],
  profile: null,
  events: [],
  similarArtistTracks: [],
};

const ARTIST_PAGE_CONFIG: ShareContentConfiguration = {
  type: MediaCardContentTypeValue.Share,
  title: "Juanitos",
  artist: "",
  artworkUrl: "",
  platforms: [],
  platformsLabel: "View on",
  shortUrl: "https://musiccloud.local/lwo02WYT",
};

const TRACK_CONFIG: ShareContentConfiguration = {
  ...ARTIST_PAGE_CONFIG,
  title: "Glitter Bomb",
  artist: "Juanitos",
  album: "Best Of",
  ccJamendoArtistId: "5261",
  shortUrl: "https://musiccloud.local/iJu7jJkJ",
};

beforeEach(() => {
  vi.stubGlobal("localStorage", createLocalStorageMock());
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: query.includes("min-width"),
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as unknown as MediaQueryList,
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ShareLayout on a Creative Commons artist page", () => {
  /**
   * The artist page opens with a pre-built column and no `ccJamendoArtistId`.
   * A clicked popular track carries one, which raises the loading status, so
   * the column has to load for that artist; otherwise nothing ever clears the
   * status and the card reads "ARTIST DATA LOADING..." for good.
   */
  it("loads the column for the clicked track's artist and leaves the loading status", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(ARTIST_COLUMN), { headers: { "Content-Type": "application/json" } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const trackResolver = vi.fn().mockResolvedValue({
      shortUrl: TRACK_CONFIG.shortUrl,
      config: TRACK_CONFIG,
      artistName: "Juanitos",
    });

    render(
      <ShareLayout
        config={ARTIST_PAGE_CONFIG}
        artistName="Juanitos"
        artistData={ARTIST_COLUMN}
        trackResolver={trackResolver}
        animated={false}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("song-info")).toHaveAttribute("data-status-line", "ARTIST DATA READY"),
    );
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("popular-track"));

    await waitFor(() => expect(screen.getByTestId("song-info")).toHaveTextContent("Glitter Bomb"));
    await waitFor(() =>
      expect(screen.getByTestId("song-info").getAttribute("data-status-line")).not.toBe("ARTIST DATA LOADING..."),
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("jamendoArtistId=5261");
  });
});
