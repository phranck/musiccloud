import { render } from "@testing-library/react";
import gsap from "gsap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnimatedPlatformGrid } from "@/components/platform/AnimatedPlatformGrid";
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
