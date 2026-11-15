import { fireEvent, render, screen } from "@testing-library/react";
import gsap from "gsap";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SongInfo } from "@/components/cards/SongInfo";
import { ShareMediaView } from "@/components/share/ShareMediaView.types";
import { Turntable } from "@/components/vinyl/Turntable";
import { VinylSpinState } from "@/components/vinyl/VinylRecord.types";
import { CoverNudgeProvider } from "@/context/CoverNudgeContext";
import { COVER_NUDGE_SUPPRESSED_KEY, COVER_NUDGE_VISITS_KEY } from "@/lib/share/cover-nudge-state";
import { createLocalStorageMock } from "@/test/localStorageMock";

const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage");

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

afterEach(() => {
  gsap.globalTimeline.getChildren(true, true, true).forEach((animation) => animation.kill());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (originalLocalStorageDescriptor) Object.defineProperty(window, "localStorage", originalLocalStorageDescriptor);
  else Reflect.deleteProperty(window, "localStorage");
  delete document.documentElement.dataset.shareMediaView;
  document.body.replaceChildren();
});

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

describe("SongInfo deck painting", () => {
  /**
   * Safari drops what it painted of a hidden layer, so a deck hidden behind the
   * cover had to be painted in the first frame of every switch to the turntable.
   * `data-deck-painted` keeps it visible behind the cover once a visitor reaches
   * for the toggle, so it is painted once while nothing moves.
   */
  function renderCoverView(shareMediaView: ShareMediaView = ShareMediaView.Cover) {
    return render(
      <SongInfo
        title="Blue Train"
        artist="John Coltrane"
        albumArtUrl="/covers/blue-train.jpg"
        mediaViewToggleLabel="Toggle cover and turntable view"
        onMediaViewToggle={() => {}}
        shareMediaView={shareMediaView}
        turntableStage={turntableStageNode(VinylSpinState.Idle)}
      />,
    );
  }

  it("leaves the deck unpainted until a visitor reaches for the toggle", () => {
    const { container } = renderCoverView();
    expect(container.querySelector(".mc-share-media-screen")).not.toHaveAttribute("data-deck-painted");
  });

  it("paints the deck when the pointer reaches the screen", () => {
    const { container } = renderCoverView();
    const mediaScreen = container.querySelector(".mc-share-media-screen") as HTMLElement;
    fireEvent.pointerOver(mediaScreen);
    expect(mediaScreen).toHaveAttribute("data-deck-painted");
  });

  it("paints the deck when the toggle receives focus", () => {
    const { container } = renderCoverView();
    fireEvent.focus(screen.getByRole("button", { name: "Toggle cover and turntable view" }));
    expect(container.querySelector(".mc-share-media-screen")).toHaveAttribute("data-deck-painted");
  });

  it("keeps the deck painted after the turntable view was shown once", () => {
    const { container, rerender } = renderCoverView(ShareMediaView.Turntable);
    rerender(
      <SongInfo
        title="Blue Train"
        artist="John Coltrane"
        albumArtUrl="/covers/blue-train.jpg"
        mediaViewToggleLabel="Toggle cover and turntable view"
        onMediaViewToggle={() => {}}
        shareMediaView={ShareMediaView.Cover}
        turntableStage={turntableStageNode(VinylSpinState.Idle)}
      />,
    );
    expect(container.querySelector(".mc-share-media-screen")).toHaveAttribute("data-deck-painted");
  });
});

describe("SongInfo cover nudge", () => {
  interface NudgeViewOptions {
    strict?: boolean;
    view?: ShareMediaView;
    reducedMotion?: boolean;
    visits?: string;
    storageGetterThrows?: boolean;
    nudgeRequested?: boolean;
  }

  function renderNudgeView(options: NudgeViewOptions = {}) {
    const storage = createLocalStorageMock();
    if (options.visits !== undefined) storage.setItem(COVER_NUDGE_VISITS_KEY, options.visits);
    vi.stubGlobal("localStorage", storage);
    if (options.storageGetterThrows) {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        get: () => {
          throw new Error("storage blocked");
        },
      });
    }
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: query === "(prefers-reduced-motion: reduce)" ? options.reducedMotion === true : false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    const onMediaViewToggle = vi.fn();
    const onNudgeComplete = vi.fn();
    const content = (
      <CoverNudgeProvider requested={options.nudgeRequested === true} onComplete={onNudgeComplete}>
        <SongInfo
          title="Blue Train"
          artist="John Coltrane"
          albumArtUrl="/covers/blue-train.jpg"
          mediaViewToggleLabel="Toggle cover and turntable view"
          onMediaViewToggle={onMediaViewToggle}
          shareMediaView={options.view ?? ShareMediaView.Cover}
          turntableStage={turntableStageNode(VinylSpinState.Idle)}
        />
      </CoverNudgeProvider>
    );
    const result = render(options.strict ? <StrictMode>{content}</StrictMode> : content);
    const stage = result.container.querySelector<HTMLElement>("[data-media-stage='cover']");
    expect(stage).not.toBeNull();
    return { ...result, storage, stage: stage!, onMediaViewToggle, onNudgeComplete };
  }

  it("starts the swipe timeline when the page owner requests it", () => {
    const { storage, stage } = renderNudgeView({ visits: "1", nudgeRequested: true });

    expect(storage.getItem(COVER_NUDGE_VISITS_KEY)).toBe("1");
    expect(gsap.getTweensOf(stage).length).toBeGreaterThan(0);
  });

  it("stops the nudge and calls the view toggle when the cover is clicked", () => {
    const { stage, onMediaViewToggle } = renderNudgeView({ visits: "1", nudgeRequested: true });

    fireEvent.click(screen.getByRole("button", { name: "Toggle cover and turntable view" }));

    expect(onMediaViewToggle).toHaveBeenCalledOnce();
    expect(gsap.getTweensOf(stage)).toHaveLength(0);
    expect(stage.style.transform).toBe("");
    expect(stage.style.transition).toBe("");
  });

  it("does not consume a visit when the turntable is restored", () => {
    const { storage, stage } = renderNudgeView({ view: ShareMediaView.Turntable, visits: "1", nudgeRequested: true });

    expect(storage.getItem(COVER_NUDGE_VISITS_KEY)).toBe("1");
    expect(gsap.getTweensOf(stage)).toHaveLength(0);
    expect(storage.getItem(COVER_NUDGE_SUPPRESSED_KEY)).toBeNull();
  });

  it("does not consume a visit when reduced motion is requested", () => {
    const { storage, stage } = renderNudgeView({ reducedMotion: true, visits: "1", nudgeRequested: true });

    expect(storage.getItem(COVER_NUDGE_VISITS_KEY)).toBe("1");
    expect(gsap.getTweensOf(stage)).toHaveLength(0);
  });

  it("rebuilds a pending nudge after the StrictMode effect replay", () => {
    const { stage } = renderNudgeView({ strict: true, visits: "1", nudgeRequested: true });

    expect(gsap.getTweensOf(stage).length).toBeGreaterThan(0);
  });

  it("keeps the view toggle usable when the localStorage getter throws", () => {
    const { onMediaViewToggle } = renderNudgeView({ visits: "1", storageGetterThrows: true, nudgeRequested: true });

    fireEvent.click(screen.getByRole("button", { name: "Toggle cover and turntable view" }));

    expect(onMediaViewToggle).toHaveBeenCalledOnce();
  });

  it("lets the owner consume a completed nudge without suppressing future visits", () => {
    const { stage, onNudgeComplete } = renderNudgeView({ nudgeRequested: true });
    const activeTween = gsap.getTweensOf(stage)[0];

    activeTween?.parent?.progress(1, false);

    expect(onNudgeComplete).toHaveBeenCalledOnce();
  });
});
