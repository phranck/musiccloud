import type { PublicContentPage } from "@musiccloud/shared";
import {
  clampViewportRect,
  getResizeHandleHitAreaStyle,
  moveViewportRect,
  RESIZE_HANDLES,
  type ResizeHandle,
  resizeViewportRect,
  type ViewportRect,
} from "@musiccloud/shared";
import type { CSSProperties, PointerEvent, ReactNode } from "react";
import { useEffect, useReducer, useRef, useState } from "react";

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

// Default + limits for the draggable / resizable overlay frame.
const DEFAULT_W = 520;
const DEFAULT_H = 600;
const MIN_W = 320;
const MIN_H = 240;
const VIEWPORT_MARGIN = 8;

// Geometry is persisted per-page slug so the user's preferred size and
// position for one page (e.g. "help") does not bleed over into another
// page (e.g. "info"). One localStorage entry per slug.
const GEOM_KEY_PREFIX = "mc:overlay-geom:";

type OverlayVisibility = { mounted: boolean; visible: boolean };
type OverlayVisibilityAction = { type: "mount" } | { type: "show" } | { type: "hide" } | { type: "unmount" };

function overlayVisibilityReducer(state: OverlayVisibility, action: OverlayVisibilityAction): OverlayVisibility {
  switch (action.type) {
    case "mount":
      return { mounted: true, visible: false };
    case "show":
      return state.mounted ? { mounted: true, visible: true } : state;
    case "hide":
      return { ...state, visible: false };
    case "unmount":
      return { mounted: false, visible: false };
  }
}

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
  const [{ mounted, visible }, dispatchVisibility] = useReducer(overlayVisibilityReducer, {
    mounted: false,
    visible: false,
  });
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = mounted;
  }, [mounted]);

  useEffect(() => {
    if (page && page.displayMode !== "fullscreen") {
      dispatchVisibility({ type: "mount" });
      // Paint the hidden state first, then toggle visible on the next
      // frame so the transition engages.
      const id = requestAnimationFrame(() => dispatchVisibility({ type: "show" }));
      return () => cancelAnimationFrame(id);
    }
    dispatchVisibility({ type: "hide" });
    if (!mountedRef.current) return;
    const id = window.setTimeout(() => dispatchVisibility({ type: "unmount" }), TRANSITION_MS);
    return () => window.clearTimeout(id);
  }, [page]);

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

  // Backdrop-filter stays static; we fade the whole backdrop layer via
  // opacity instead of animating the blur itself. Opacity is composite-only
  // so the browser skips the per-frame filter rasterization cost.
  const backdropStyle: CSSProperties = {
    transition: `opacity ${TRANSITION_MS}ms ease-out`,
    backdropFilter: "blur(4px)",
    WebkitBackdropFilter: "blur(4px)",
    willChange: "opacity",
  };

  return (
    <>
      <button
        type="button"
        aria-label="Close overlay"
        onClick={close}
        className={cn("fixed inset-0 z-40 bg-black/40 cursor-default", visible ? "opacity-100" : "opacity-0")}
        style={backdropStyle}
      />
      <OverlayFrame key={page.slug} visible={visible} slug={page.slug}>
        {page.displayMode === "translucent" ? (
          <TranslucentOverlayContent page={page} onClose={close} />
        ) : (
          <EmbossedOverlayContent page={page} onClose={close} />
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
function OverlayFrame({ visible, slug, children }: { visible: boolean; slug: string; children: ReactNode }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [geom, setGeom] = useState<Geom>(() => loadGeom(slug) ?? defaultGeom());
  const gestureRef = useRef<{
    kind: "drag" | "resize";
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
    kind: "drag" | "resize",
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

  function onFramePointerDown(e: PointerEvent<HTMLDivElement>): void {
    if (!geom) return;
    const target = e.target as HTMLElement;
    // Interactive chrome (close button, segmented tabs, links) always wins.
    if (target.closest("button, a, input, textarea, [role=tab]")) return;
    if (!target.closest(".overlay-drag-handle")) return;
    e.preventDefault();
    beginGesture("drag", e, geom);
  }

  function onResizePointerDown(handle: ResizeHandle, e: PointerEvent<HTMLDivElement>): void {
    if (!geom) return;
    e.preventDefault();
    e.stopPropagation();
    beginGesture("resize", e, geom, handle);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>): void {
    const g = gestureRef.current;
    if (!g || e.pointerId !== g.pointerId) return;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    const originRect = geomToRect(g.origin);
    if (g.kind === "drag") {
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

  const frameStyle: CSSProperties = {
    left: `${geom.x}px`,
    top: `${geom.y}px`,
    width: `${geom.w}px`,
    height: `${geom.h}px`,
    transition: `opacity ${TRANSITION_MS}ms ease-out, transform ${TRANSITION_MS}ms ease-out`,
  };

  return (
    <div
      ref={frameRef}
      className={cn(
        "pointer-events-auto fixed z-50 flex flex-col",
        visible ? "opacity-100 scale-100" : "opacity-0 scale-[0.96]",
      )}
      style={frameStyle}
      onPointerDown={onFramePointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
    >
      {children}
      <ResizeHandles onResizeStart={onResizePointerDown} />
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
          style={getResizeHandleHitAreaStyle(handle) as CSSProperties}
          onPointerDown={(event) => onResizeStart(handle, event)}
        />
      ))}
    </>
  );
}
