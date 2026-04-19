import type { PublicContentPage } from "@musiccloud/shared";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { overlayClasses } from "@/components/layout/PageOverlay";
import { EmbossedOverlayContent, TranslucentOverlayContent } from "@/components/layout/PageOverlayContent";
import { OverlayProvider, useOverlay } from "@/context/OverlayContext";
import { LocaleProvider } from "@/i18n/context";
import { cn } from "@/lib/utils";

interface Props {
  initialPage: PublicContentPage | null;
}

// Fade duration in ms — shared by backdrop and card so they come in /
// leave in lockstep.
const TRANSITION_MS = 320;

// Height tween duration on segment-driven content changes. Slightly
// shorter than the open tween so switching feels snappy.
const HEIGHT_TRANSITION_MS = 260;

export function PageOverlayIsland({ initialPage }: Props) {
  return (
    <LocaleProvider>
      <OverlayProvider>
        <OverlayShell initialPage={initialPage} />
      </OverlayProvider>
    </LocaleProvider>
  );
}

function OverlayShell({ initialPage }: Props) {
  const { page, open, close } = useOverlay();

  // `mounted` stays true as long as we should render the overlay DOM.
  // `visible` drives the transition classes; flipped on one frame after
  // mount so the browser paints the "hidden" state first and the opacity
  // / scale tween animates from 0 → 1. On close we flip it to false and
  // unmount after TRANSITION_MS so the reverse tween actually runs.
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `mounted` is an internal flag we intentionally read-only-at-effect-time; depending on it would re-trigger the leave schedule on each tick.
  useEffect(() => {
    if (page && page.displayMode !== "fullscreen") {
      setMounted(true);
      // Paint the hidden state first, then toggle visible on the next
      // frame so the transition engages.
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    }
    // Overlay closed: start the leave transition, unmount after it finishes.
    setVisible(false);
    if (!mounted) return;
    const id = window.setTimeout(() => setMounted(false), TRANSITION_MS);
    return () => window.clearTimeout(id);
  }, [page]);

  // On mount: if the Astro server rendered a content page with overlay mode,
  // open the overlay immediately so the user lands on the deep-linked state.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only effect; inputs (initialPage + open) are stable for the lifetime of this island.
  useEffect(() => {
    if (initialPage && initialPage.displayMode !== "fullscreen") {
      open(initialPage);
    }
  }, []);

  // ESC closes the overlay.
  useEffect(() => {
    if (!page) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [page, close]);

  if (!mounted || !page || page.displayMode === "fullscreen") return null;

  const transitionStyle: React.CSSProperties = { transitionDuration: `${TRANSITION_MS}ms` };

  return (
    <>
      <button
        type="button"
        aria-label="Close overlay"
        onClick={close}
        className={cn(
          "fixed inset-0 z-40 bg-black/40 backdrop-blur-sm cursor-default",
          "transition-opacity ease-out",
          visible ? "opacity-100" : "opacity-0",
        )}
        style={transitionStyle}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none p-4">
        <AnimatedHeightWrapper
          className={cn(
            "pointer-events-auto relative transition-[opacity,transform] ease-out",
            visible ? "opacity-100 scale-100" : "opacity-0 scale-[0.96]",
            overlayClasses(page.displayMode as "embossed" | "translucent", page.overlayWidth, page.overlayHeight),
          )}
          style={transitionStyle}
        >
          {page.displayMode === "translucent" ? (
            <TranslucentOverlayContent page={page} onClose={close} />
          ) : (
            <EmbossedOverlayContent page={page} onClose={close} />
          )}
        </AnimatedHeightWrapper>
      </div>
    </>
  );
}

/**
 * Animates its own height to match the natural height of its children.
 *
 * - Outer element carries the animated `height` + `transition`.
 * - Inner element is measured via `ResizeObserver`; every time content
 *   changes (e.g. the segmented control swaps in a new target's body)
 *   the outer height tweens to the new measurement.
 * - On first mount we paint the measurement before turning on the
 *   transition so the initial open doesn't play an unwanted height
 *   animation on top of the opacity/scale entrance.
 */
function AnimatedHeightWrapper({
  className,
  style,
  children,
}: {
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  const [transitionEnabled, setTransitionEnabled] = useState(false);

  useLayoutEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    const update = () => setHeight(inner.getBoundingClientRect().height);
    update();
    // Enable the transition on the next frame so the initial height
    // commit doesn't animate.
    const id = requestAnimationFrame(() => setTransitionEnabled(true));
    const observer = new ResizeObserver(update);
    observer.observe(inner);
    return () => {
      cancelAnimationFrame(id);
      observer.disconnect();
    };
  }, []);

  const wrapperStyle: React.CSSProperties = {
    ...style,
    height: height !== null ? `${height}px` : undefined,
    transition: transitionEnabled
      ? `opacity ${TRANSITION_MS}ms ease-out, transform ${TRANSITION_MS}ms ease-out, height ${HEIGHT_TRANSITION_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`
      : `opacity ${TRANSITION_MS}ms ease-out, transform ${TRANSITION_MS}ms ease-out`,
  };

  return (
    <div className={className} style={wrapperStyle}>
      <div ref={innerRef}>{children}</div>
    </div>
  );
}
