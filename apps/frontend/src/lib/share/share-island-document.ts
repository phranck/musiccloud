/**
 * @file What the deferred share content asks of the document it lands in.
 *
 * A share page opened in a browser renders its content in a server island
 * (`DeferredShareContent.astro`), which arrives after the shell. The island
 * cannot carry a script of its own, because its markup comes from a separate
 * response whose inline scripts the page's content policy does not name. It
 * leaves a hidden marker instead, and this module, bundled into the page,
 * acts on it: it sends a missing share to the 404 page, or gives the
 * document its title and preloads the artwork.
 */

/** The marker of a share that does not exist. */
const SHARE_NOT_FOUND_SELECTOR = "[data-share-not-found]";

/** The marker that carries the share's title and artwork. */
const SHARE_DOCUMENT_SELECTOR = "[data-share-document]";

/** Set on a marker once it has been acted on, so a later mutation leaves it alone. */
const APPLIED_ATTRIBUTE = "data-share-applied";

/** The address a missing share is sent to. */
const NOT_FOUND_PATH = "/404";

/**
 * Acts on every marker in the document that has not been acted on yet.
 *
 * @param doc - The document the island landed in.
 * @param location - Where a missing share is sent from, replaceable in tests.
 */
export function applyShareIslandMarkers(doc: Document, location: Pick<Location, "replace">): void {
  if (doc.querySelector(`${SHARE_NOT_FOUND_SELECTOR}:not([${APPLIED_ATTRIBUTE}])`)) {
    doc.querySelector(SHARE_NOT_FOUND_SELECTOR)?.setAttribute(APPLIED_ATTRIBUTE, "");
    location.replace(NOT_FOUND_PATH);
    return;
  }
  for (const marker of doc.querySelectorAll<HTMLElement>(`${SHARE_DOCUMENT_SELECTOR}:not([${APPLIED_ATTRIBUTE}])`)) {
    marker.setAttribute(APPLIED_ATTRIBUTE, "");
    const { title, artwork } = marker.dataset;
    if (title) doc.title = title;
    if (artwork) {
      const preload = doc.createElement("link");
      preload.setAttribute("rel", "preload");
      preload.setAttribute("as", "image");
      preload.setAttribute("href", artwork);
      doc.head.appendChild(preload);
    }
  }
}

/**
 * Acts on the markers already present and on every one that arrives later,
 * including after a client-side navigation to another share page. The
 * observer sits on the document, which survives the navigation's swap of the
 * `<html>` and `<body>` elements.
 *
 * @param doc - The document to watch.
 */
export function watchShareIslandMarkers(doc: Document = document): void {
  applyShareIslandMarkers(doc, doc.defaultView?.location ?? location);
  new MutationObserver(() => applyShareIslandMarkers(doc, doc.defaultView?.location ?? location)).observe(doc, {
    childList: true,
    subtree: true,
  });
}
