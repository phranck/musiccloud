import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { DesktopShareLayout } from "@/components/share/DesktopShareLayout";
import { MediaCardContentTypeValue, type ShareContentConfiguration } from "@/lib/types/media-card";

vi.mock("@/components/cards/MediaSummaryCard", () => ({ MediaSummaryCard: () => <div data-testid="media" /> }));
vi.mock("@/components/cards/ServicesCard", () => ({ ServicesCard: () => <div data-testid="services" /> }));
vi.mock("@/components/cards/CcInfoCard", () => ({ CcInfoCard: () => <div data-testid="cc-info" /> }));
vi.mock("@/components/share/AnimatedArtistColumn", () => ({ AnimatedArtistColumn: () => null }));
vi.mock("@/components/share/TwoColumnResultGrid", () => ({
  TwoColumnResultGrid: ({ left }: { left: ReactNode }) => <div>{left}</div>,
}));

const SHARE_CONFIG: ShareContentConfiguration = {
  type: MediaCardContentTypeValue.Share,
  title: "Everybody Loves The Partys",
  artist: "Juanitos",
  artworkUrl: "",
  platforms: [],
  platformsLabel: "",
  shortUrl: "https://musiccloud.local/cc-track",
};

function renderLayout(config: ShareContentConfiguration) {
  render(
    <DesktopShareLayout
      animated={false}
      artistData={null}
      artistLoadStatus="ready"
      config={config}
      isLoading={false}
      labels={{} as never}
      mediaViewToggleLabel=""
      onArtistResolveStart={() => {}}
      onMediaViewToggle={() => {}}
      onPreviewStatusChange={() => {}}
      onTrackResolve={async () => {}}
      previewStatus={null}
      shareMediaView="cover"
      userRegion="AT"
    />,
  );
}

describe("DesktopShareLayout cards", () => {
  /**
   * A Creative Commons track lists Jamendo in the services card like any other
   * result, and its license and download card comes in addition to it.
   */
  it("shows the services card and the CC card for a Creative Commons track", () => {
    renderLayout({ ...SHARE_CONFIG, ccInfoContent: {} as ShareContentConfiguration["ccInfoContent"] });

    expect(screen.getByTestId("services")).toBeTruthy();
    expect(screen.getByTestId("cc-info")).toBeTruthy();
  });

  it("shows only the services card for any other result", () => {
    renderLayout(SHARE_CONFIG);

    expect(screen.getByTestId("services")).toBeTruthy();
    expect(screen.queryByTestId("cc-info")).toBeNull();
  });
});
