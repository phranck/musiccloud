import { PageDisplayMode, PageType } from "@musiccloud/shared";
import { useEffect, useReducer, useRef } from "react";

import { EmbossedOverlayContent } from "@/components/layout/EmbossedOverlayContent";
import { OverlayFrame } from "@/components/layout/OverlayFrame";
import { TranslucentOverlayContent } from "@/components/layout/TranslucentOverlayContent";
import { OverlayBackdrop } from "@/components/ui/OverlayBackdrop";
import { OVERLAY_TRANSITION_MS, OverlayBackdropPlacement } from "@/components/ui/OverlayBackdropTypes";
import { useOverlay } from "@/context/useOverlay";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useOverlayEscape } from "@/hooks/useOverlayEscape";

const MOBILE_OVERLAY_QUERY = "(max-width: 767px), (pointer: coarse)";

/**
 * The mount/visibility state machine for the overlay frame. `mounted` keeps the
 * overlay DOM rendered (including through the close fade); `visible` drives the
 * enter/leave transition classes.
 */
type OverlayVisibility = { mounted: boolean; visible: boolean };

const OverlayVisibilityActionType = {
  Mount: "mount",
  Show: "show",
  Hide: "hide",
  Unmount: "unmount",
} as const;

type OverlayVisibilityAction =
  | { type: typeof OverlayVisibilityActionType.Mount }
  | { type: typeof OverlayVisibilityActionType.Show }
  | { type: typeof OverlayVisibilityActionType.Hide }
  | { type: typeof OverlayVisibilityActionType.Unmount };

/**
 * Reduce the overlay mount/visibility state.
 *
 * - `Mount` renders the DOM hidden so the browser can paint the "from" frame.
 * - `Show` flips to visible (no-op unless already mounted).
 * - `Hide` starts the leave transition while keeping the DOM mounted.
 * - `Unmount` removes the DOM once the leave transition has run.
 *
 * @param state - the current visibility state
 * @param action - the transition to apply
 * @returns the next visibility state
 */
function overlayVisibilityReducer(state: OverlayVisibility, action: OverlayVisibilityAction): OverlayVisibility {
  switch (action.type) {
    case OverlayVisibilityActionType.Mount:
      return { mounted: true, visible: false };
    case OverlayVisibilityActionType.Show:
      return state.mounted ? { mounted: true, visible: true } : state;
    case OverlayVisibilityActionType.Hide:
      return { ...state, visible: false };
    case OverlayVisibilityActionType.Unmount:
      return { mounted: false, visible: false };
  }
}

/**
 * Bridges the overlay context to the rendered frame. Reads the active page,
 * runs the mount/visibility animation lifecycle, decides whether the frame is a
 * windowed overlay or a non-draggable mobile fullscreen frame, and renders the
 * matching content surface (translucent vs embossed) inside {@link OverlayFrame}.
 */
export function OverlayShell() {
  const { page, close } = useOverlay();
  const isMobileOverlayViewport = useMediaQuery(MOBILE_OVERLAY_QUERY);

  // Retain the last page through the close fade. When `page` goes null the effect
  // below keeps the frame mounted for OVERLAY_TRANSITION_MS so the reverse tween
  // (opacity + scale out) plays; rendering the retained page across that window
  // keeps the content in place while it fades, instead of unmounting on close.
  const lastPageRef = useRef(page);
  if (page) lastPageRef.current = page;
  const renderPage = page ?? lastPageRef.current;

  // `mounted` stays true as long as we should render the overlay DOM.
  // `visible` drives the transition classes; flipped on one frame after
  // mount so the browser paints the "hidden" state first and the opacity
  // / scale tween animates from 0 → 1. On close we flip it to false and
  // unmount after OVERLAY_TRANSITION_MS so the reverse tween actually runs.
  const [{ mounted, visible }, dispatchVisibility] = useReducer(overlayVisibilityReducer, {
    mounted: false,
    visible: false,
  });
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = mounted;
  }, [mounted]);

  useEffect(() => {
    if (page && page.displayMode !== PageDisplayMode.Fullscreen) {
      dispatchVisibility({ type: OverlayVisibilityActionType.Mount });
      // Flip to visible only after the just-mounted hidden frame has painted for
      // one full frame. A single rAF can fire before that paint, so the browser
      // never sees the "from" (scale 0.96) value and the overlay pops in at full
      // size. Two rAFs guarantee the enter transition always has a from-value.
      let secondFrame = 0;
      const firstFrame = requestAnimationFrame(() => {
        secondFrame = requestAnimationFrame(() => dispatchVisibility({ type: OverlayVisibilityActionType.Show }));
      });
      return () => {
        cancelAnimationFrame(firstFrame);
        cancelAnimationFrame(secondFrame);
      };
    }
    dispatchVisibility({ type: OverlayVisibilityActionType.Hide });
    if (!mountedRef.current) return;
    const id = window.setTimeout(
      () => dispatchVisibility({ type: OverlayVisibilityActionType.Unmount }),
      OVERLAY_TRANSITION_MS,
    );
    return () => window.clearTimeout(id);
  }, [page]);

  useOverlayEscape({ enabled: Boolean(page && page.displayMode !== PageDisplayMode.Fullscreen), onEscape: close });

  if (!mounted || !renderPage || renderPage.displayMode === PageDisplayMode.Fullscreen) return null;

  const fullscreenFrame = renderPage.pageType === PageType.Segmented && isMobileOverlayViewport;

  return (
    <>
      <OverlayBackdrop
        open={visible}
        onClick={close}
        ariaLabel="Close overlay"
        placement={OverlayBackdropPlacement.Fixed}
        className="z-40"
      />
      <OverlayFrame key={renderPage.slug} visible={visible} slug={renderPage.slug} fullscreen={fullscreenFrame}>
        {renderPage.displayMode === PageDisplayMode.Translucent ? (
          <TranslucentOverlayContent page={renderPage} onClose={close} frameInteractionsDisabled={fullscreenFrame} />
        ) : (
          <EmbossedOverlayContent page={renderPage} onClose={close} frameInteractionsDisabled={fullscreenFrame} />
        )}
      </OverlayFrame>
    </>
  );
}
