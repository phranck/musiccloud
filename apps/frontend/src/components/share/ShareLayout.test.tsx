import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShareLayout } from "@/components/share/ShareLayout";
import { MediaCardContentTypeValue, type ShareContentConfiguration } from "@/lib/types/media-card";
import { createLocalStorageMock } from "@/test/localStorageMock";

vi.mock("@/components/cards/SongInfo", () => ({
  SongInfo: ({
    shareMediaView,
    previewStatus,
    title,
  }: {
    shareMediaView?: string;
    previewStatus?: string | null;
    title: string;
  }) => (
    <div data-testid="song-info-props" data-media-view={shareMediaView} data-preview-status={previewStatus ?? "none"}>
      {title}
    </div>
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
  platformsLabelKey: "share.platforms",
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

function expectAllMediaViews(view: string) {
  expect(mediaViews()).toEqual([view, view]);
}

beforeEach(() => {
  delete document.documentElement.dataset.shareMediaView;
  vi.stubGlobal("localStorage", createLocalStorageMock());
});

afterEach(() => {
  vi.useRealTimers();
  delete document.documentElement.dataset.shareMediaView;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ShareLayout media view toggle", () => {
  it("starts in cover view and toggles desktop and mobile media props with P", () => {
    renderShareLayout();

    expectAllMediaViews("cover");

    fireEvent.keyDown(window, { key: "p" });
    expectAllMediaViews("turntable");

    fireEvent.keyDown(window, { key: "P" });
    expectAllMediaViews("cover");
  });

  it("restores and persists the selected media view", () => {
    window.localStorage.setItem("musiccloud:share-media-view", "turntable");

    renderShareLayout();

    expectAllMediaViews("turntable");
    expect(document.documentElement.dataset.shareMediaView).toBe("turntable");

    fireEvent.keyDown(window, { key: "p" });

    expectAllMediaViews("cover");
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

    expectAllMediaViews("cover");

    fireEvent.keyDown(screen.getByTestId("search-input"), { key: "p" });
    fireEvent.keyDown(screen.getByTestId("plain-button"), { key: "p" });
    fireEvent.keyDown(screen.getByTestId("plain-link"), { key: "p" });
    fireEvent.keyDown(screen.getByTestId("editable"), { key: "p" });
    fireEvent.keyDown(window, { ctrlKey: true, key: "p" });
    fireEvent.keyDown(window, { key: "p", repeat: true });

    expectAllMediaViews("cover");
  });
});
