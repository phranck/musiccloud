import { afterEach, describe, expect, it, vi } from "vitest";
import { applyShareIslandMarkers, watchShareIslandMarkers } from "./share-island-document";

/** Adds the markup a server island leaves, as the island loader would insert it. */
function insertIsland(markup: string): void {
  const island = document.createElement("div");
  island.innerHTML = markup;
  document.body.appendChild(island);
}

afterEach(() => {
  document.body.replaceChildren();
  document.head.querySelectorAll('link[rel="preload"]').forEach((link) => link.remove());
  document.title = "";
});

describe("applyShareIslandMarkers", () => {
  it("gives the document the share's title and preloads its artwork", () => {
    insertIsland(
      '<div hidden data-share-document data-title="Teardrop - musiccloud" data-artwork="https://cdn.test/a.jpg"></div>',
    );

    applyShareIslandMarkers(document, { replace: vi.fn() });

    expect(document.title).toBe("Teardrop - musiccloud");
    const preload = document.head.querySelector<HTMLLinkElement>('link[rel="preload"][as="image"]');
    expect(preload?.href).toBe("https://cdn.test/a.jpg");
  });

  it("sends a missing share to the 404 page", () => {
    const location = { replace: vi.fn() };
    insertIsland("<div hidden data-share-not-found></div>");

    applyShareIslandMarkers(document, location);

    expect(location.replace).toHaveBeenCalledWith("/404");
  });

  it("acts on a marker once, whatever mutates the document afterwards", () => {
    const location = { replace: vi.fn() };
    insertIsland('<div hidden data-share-document data-title="One"></div>');

    applyShareIslandMarkers(document, location);
    document.title = "changed by the page";
    applyShareIslandMarkers(document, location);

    expect(document.title).toBe("changed by the page");
  });
});

describe("watchShareIslandMarkers", () => {
  /** The island arrives after the page's own scripts have run. */
  it("acts on a marker that arrives later", async () => {
    watchShareIslandMarkers(document);

    insertIsland('<div hidden data-share-document data-title="Arrived later"></div>');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.title).toBe("Arrived later");
  });
});
