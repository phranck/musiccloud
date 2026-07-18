import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShareLayout } from "@/components/share/ShareLayout";
import { MediaCardContentTypeValue, type ShareContentConfiguration } from "@/lib/types/media-card";
import { createLocalStorageMock } from "@/test/localStorageMock";

vi.mock("@/components/cards/SongInfo", () => ({
  SongInfo: ({
    shareMediaView,
    previewStatus,
    statusLine,
    title,
    mediaViewToggleLabel,
    onMediaViewToggle,
  }: {
    shareMediaView?: string;
    previewStatus?: string | null;
    statusLine?: string;
    title: string;
    mediaViewToggleLabel?: string;
    onMediaViewToggle?: () => void;
  }) => (
    <button
      aria-label={mediaViewToggleLabel}
      data-testid="song-info-props"
      data-media-view-toggle="true"
      data-media-view={shareMediaView}
      data-preview-status={previewStatus ?? "none"}
      data-status-line={statusLine ?? ""}
      onClick={onMediaViewToggle}
      type="button"
    >
      {title}
    </button>
  ),
}));

// The turntable hub (provider + analyzer slot) owns the audio engine; the
// ShareLayout test only asserts the media-view/status responsibilities, so the
// player is stubbed to avoid mounting the real audio engine.
vi.mock("@/components/turntable/TurntableAnalyzerSlot", () => ({
  TurntableAnalyzerSlot: () => null,
}));

vi.mock("@/components/share/AnimatedArtistColumn", () => ({
  AnimatedArtistColumn: () => <div data-testid="artist-column" />,
}));

vi.mock("@/components/share/MobileArtistSheet", () => ({
  MobileArtistSheet: () => null,
}));

vi.mock("@/components/cards/ServicesCard", () => ({
  ServicesCard: () => <div data-testid="services-card" />,
}));

vi.mock("@/components/cards/EmbossedCard", () => ({
  EmbossedCard: ({ children }: { children: ReactNode }) => <section>{children}</section>,
}));

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

const SHARE_CONFIG: ShareContentConfiguration = {
  type: MediaCardContentTypeValue.Share,
  title: "Blue Train",
  artist: "John Coltrane",
  album: "Blue Train",
  artworkUrl: "/covers/blue-train.jpg",
  platforms: [],
  platformsLabel: "Platforms",
  previewUrl: "/preview.mp3",
  shortUrl: "https://musiccloud.local/s/blue",
  shortId: "blue",
};

function renderShareLayout(extra?: ReactNode) {
  return render(
    <>
      {extra}
      <ShareLayout config={SHARE_CONFIG} artistName="John Coltrane" animated={false} />
    </>,
  );
}

function mediaViews() {
  return screen.getAllByTestId("song-info-props").map((node) => node.getAttribute("data-media-view"));
}

function expectMediaView(view: string) {
  expect(mediaViews()).toEqual([view]);
}

beforeEach(() => {
  delete document.documentElement.dataset.shareMediaView;
  vi.stubGlobal("localStorage", createLocalStorageMock());
  // jsdom has no matchMedia. Stub it so useMediaQuery resolves a viewport: the
  // min-width (desktop) query matches, everything else (reduced-motion, etc.)
  // does not — so ShareLayout renders ONLY the desktop layout, never both.
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
  vi.useRealTimers();
  delete document.documentElement.dataset.shareMediaView;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ShareLayout media view toggle", () => {
  it("shows the rendered Discogs side and its track count in the VFD status", async () => {
    render(
      <ShareLayout
        config={{
          ...SHARE_CONFIG,
          vinylLayout: {
            discogsReleaseId: "10013707",
            sides: [
              {
                label: "A",
                tracks: [
                  { durationMs: 664000, position: "A1", title: "Moment Of Truth" },
                  { durationMs: 322000, position: "A2", title: "Blue Train" },
                ],
              },
            ],
          },
        }}
        artistName="John Coltrane"
        animated={false}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("song-info-props")).toHaveAttribute(
        "data-status-line",
        "ARTIST DATA READY · SIDE A · 2 TRACKS",
      ),
    );
  });

  it("renders only the viewport-matching layout, never both", () => {
    renderShareLayout();
    // Desktop viewport (matchMedia min-width matches) → exactly one media card,
    // not one per layout. The non-matching layout must not be in the DOM.
    expect(screen.getAllByTestId("song-info-props")).toHaveLength(1);
  });

  it("starts in cover view and toggles the active layout's media props with P", () => {
    renderShareLayout();

    expectMediaView("cover");

    fireEvent.keyDown(window, { key: "p" });
    expectMediaView("turntable");

    fireEvent.keyDown(window, { key: "P" });
    expectMediaView("cover");
  });

  it("toggles the active media view when the visible cover or turntable surface is clicked", () => {
    renderShareLayout();

    expectMediaView("cover");
    fireEvent.click(screen.getByRole("button", { name: "Toggle cover and turntable view" }));
    expectMediaView("turntable");

    fireEvent.click(screen.getByRole("button", { name: "Toggle cover and turntable view" }));
    expectMediaView("cover");
  });

  it("keeps the P shortcut active while the clickable media surface has focus", () => {
    renderShareLayout();
    const surface = screen.getByRole("button", { name: "Toggle cover and turntable view" });
    surface.focus();

    fireEvent.keyDown(surface, { key: "p" });

    expectMediaView("turntable");
  });

  it("restores and persists the selected media view", () => {
    window.localStorage.setItem("musiccloud:share-media-view", "turntable");

    renderShareLayout();

    expectMediaView("turntable");
    expect(document.documentElement.dataset.shareMediaView).toBe("turntable");

    fireEvent.keyDown(window, { key: "p" });

    expectMediaView("cover");
    expect(window.localStorage.getItem("musiccloud:share-media-view")).toBe("cover");
    expect(document.documentElement.dataset.shareMediaView).toBe("cover");
  });

  it("does not toggle from editable or modified keydown targets", () => {
    renderShareLayout(
      <>
        <input data-testid="search-input" />
        <button data-testid="plain-button" type="button">
          button
        </button>
        <a data-testid="plain-link" href="/">
          Musiccloud home
        </a>
        <div contentEditable data-testid="editable" suppressContentEditableWarning>
          editable
        </div>
      </>,
    );

    expectMediaView("cover");

    fireEvent.keyDown(screen.getByTestId("search-input"), { key: "p" });
    fireEvent.keyDown(screen.getByTestId("plain-button"), { key: "p" });
    fireEvent.keyDown(screen.getByTestId("plain-link"), { key: "p" });
    fireEvent.keyDown(screen.getByTestId("editable"), { key: "p" });
    fireEvent.keyDown(window, { ctrlKey: true, key: "p" });
    fireEvent.keyDown(window, { key: "p", repeat: true });

    expectMediaView("cover");
  });
});
