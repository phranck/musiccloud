import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
      swapKey="songinfo-test"
    />
  );
}

describe("SongInfo media stage", () => {
  it("exposes the share media surface as a native button toggle", () => {
    const onMediaViewToggle = vi.fn();
    render(
      <SongInfo
        title="Blue Train"
        artist="John Coltrane"
        albumArtUrl="/covers/blue-train.jpg"
        mediaViewToggleLabel="Toggle cover and turntable view"
        onMediaViewToggle={onMediaViewToggle}
        shareMediaView={ShareMediaView.Cover}
        turntableStage={turntableStageNode(VinylSpinState.Idle)}
      />,
    );

    const surface = screen.getByRole("button", { name: "Toggle cover and turntable view" });
    expect(surface.tagName).toBe("BUTTON");
    fireEvent.click(surface);

    expect(onMediaViewToggle).toHaveBeenCalledOnce();
  });

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

    // The cover stage is the TftScreen compound itself; the screen frame around
    // it carries `mc-share-media-screen`.
    expect(container.querySelector(".mc-share-media-screen")).toBeInTheDocument();
    expect(container.querySelector("[data-media-stage='cover']")).toHaveClass("mc-tft-screen");
    // The LCD overlay layers live inside the cover stage so they slide with it.
    expect(container.querySelector("[data-media-stage='cover'] .mc-tft-screen-matrix")).toBeInTheDocument();
    expect(container.querySelector("[data-media-stage='cover'] .mc-tft-screen-sheen")).toBeInTheDocument();
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

    // The LCD layers stay inside the cover stage (sliding out with it), never as
    // a layer over the fixed turntable.
    expect(container.querySelector("[data-media-stage='cover'] .mc-tft-screen-matrix")).toBeInTheDocument();
    expect(container.querySelector("[data-media-stage='turntable'] .mc-tft-screen-matrix")).not.toBeInTheDocument();
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
