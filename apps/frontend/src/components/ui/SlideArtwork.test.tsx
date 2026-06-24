import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SlideArtwork } from "@/components/ui/SlideArtwork";

/**
 * Two-phase loading swap of {@link SlideArtwork} (artist popular/similar rows,
 * disambiguation, genre search). On ENTER the spinning CD drops in while the
 * cover drops out; on EXIT — when the requested data has loaded and `active`
 * flips back off — the CD drops back out while the cover slides in, and the
 * disc is held in the DOM until its exit animation ends so the reverse glide
 * is never skipped.
 *
 * The keyframes themselves are CSS (`mc-disc-drop-*` / `mc-cover-drop-*` in
 * `styles/animations.css`, browser-verified). These tests pin the React
 * mount/unmount + class wiring that drives them.
 */

/** The disc container, mounted only while it is sliding in or out. */
const discEl = (c: HTMLElement) => c.querySelector(".mc-disc-drop-in, .mc-disc-drop-out");
/** The cover layer (the `<img>`'s wrapper). */
const coverEl = (c: HTMLElement) => c.querySelector("img")?.parentElement as HTMLElement;

describe("SlideArtwork loading swap", () => {
  it("renders no disc and a still cover while inactive", () => {
    const { container } = render(<SlideArtwork active={false} artworkUrl="/a.jpg" sizeClass="w-12 h-12" />);
    expect(discEl(container)).toBeNull();
    expect(coverEl(container).className).not.toMatch(/mc-cover-drop/);
  });

  it("drops the disc in and the cover out when a row turns active", () => {
    const { container, rerender } = render(<SlideArtwork active={false} artworkUrl="/a.jpg" sizeClass="w-12 h-12" />);
    rerender(<SlideArtwork active={true} artworkUrl="/a.jpg" sizeClass="w-12 h-12" />);
    expect(discEl(container)?.className).toMatch(/mc-disc-drop-in/);
    expect(coverEl(container).className).toMatch(/mc-cover-drop-out/);
  });

  it("ejects the disc and slides the cover back in on exit, then unmounts the disc after its animation ends", () => {
    const { container, rerender } = render(<SlideArtwork active={true} artworkUrl="/a.jpg" sizeClass="w-12 h-12" />);
    // The data finished loading -> the row turns inactive again.
    rerender(<SlideArtwork active={false} artworkUrl="/a.jpg" sizeClass="w-12 h-12" />);

    const disc = discEl(container);
    expect(disc?.className).toMatch(/mc-disc-drop-out/);
    expect(coverEl(container).className).toMatch(/mc-cover-drop-in/);

    // The disc stays mounted through the exit; its own animationend clears it.
    if (disc) fireEvent.animationEnd(disc);
    expect(discEl(container)).toBeNull();
    expect(coverEl(container).className).not.toMatch(/mc-cover-drop/);
  });
});

/**
 * Flip-id anchor: the cover morph between the list and grid track views matches
 * each cover across the unmount/remount by `data-flip-id`. The id is the shared
 * track key; the attribute must reach the artwork root and stay absent when no
 * id is supplied (so unrelated SlideArtwork usages never join a flip).
 */
describe("SlideArtwork flip id", () => {
  it("emits the flipId as data-flip-id on the artwork root", () => {
    const { container } = render(
      <SlideArtwork active={false} artworkUrl="/a.jpg" sizeClass="w-12 h-12" flipId="abc:123" />,
    );
    expect(container.querySelector('[data-flip-id="abc:123"]')).not.toBeNull();
  });

  it("renders no data-flip-id when flipId is omitted", () => {
    const { container } = render(<SlideArtwork active={false} artworkUrl="/a.jpg" sizeClass="w-12 h-12" />);
    expect(container.querySelector("[data-flip-id]")).toBeNull();
  });
});
