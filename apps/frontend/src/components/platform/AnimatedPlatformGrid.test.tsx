import { render } from "@testing-library/react";
import gsap from "gsap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnimatedPlatformGrid } from "@/components/platform/AnimatedPlatformGrid";
import { gridCornerStyle } from "@/components/platform/gridCornerStyle";
import type { PlatformLink } from "@/lib/types/platform";

/** jsdom lacks `matchMedia`; the GSAP helpers read reduced-motion through it. */
function stubMatchMedia(reducedMotion = false): void {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: reducedMotion } as MediaQueryList));
}

beforeEach(() => {
  stubMatchMedia();
});

afterEach(() => {
  gsap.globalTimeline.getChildren(true, true, true).forEach((animation) => animation.kill());
  vi.unstubAllGlobals();
});

function link(platform: PlatformLink["platform"]): PlatformLink {
  return { platform, url: `https://example.test/${platform}` };
}

/** Reads the rendered tile labels in DOM (= display) order. */
function renderedLabels(container: HTMLElement): (string | undefined)[] {
  return Array.from(container.querySelectorAll('a[aria-label^="Open "]')).map((a) =>
    a.querySelector("span")?.textContent?.trim(),
  );
}

describe("AnimatedPlatformGrid ordering", () => {
  it("renders platforms by importance/popularity (display order), not alphabetically", () => {
    // Input is deliberately not in display order; alphabetical would put Bandcamp first.
    const platforms = [link("melon"), link("bandcamp"), link("deezer"), link("spotify")];

    const { container } = render(<AnimatedPlatformGrid platforms={platforms} songTitle="Test Track" />);

    expect(renderedLabels(container)).toEqual(["Spotify", "Deezer", "Bandcamp", "Melon"]);
  });

  it("filters out hidden platforms (e.g. MusicBrainz)", () => {
    const platforms = [link("spotify"), link("musicbrainz")];

    const { container } = render(<AnimatedPlatformGrid platforms={platforms} songTitle="Test Track" />);

    expect(renderedLabels(container)).toEqual(["Spotify"]);
  });
});

/** Promoted (full) and interior corner radius expressions, mirroring the grid module. */
const FULL = "var(--neu-radius)";
const INNER = "min(5px, var(--neu-radius))";

describe("gridCornerStyle grouped corners", () => {
  it("promotes the four corners that coincide with the well (full last row)", () => {
    // 10 tiles → 5 full rows; the four grid corners touch the well's corners.
    expect(gridCornerStyle(0, 10).borderTopLeftRadius).toBe(FULL);
    expect(gridCornerStyle(1, 10).borderTopRightRadius).toBe(FULL);
    expect(gridCornerStyle(8, 10).borderBottomLeftRadius).toBe(FULL);
    expect(gridCornerStyle(9, 10).borderBottomRightRadius).toBe(FULL);
  });

  it("keeps the bottom-right interior for a lone last-row tile (odd count)", () => {
    // 9 tiles → the last row holds a single left-column tile (index 8). Its
    // bottom-right does NOT touch the well, so it must stay interior.
    expect(gridCornerStyle(8, 9)).toEqual({
      borderTopLeftRadius: INNER,
      borderTopRightRadius: INNER,
      borderBottomLeftRadius: FULL,
      borderBottomRightRadius: INNER,
    });
  });

  it("keeps all corners interior for an inner tile", () => {
    // index 7 of 9: right column, second-to-last row — no well corner.
    expect(gridCornerStyle(7, 9)).toEqual({
      borderTopLeftRadius: INNER,
      borderTopRightRadius: INNER,
      borderBottomLeftRadius: INNER,
      borderBottomRightRadius: INNER,
    });
  });
});
