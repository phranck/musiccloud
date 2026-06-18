import {
  clampViewportRect,
  getResizeHandleHitAreaStyle,
  moveViewportRect,
  PageDisplayMode,
  PageType,
  type PublicContentPage,
  RESIZE_HANDLES,
  type ResizeHandle,
  resizeViewportRect,
  type ViewportRect,
} from "@musiccloud/shared";
import type { CSSProperties, PointerEvent, ReactNode } from "react";
import { useEffect, useReducer, useRef, useState } from "react";

import { EmbossedOverlayContent, TranslucentOverlayContent } from "@/components/layout/PageOverlayContent";
import { OverlayBackdrop } from "@/components/ui/OverlayBackdrop";
import { OVERLAY_TRANSITION_MS, OverlayBackdropPlacement } from "@/components/ui/OverlayBackdropTypes";
import { OverlayProvider } from "@/context/OverlayContext";
import { useOverlay } from "@/context/useOverlay";
import { useOverlayEscape } from "@/hooks/useOverlayEscape";
import { LocaleProvider } from "@/i18n/context";
import type { Locale } from "@/i18n/locales";
import { cn } from "@/lib/utils";

interface Props {
  initialPage: PublicContentPage | null;
  /** Server-resolved locale, so SSR and client hydration agree (no mismatch). */
  initialLocale?: Locale;
}

// Default + limits for the draggable / resizable overlay frame.
const DEFAULT_W = 520;
const DEFAULT_H = 600;
const MIN_W = 320;
const MIN_H = 240;
const VIEWPORT_MARGIN = 8;
const MOBILE_OVERLAY_QUERY = "(max-width: 767px), (pointer: coarse)";

// Geometry is persisted per-page slug so the user's preferred size and
// position for one page (e.g. "help") does not bleed over into another
// page (e.g. "info"). One localStorage entry per slug.
const GEOM_KEY_PREFIX = "mc:overlay-geom:";

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

const OverlayGestureKind = {
  Drag: "drag",
  Resize: "resize",
} as const;

type OverlayGestureKind = (typeof OverlayGestureKind)[keyof typeof OverlayGestureKind];

function geomKey(slug: string): string {
  return `${GEOM_KEY_PREFIX}${slug}`;
}

interface Geom {
  x: number;
  y: number;
  w: number;
  h: number;
}

function getViewportConstraints() {
  return {
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    minWidth: MIN_W,
    minHeight: MIN_H,
    margin: VIEWPORT_MARGIN,
  };
}

function geomToRect(g: Geom): ViewportRect {
  return {
    x: g.x,
    y: g.y,
    width: g.w,
    height: g.h,
  };
}

function rectToGeom(rect: ViewportRect): Geom {
  return {
    x: rect.x,
    y: rect.y,
    w: rect.width,
    h: rect.height,
  };
}

function clampGeom(g: Geom): Geom {
  return rectToGeom(clampViewportRect(geomToRect(g), getViewportConstraints()));
}

function defaultGeom(): Geom {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return clampGeom({
    w: DEFAULT_W,
    h: DEFAULT_H,
    x: Math.round((vw - DEFAULT_W) / 2),
    y: Math.max(24, Math.round(vh * 0.15)),
  });
}

function loadGeom(slug: string): Geom | null {
  try {
    const raw = localStorage.getItem(geomKey(slug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const g = parsed as Partial<Geom>;
    if (![g.x, g.y, g.w, g.h].every((n) => typeof n === "number" && Number.isFinite(n))) {
      return null;
    }
    return clampGeom(g as Geom);
  } catch {
    return null;
  }
}

function saveGeom(slug: string, g: Geom): void {
  try {
    localStorage.setItem(geomKey(slug), JSON.stringify(g));
  } catch {
    // Quota / disabled storage — ignore; geometry will simply reset on reload.
  }
}

function getMediaQueryMatch(query: string): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(query).matches;
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => getMediaQueryMatch(query));

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mediaQuery = window.matchMedia(query);
    const update = () => setMatches(mediaQuery.matches);
    update();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", update);
      return () => mediaQuery.removeEventListener("change", update);
    }

    const legacyMediaQuery = mediaQuery as unknown as {
      addListener?: (listener: () => void) => void;
      removeListener?: (listener: () => void) => void;
    };
    legacyMediaQuery.addListener?.(update);
    return () => legacyMediaQuery.removeListener?.(update);
  }, [query]);

  return matches;
}

export function PageOverlayIsland({ initialPage, initialLocale }: Props) {
  return (
    <LocaleProvider initialLocale={initialLocale}>
      <OverlayProvider initialPage={initialPage}>
        <OverlayShell />
      </OverlayProvider>
    </LocaleProvider>
  );
}

function OverlayShell() {
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

/**
 * Draggable + resizable overlay frame.
 *
 * Owns the geometry state for the overlay (position + size). The user can
 * grab the header region (`.overlay-drag-handle`) to move the frame and
 * any edge or corner to resize it. Both gestures use pointer capture so
 * tracking is reliable even when the pointer briefly leaves the element.
 * Geometry is persisted in `localStorage` per page-slug (one entry per
 * page) once per gesture (on `pointerup`) to avoid hammering the API
 * during drag.
 */
function OverlayFrame({
  visible,
  slug,
  fullscreen,
  children,
}: {
  visible: boolean;
  slug: string;
  fullscreen: boolean;
  children: ReactNode;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [geom, setGeom] = useState<Geom>(() => loadGeom(slug) ?? defaultGeom());
  const gestureRef = useRef<{
    kind: OverlayGestureKind;
    handle?: ResizeHandle;
    pointerId: number;
    startX: number;
    startY: number;
    origin: Geom;
  } | null>(null);

  // Re-clamp geometry whenever the viewport resizes so the frame never
  // ends up partially off-screen. Stored value stays untouched unless the
  // user moves the frame next.
  useEffect(() => {
    function onResize() {
      setGeom((g) => (g ? clampGeom(g) : g));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function beginGesture(
    kind: OverlayGestureKind,
    e: PointerEvent<HTMLDivElement>,
    origin: Geom,
    handle?: ResizeHandle,
  ): void {
    const el = frameRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    gestureRef.current = {
      kind,
      handle,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origin,
    };
  }

  if (fullscreen && gestureRef.current) gestureRef.current = null;

  function onFramePointerDown(e: PointerEvent<HTMLDivElement>): void {
    if (!geom || fullscreen) return;
    const target = e.target as HTMLElement;
    // Interactive chrome (close button, segmented tabs, links) always wins.
    if (target.closest("button, a, input, textarea, [role=tab]")) return;
    if (!target.closest(".overlay-drag-handle")) return;
    e.preventDefault();
    beginGesture(OverlayGestureKind.Drag, e, geom);
  }

  function onResizePointerDown(handle: ResizeHandle, e: PointerEvent<HTMLDivElement>): void {
    if (!geom || fullscreen) return;
    e.preventDefault();
    e.stopPropagation();
    beginGesture(OverlayGestureKind.Resize, e, geom, handle);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>): void {
    const g = gestureRef.current;
    if (!g || e.pointerId !== g.pointerId) return;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    const originRect = geomToRect(g.origin);
    if (g.kind === OverlayGestureKind.Drag) {
      setGeom(rectToGeom(moveViewportRect(originRect, dx, dy, getViewportConstraints())));
    } else {
      setGeom(rectToGeom(resizeViewportRect(originRect, g.handle ?? "se", dx, dy, getViewportConstraints())));
    }
  }

  function endGesture(e: PointerEvent<HTMLDivElement>): void {
    const g = gestureRef.current;
    if (!g || e.pointerId !== g.pointerId) return;
    const el = frameRef.current;
    if (el?.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    gestureRef.current = null;
    setGeom((cur) => {
      if (cur) saveGeom(slug, cur);
      return cur;
    });
  }

  // The windowed frame eases ONLY the scale (transform) on open and flips opacity
  // to 1 instantly: an ancestor with opacity < 1 isolates a descendant's
  // backdrop-filter, so opening at full opacity keeps the EmbossedCard frost
  // active while the scale eases in. The close fades opacity + scale out together,
  // where the blur no longer matters. Opacity + transform are inline (not Tailwind
  // `opacity-*`/`scale-*` utilities, which drive the separate `scale` property) so
  // the `transform` transition reliably animates the scale.
  const fadeTransition = `opacity ${OVERLAY_TRANSITION_MS}ms ease-out, transform ${OVERLAY_TRANSITION_MS}ms ease-out`;
  const frameStyle: CSSProperties = fullscreen
    ? {
        left: 0,
        top: 0,
        width: "100vw",
        height: "100dvh",
        opacity: visible ? 1 : 0,
        transition: fadeTransition,
      }
    : {
        left: `${geom.x}px`,
        top: `${geom.y}px`,
        width: `${geom.w}px`,
        height: `${geom.h}px`,
        opacity: visible ? 1 : 0,
        transform: visible ? "scale(1)" : "scale(0.96)",
        transition: visible ? `transform ${OVERLAY_TRANSITION_MS}ms ease-out` : fadeTransition,
      };

  return (
    <div
      ref={frameRef}
      className={cn("pointer-events-auto fixed z-50 flex flex-col", fullscreen ? "" : "rounded-2xl")}
      data-overlay-frame-mode={fullscreen ? "fullscreen" : "windowed"}
      style={frameStyle}
      onPointerDown={fullscreen ? undefined : onFramePointerDown}
      onPointerMove={fullscreen ? undefined : onPointerMove}
      onPointerUp={fullscreen ? undefined : endGesture}
      onPointerCancel={fullscreen ? undefined : endGesture}
    >
      {children}
      {!fullscreen && <ResizeHandles onResizeStart={onResizePointerDown} />}
    </div>
  );
}

interface ResizeHandlesProps {
  onResizeStart: (handle: ResizeHandle, event: PointerEvent<HTMLDivElement>) => void;
}

function ResizeHandles({ onResizeStart }: ResizeHandlesProps) {
  return (
    <>
      {RESIZE_HANDLES.map((handle) => (
        <div
          key={handle}
          aria-hidden="true"
          className="absolute z-20 touch-none"
          data-overlay-resize-handle={handle}
          style={getResizeHandleHitAreaStyle(handle) as CSSProperties}
          onPointerDown={(event) => onResizeStart(handle, event)}
        />
      ))}
    </>
  );
}
