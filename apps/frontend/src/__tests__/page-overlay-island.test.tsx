import type { PublicContentPage } from "@musiccloud/shared";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PageOverlayIsland } from "@/components/layout/PageOverlayIsland";
import { initialOverlayState } from "@/context/OverlayContext";

const originalMatchMedia = window.matchMedia;

function createLocalStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: vi.fn(() => store.clear()),
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(store.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => store.delete(key)),
    setItem: vi.fn((key: string, value: string) => store.set(key, value)),
  };
}

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function page(overrides: Partial<PublicContentPage> = {}): PublicContentPage {
  return {
    slug: "info",
    title: "Info",
    showTitle: true,
    titleAlignment: "center",
    pageType: "segmented",
    displayMode: "embossed",
    overlayWidth: "regular",
    contentCardStyle: "default",
    content: "",
    contentHtml: "",
    segments: [
      {
        label: "Segment",
        targetSlug: "help",
        title: "Help",
        showTitle: true,
        content: "# Help",
        contentHtml: "<p>Help</p>",
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", createLocalStorageMock());
  class ResizeObserverMock {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PageOverlayIsland mobile segmented overlays", () => {
  it("renders segmented overlays as non-draggable fullscreen frames on mobile", async () => {
    mockMatchMedia(true);

    render(<PageOverlayIsland initialPage={page()} />);

    await screen.findByText("Info");
    const frame = document.querySelector<HTMLElement>('[data-overlay-frame-mode="fullscreen"]');
    expect(frame).not.toBeNull();
    expect(frame?.style.left).toBe("0px");
    expect(frame?.style.top).toBe("0px");
    expect(frame?.style.width).toBe("100vw");
    expect(frame?.style.height).toBe("100dvh");
    await waitFor(() => expect(document.querySelector(".overlay-drag-handle")).toBeNull());
    expect(document.querySelectorAll("[data-overlay-resize-handle]")).toHaveLength(0);
  });

  it("keeps drag and resize affordances for segmented overlays on desktop", async () => {
    mockMatchMedia(false);

    render(<PageOverlayIsland initialPage={page()} />);

    await screen.findByText("Info");
    expect(document.querySelector('[data-overlay-frame-mode="windowed"]')).not.toBeNull();
    expect(document.querySelector(".overlay-drag-handle")).not.toBeNull();
    expect(document.querySelectorAll("[data-overlay-resize-handle]")).toHaveLength(8);
  });
});

describe("PageOverlayIsland section deep-link via hash", () => {
  it("opens the segment whose targetSlug matches the URL hash", async () => {
    mockMatchMedia(false);
    window.location.hash = "#services";
    const p = page({
      segments: [
        {
          label: "About",
          targetSlug: "about",
          title: "About",
          showTitle: true,
          content: "",
          contentHtml: "<p>about-body</p>",
        },
        {
          label: "Services",
          targetSlug: "services",
          title: "Services",
          showTitle: true,
          content: "",
          contentHtml: "<p>services-body</p>",
        },
      ],
    });
    render(<PageOverlayIsland initialPage={p} />);
    await screen.findByText("services-body");
    expect(screen.queryByText("about-body")).toBeNull();
    window.location.hash = "";
  });
});

describe("initialOverlayState (direct-load close target)", () => {
  it("records the landing page as the previous URL for a directly-opened overlay", () => {
    // initialPage is only ever set on a direct SSR load of an overlay page, so
    // closing must return to the landing page rather than stay on e.g. /info.
    // The path is moved away from "/" so this assertion would fail against the
    // previous (current-URL) behaviour, not just pass by jsdom default.
    window.history.replaceState({}, "", "/info");
    const state = initialOverlayState(page({ pageType: "default", segments: [] }));
    expect(state.page).not.toBeNull();
    expect(state.previousUrl).toBe("/");
    window.history.replaceState({}, "", "/");
  });

  it("does not treat a fullscreen page as an overlay", () => {
    const state = initialOverlayState(page({ displayMode: "fullscreen" }));
    expect(state.page).toBeNull();
  });
});
