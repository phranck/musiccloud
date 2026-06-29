import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SongInfo } from "@/components/cards/SongInfo";
import { ShareMediaView } from "@/components/share/ShareMediaView.types";
import { Turntable } from "@/components/vinyl/Turntable";
import { VinylSpinState } from "@/components/vinyl/VinylRecord.types";

/**
 * The deck node `MediaCardHead` hands to `SongInfo` for the turntable view. The
 * prop-driven `Turntable` is used here (no hub needed) with the LP label fields
 * `MediaCardHead` would derive from the resolved content.
 *
 * @param spinState - Visual spin state for the embedded vinyl record.
 * @returns The turntable deck node.
 */
function turntableStageNode(spinState: VinylSpinState) {
  return (
    <Turntable
      className="h-full w-full"
      record={{
        className: "h-full w-full",
        labelArtworkUrl: "/covers/blue-train.jpg",
        labelCatalogText: "STEREO MC-1958",
        labelSubtitle: "John Coltrane",
        labelTitle: "Blue Train",
        labelYear: "1958",
        spinState,
      }}
    />
  );
}

describe("SongInfo media stage", () => {
  it("slides from cover stage to turntable stage and shows the supplied turntable deck", () => {
    const { container, rerender } = render(
      <SongInfo
        title="Blue Train"
        artist="John Coltrane"
        album="Blue Train"
        albumArtUrl="/covers/blue-train.jpg"
        shareMediaView={ShareMediaView.Cover}
        turntableStage={turntableStageNode(VinylSpinState.Idle)}
      />,
    );

    expect(container.querySelector(".mc-tft-screen")).toHaveClass("mc-share-media-screen");
    expect(container.querySelector(".mc-tft-screen")).toHaveAttribute("data-tft-matrix", "on");
    expect(container.querySelector(".mc-tft-screen-matrix")).toBeInTheDocument();
    expect(container.querySelector("[data-media-stage='cover']")).toHaveClass(
      "mc-share-media-stage",
      "mc-share-media-stage--cover-active",
    );
    // The turntable layer is fixed (no slide class); only the cover slides over it.
    expect(container.querySelector("[data-media-stage='turntable']")).toHaveClass("mc-share-media-stage");
    expect(container.querySelector("[data-media-stage='turntable']")).not.toHaveClass(
      "mc-share-media-stage--turntable-enter",
    );

    rerender(
      <SongInfo
        title="Blue Train"
        artist="John Coltrane"
        album="Blue Train"
        albumArtUrl="/covers/blue-train.jpg"
        shareMediaView={ShareMediaView.Turntable}
        turntableStage={turntableStageNode(VinylSpinState.Playing)}
      />,
    );

    expect(container.querySelector(".mc-tft-screen")).toHaveAttribute("data-tft-matrix", "off");
    expect(container.querySelector(".mc-tft-screen-matrix")).not.toBeInTheDocument();
    expect(container.querySelector(".mc-tft-screen-tint")).not.toBeInTheDocument();
    expect(container.querySelector(".mc-tft-screen-sheen")).not.toBeInTheDocument();
    expect(container.querySelector(".mc-tft-screen-shadow")).not.toBeInTheDocument();
    // Turntable view: the cover slides out (cover-exit); the turntable stays fixed.
    expect(container.querySelector("[data-media-stage='cover']")).toHaveClass("mc-share-media-stage--cover-exit");
    expect(container.querySelector("[data-media-stage='turntable']")).toHaveClass("mc-share-media-stage");
    expect(container.querySelector("[data-media-stage='turntable']")).not.toHaveClass(
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
