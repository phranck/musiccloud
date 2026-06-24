import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_COVER_FALLBACK_URL } from "@/components/ui/coverFallback";
import { LazyGenreArtwork } from "@/components/ui/LazyGenreArtwork";

/**
 * Fallback contract of `LazyGenreArtwork`. The default `fallbackUrl` is what
 * every failing genre-artwork tile swaps to — when the asset behind it is
 * missing, each of the ~250 grid tiles produces a SECOND 404 on top of the
 * failed artwork request (observed as thousands of console errors during the
 * MC-029 Phase-2 gate). The filesystem check pins the asset's existence;
 * `/og/default.jpg` is also the OG-image fallback the backend serves for
 * artless tracks (`lib/server/og.ts`), so the asset must live in `public/`.
 */

/** The component's default `fallbackUrl` prop (and the backend's OG fallback path). */
const DEFAULT_FALLBACK_PATH = DEFAULT_COVER_FALLBACK_URL;

/** Repo path of the frontend's static assets directory. */
const PUBLIC_DIR = resolve(__dirname, "../../../public");

/** IntersectionObserver stand-in that reports every observed tile as visible immediately. */
class ImmediatelyIntersectingObserver {
  private readonly callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }
  observe(): void {
    this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
  unobserve(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", ImmediatelyIntersectingObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LazyGenreArtwork fallback", () => {
  it("ships the default fallback asset in public/ (a missing file would 404 once per failing tile)", () => {
    expect(existsSync(resolve(PUBLIC_DIR, `.${DEFAULT_FALLBACK_PATH}`))).toBe(true);
  });

  it("swaps a failing artwork to the default fallback exactly once", async () => {
    const { container } = render(<LazyGenreArtwork url="/api/v1/genre-artwork/broken" />);

    const img = await waitFor(() => {
      const el = container.querySelector("img");
      if (!el) throw new Error("img not mounted yet (slot gate pending)");
      return el;
    });
    expect(img.getAttribute("src")).toBe("/api/v1/genre-artwork/broken");

    fireEvent.error(img);
    await waitFor(() => {
      expect(container.querySelector("img")?.getAttribute("src")).toBe(DEFAULT_FALLBACK_PATH);
    });
  });
});
