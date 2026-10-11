import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NowPlayingTrack } from "@/components/artist/nowPlayingTrack";
import { AudioStatus } from "@/components/audio/AudioStatus";
import { ShareLayout } from "@/components/share/ShareLayout";
import { MediaCardContentTypeValue, type ShareContentConfiguration } from "@/lib/types/media-card";
import { createLocalStorageMock } from "@/test/localStorageMock";

// The media card is a stub whose buttons report a player status, so a test can
// play, pause and end the preview without rendering the audio hub.
vi.mock("@/components/cards/MediaSummaryCard", () => ({
  MediaSummaryCard: ({ onPreviewStatusChange }: { onPreviewStatusChange: (status: string | null) => void }) => (
    <div>
      <button data-testid="player-play" onClick={() => onPreviewStatusChange("playing")} type="button" />
      <button data-testid="player-pause" onClick={() => onPreviewStatusChange("paused")} type="button" />
      <button data-testid="player-end" onClick={() => onPreviewStatusChange("ended")} type="button" />
    </div>
  ),
}));
vi.mock("@/components/share/SharePageCard", async () => {
  const { MediaSummaryCard } = await import("@/components/cards/MediaSummaryCard");
  return { SharePageCard: MediaSummaryCard };
});

// Both artist panels are probes that print what they were handed. The desktop
// column also resolves one fixed row when clicked.
vi.mock("@/components/share/AnimatedArtistColumn", () => ({
  AnimatedArtistColumn: ({
    nowPlaying,
    onTrackResolve,
  }: {
    nowPlaying?: unknown;
    onTrackResolve: (track: unknown) => Promise<void>;
  }) => (
    <button
      data-testid="artist-panel"
      data-now-playing={nowPlaying === undefined ? "missing" : JSON.stringify(nowPlaying)}
      onClick={() =>
        void onTrackResolve({ title: "Moment's Notice", artists: ["John Coltrane"], deezerUrl: "deezer:moment" })
      }
      type="button"
    />
  ),
}));
vi.mock("@/components/share/MobileArtistSheet", () => ({
  MobileArtistSheet: ({ nowPlaying }: { nowPlaying?: unknown }) => (
    <div
      data-testid="artist-panel"
      data-now-playing={nowPlaying === undefined ? "missing" : JSON.stringify(nowPlaying)}
    />
  ),
}));

vi.mock("@/components/cards/ServicesCard", () => ({ ServicesCard: () => null }));
vi.mock("@/lib/resolve/preload-media", () => ({ preloadResolvedMedia: () => Promise.resolve() }));
vi.mock("@/hooks/useArtistInfo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useArtistInfo")>();
  return {
    ...actual,
    useArtistInfo: () => ({
      artistData: null,
      errorCode: null,
      isLoading: false,
      status: actual.ArtistLoadStatus.Ready,
    }),
  };
});

const DEEZER_LINK = "https://www.deezer.com/track/blue-train";

const SHARE_CONFIG: ShareContentConfiguration = {
  type: MediaCardContentTypeValue.Share,
  title: "Blue Train",
  artist: "John Coltrane",
  album: "Blue Train",
  artworkUrl: "/covers/blue-train.jpg",
  platforms: [{ platform: "deezer", url: DEEZER_LINK }],
  platformsLabel: "Platforms",
  previewUrl: "/preview.mp3",
  shortUrl: "https://musiccloud.local/s/blue",
  shortId: "blue",
};

const RESOLVED_CONFIG: ShareContentConfiguration = {
  ...SHARE_CONFIG,
  title: "Moment's Notice",
  platforms: [],
  shortUrl: "https://musiccloud.local/s/moment",
  shortId: "moment",
};

function stubViewport(desktop: boolean) {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: desktop && query.includes("min-width"),
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as unknown as MediaQueryList,
  );
}

function nowPlaying(): NowPlayingTrack | null {
  return JSON.parse(screen.getByTestId("artist-panel").getAttribute("data-now-playing") ?? "missing");
}

beforeEach(() => {
  vi.stubGlobal("localStorage", createLocalStorageMock());
  stubViewport(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ShareLayout hands the artist panel the track the player holds", () => {
  it("while it plays or pauses, and nothing before or after", () => {
    render(<ShareLayout config={SHARE_CONFIG} artistName="John Coltrane" animated={false} />);
    expect(nowPlaying()).toBeNull();

    fireEvent.click(screen.getByTestId("player-play"));
    expect(nowPlaying()).toEqual({
      status: AudioStatus.Playing,
      trackUrls: [DEEZER_LINK],
      shortId: "blue",
      title: "Blue Train",
      artist: "John Coltrane",
    });

    fireEvent.click(screen.getByTestId("player-pause"));
    expect(nowPlaying()?.status).toBe(AudioStatus.Paused);

    fireEvent.click(screen.getByTestId("player-end"));
    expect(nowPlaying()).toBeNull();
  });

  /**
   * A clicked row knows the exact candidate it was resolved from, while the
   * fresh share may carry no link that equals it. A new page from the props
   * starts without one, because the candidate described the previous track.
   */
  it("including the row a track was resolved from, until the page changes", async () => {
    const trackResolver = vi.fn().mockResolvedValue({
      shortUrl: RESOLVED_CONFIG.shortUrl,
      config: RESOLVED_CONFIG,
      artistName: "John Coltrane",
    });
    const { rerender } = render(
      <ShareLayout config={SHARE_CONFIG} artistName="John Coltrane" animated={false} trackResolver={trackResolver} />,
    );
    fireEvent.click(screen.getByTestId("player-play"));

    fireEvent.click(screen.getByTestId("artist-panel"));
    await waitFor(() => expect(nowPlaying()).toBeNull());
    fireEvent.click(screen.getByTestId("player-play"));
    expect(nowPlaying()).toMatchObject({ trackUrls: ["deezer:moment"], shortId: "moment" });

    rerender(<ShareLayout config={{ ...RESOLVED_CONFIG, title: "Lazy Bird" }} artistName="John Coltrane" />);
    fireEvent.click(screen.getByTestId("player-play"));
    expect(nowPlaying()?.trackUrls).toEqual([]);
  });

  it("on a phone as well, where the panel is the bottom sheet", () => {
    stubViewport(false);
    render(<ShareLayout config={SHARE_CONFIG} artistName="John Coltrane" animated={false} />);

    fireEvent.click(screen.getByTestId("player-play"));

    expect(nowPlaying()).toMatchObject({ status: AudioStatus.Playing, shortId: "blue" });
  });
});
