import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SongInfo } from "@/components/cards/SongInfo";
import { ShareMediaView } from "@/components/share/ShareMediaView.types";
import { VinylSpinState } from "@/components/vinyl/VinylRecord.types";

describe("SongInfo media stage", () => {
  it("slides from cover stage to turntable stage and uses structured LP label fields", () => {
    const { container, rerender } = render(
      <SongInfo
        title="Blue Train"
        artist="John Coltrane"
        album="Blue Train"
        albumArtUrl="/covers/blue-train.jpg"
        labelAlbumTitle="Blue Train"
        labelCatalogText="STEREO MC-1958"
        labelReleaseYear="1958"
        shareMediaView={ShareMediaView.Cover}
      />,
    );

    expect(container.querySelector(".mc-tft-screen")).toHaveClass("mc-share-media-screen");
    expect(container.querySelector(".mc-tft-screen")).toHaveAttribute("data-tft-matrix", "on");
    expect(container.querySelector(".mc-tft-screen-matrix")).toBeInTheDocument();
    expect(container.querySelector("[data-media-stage='cover']")).toHaveClass(
      "mc-share-media-stage",
      "mc-share-media-stage--cover-active",
    );
    expect(container.querySelector("[data-media-stage='turntable']")).toHaveClass(
      "mc-share-media-stage",
      "mc-share-media-stage--turntable-enter",
    );

    rerender(
      <SongInfo
        title="Blue Train"
        artist="John Coltrane"
        album="Blue Train"
        albumArtUrl="/covers/blue-train.jpg"
        labelAlbumTitle="Blue Train"
        labelCatalogText="STEREO MC-1958"
        labelReleaseYear="1958"
        shareMediaView={ShareMediaView.Turntable}
        vinylSpinState={VinylSpinState.Playing}
      />,
    );

    expect(container.querySelector(".mc-tft-screen")).toHaveAttribute("data-tft-matrix", "off");
    expect(container.querySelector(".mc-tft-screen-matrix")).not.toBeInTheDocument();
    expect(container.querySelector(".mc-tft-screen-tint")).not.toBeInTheDocument();
    expect(container.querySelector(".mc-tft-screen-sheen")).not.toBeInTheDocument();
    expect(container.querySelector(".mc-tft-screen-shadow")).not.toBeInTheDocument();
    expect(container.querySelector("[data-media-stage='cover']")).toHaveClass("mc-share-media-stage--cover-exit");
    expect(container.querySelector("[data-media-stage='turntable']")).toHaveClass(
      "mc-share-media-stage--turntable-active",
    );
    expect(screen.getByLabelText("Turntable")).toBeInTheDocument();
    expect(screen.getByLabelText("Vinyl record for Blue Train")).toBeInTheDocument();
    expect(container.querySelector("[data-spin-state='playing']")).toBeInTheDocument();
    expect(screen.getByText("John Coltrane")).toBeInTheDocument();
    expect(screen.getByText("1958")).toBeInTheDocument();
    expect(screen.getByText("STEREO MC-1958")).toBeInTheDocument();
  });
});
