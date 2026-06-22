import { PageType, type PublicContentPage } from "@musiccloud/shared";
import { useCallback, useMemo, useState } from "react";

/**
 * One entry of the segmented-control tab strip. Keyed by the segment's index
 * (as a string) so two segments pointing at the same `targetSlug` keep distinct
 * React keys.
 */
interface SegmentDescriptor {
  key: string;
  label: string;
}

/**
 * Controls whether a content page counts as "segmented" for rendering.
 *
 * The overlay renderers only treat a page as segmented when it is explicitly
 * `pageType === 'segmented'` AND carries at least one segment. The standalone
 * fullscreen renderer ignores `pageType` and keys solely off segment count, so
 * it passes `requirePageType: false`. Hard-coding the page-type check inside the
 * hook would silently break the fullscreen variant — hence the gate stays a
 * parameter.
 */
interface SegmentGate {
  /** When true (default), the page must also be `pageType === 'segmented'`. */
  requirePageType?: boolean;
}

/**
 * Everything the overlay/fullscreen renderers need to draw a (possibly
 * segmented) content page: the resolved markdown, the resolved header title and
 * its visibility, plus the tab-strip wiring.
 */
interface UseSegmentedResult {
  /** True when the page should render as a multi-segment tab strip. */
  isSegmented: boolean;
  /** Tab-strip descriptors; empty when the page is not segmented-rendered. */
  segments: SegmentDescriptor[];
  /** Active segment index, stringified for the segmented-control `value`. */
  active: string;
  /** Active segment index as a number (used for the markdown remount key). */
  activeIndex: number;
  /** Selects a segment by its stringified index; mirrors into the hash when enabled. */
  setActive: (next: string) => void;
  /** Markdown to render: the active segment's HTML, or the page's own HTML. */
  resolvedHtml: string;
  /** Header title after applying the owner/segment title cascade. */
  resolvedTitle: string;
  /** Whether the header title should be shown after applying the cascade. */
  resolvedShowTitle: boolean;
}

/**
 * Resolve the active segment index from the URL hash (`#<targetSlug>`).
 * Overlay content renders only after client mount (`OverlayShell.mounted`
 * starts false on the server), so reading `window.location` here is SSR-safe.
 *
 * @param page - the content page whose `segments` are matched against the hash
 * @returns the index of the segment whose `targetSlug` matches the hash, or 0
 *   when there is no hash, no match, or no window.
 */
function segmentIndexForHash(page: PublicContentPage): number {
  if (typeof window === "undefined") return 0;
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return 0;
  const idx = page.segments.findIndex((s) => s.targetSlug === hash);
  return idx >= 0 ? idx : 0;
}

/**
 * Drives the active segment of a (possibly) segmented content page and resolves
 * everything a renderer needs to draw it. Pure presentation-driving logic kept
 * out of the overlay/fullscreen components.
 *
 * The title cascade for segmented pages: the owner's `showTitle` overrides the
 * target's — when set, the segmented page's own title is shown on every tab.
 * Otherwise the active target's title takes over (if it opts in).
 *
 * @param page - the content page whose `segments` back the tab strip
 * @param options.syncHash - when true, the active section is initialised from
 *   and written back to the URL hash (`#<targetSlug>`) so overlay sections are
 *   deep-linkable / shareable. Standalone fullscreen pages pass false.
 * @param options.segmentGate - whether `pageType === 'segmented'` is required
 *   for the page to render segmented (default `requirePageType: true`).
 * @returns the resolved render state plus segmented-control wiring.
 */
export function useSegmented(
  page: PublicContentPage,
  {
    syncHash = false,
    segmentGate: { requirePageType = true } = {},
  }: { syncHash?: boolean; segmentGate?: SegmentGate } = {},
): UseSegmentedResult {
  // Key segments by their index so two segments pointing at the same
  // target slug keep distinct React keys (otherwise the segmented control
  // collapses them and active state can't be tracked per-segment).
  const segments = useMemo(() => page.segments.map((s, i) => ({ key: String(i), label: s.label })), [page.segments]);
  const [activeIndex, setActiveIndex] = useState<number>(() => (syncHash ? segmentIndexForHash(page) : 0));
  const current = page.segments[activeIndex] ?? page.segments[0];

  const setActive = useCallback(
    (next: string) => {
      const idx = Number.parseInt(next, 10);
      if (Number.isNaN(idx)) return;
      setActiveIndex(idx);
      // Mirror the active section into the URL hash so it can be shared/reloaded.
      // replaceState (not pushState) keeps tab switches out of the history stack,
      // so Back closes the whole overlay instead of stepping tab-by-tab.
      if (syncHash && typeof window !== "undefined") {
        const slug = page.segments[idx]?.targetSlug;
        if (slug) {
          window.history.replaceState(
            window.history.state,
            "",
            `${window.location.pathname}${window.location.search}#${slug}`,
          );
        }
      }
    },
    [syncHash, page.segments],
  );

  const hasSegments = page.segments.length > 0;
  const isSegmented = (requirePageType ? page.pageType === PageType.Segmented : true) && hasSegments;

  const currentHtml = current?.contentHtml ?? "";
  const currentTitle = current?.title ?? page.title;
  const currentShowTitle = current?.showTitle ?? page.showTitle;

  return {
    isSegmented,
    segments,
    active: String(activeIndex),
    activeIndex,
    setActive,
    resolvedHtml: isSegmented ? currentHtml : page.contentHtml,
    resolvedTitle: isSegmented && !page.showTitle ? currentTitle : page.title,
    resolvedShowTitle: isSegmented ? page.showTitle || currentShowTitle : page.showTitle,
  };
}
