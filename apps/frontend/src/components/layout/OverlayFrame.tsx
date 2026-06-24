import { moveViewportRect, type ResizeHandle, resizeViewportRect } from "@musiccloud/shared";
import type { CSSProperties, PointerEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import {
  clampGeom,
  defaultGeom,
  type Geom,
  geomToRect,
  getViewportConstraints,
  loadGeom,
  rectToGeom,
  saveGeom,
} from "@/components/layout/overlayGeometry";
import { ResizeHandles } from "@/components/layout/ResizeHandles";
import { OVERLAY_TRANSITION_MS } from "@/components/ui/OverlayBackdropTypes";
import { cn } from "@/lib/utils";

/**
 * Whether the active pointer gesture is moving the frame or resizing it. Drives
 * how pointer deltas are applied to the geometry.
 */
const OverlayGestureKind = {
  Drag: "drag",
  Resize: "resize",
} as const;

type OverlayGestureKind = (typeof OverlayGestureKind)[keyof typeof OverlayGestureKind];

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
 *
 * @param visible - drives the open/close opacity + scale transition
 * @param slug - the page slug whose geometry is loaded/persisted
 * @param fullscreen - when true the frame fills the viewport and all
 *   drag/resize gestures are disabled (mobile segmented overlays)
 * @param children - the overlay content surface to render inside the frame
 */
export function OverlayFrame({
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
