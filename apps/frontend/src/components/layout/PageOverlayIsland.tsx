import type { PublicContentPage } from "@musiccloud/shared";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

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

function geomKey(slug: string): string {
  return `${GEOM_KEY_PREFIX}${slug}`;
}

interface Geom {
  x: number;
  y: number;
  w: number;
  h: number;
}

function clampGeom(g: Geom): Geom {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const maxW = Math.max(MIN_W, vw - VIEWPORT_MARGIN * 2);
  const maxH = Math.max(MIN_H, vh - VIEWPORT_MARGIN * 2);
  const w = Math.min(Math.max(g.w, MIN_W), maxW);
  const h = Math.min(Math.max(g.h, MIN_H), maxH);
  const x = Math.min(Math.max(g.x, VIEWPORT_MARGIN), vw - w - VIEWPORT_MARGIN);
  const y = Math.min(Math.max(g.y, VIEWPORT_MARGIN), vh - h - VIEWPORT_MARGIN);
  return { x, y, w, h };
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
    setVisible(false);
    if (!mounted) return;
    const id = window.setTimeout(() => setMounted(false), TRANSITION_MS);
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
  const backdropStyle: React.CSSProperties = {
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
      <OverlayFrame visible={visible} slug={page.slug}>
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
 * the bottom-right grip to resize it. Both gestures use pointer capture so
 * tracking is reliable even when the pointer briefly leaves the element.
 * Geometry is persisted in `localStorage` per page-slug (one entry per
 * page) once per gesture (on `pointerup`) to avoid hammering the API
 * during drag.
 */
function OverlayFrame({ visible, slug, children }: { visible: boolean; slug: string; children: React.ReactNode }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [geom, setGeom] = useState<Geom | null>(null);
  const gestureRef = useRef<{
    kind: "drag" | "resize";
    pointerId: number;
    startX: number;
    startY: number;
    origin: Geom;
  } | null>(null);

  // Init geometry from localStorage (or defaults) once we can read the
  // viewport, and re-init when the slug changes (page-switch within the
  // same overlay session). useLayoutEffect runs before first paint so the
  // frame renders at its resolved position — no visible flash.
  useLayoutEffect(() => {
    setGeom(loadGeom(slug) ?? defaultGeom());
  }, [slug]);

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

  function beginGesture(kind: "drag" | "resize", e: React.PointerEvent<HTMLDivElement>, origin: Geom): void {
    const el = frameRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    gestureRef.current = {
      kind,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origin,
    };
  }

  function onFramePointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    if (!geom) return;
    const target = e.target as HTMLElement;
    // Interactive chrome (close button, segmented tabs, links) always wins.
    if (target.closest("button, a, input, textarea, [role=tab]")) return;
    if (!target.closest(".overlay-drag-handle")) return;
    e.preventDefault();
    beginGesture("drag", e, geom);
  }

  function onResizePointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    if (!geom) return;
    e.preventDefault();
    e.stopPropagation();
    beginGesture("resize", e, geom);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    const g = gestureRef.current;
    if (!g || e.pointerId !== g.pointerId) return;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    if (g.kind === "drag") {
      setGeom(clampGeom({ ...g.origin, x: g.origin.x + dx, y: g.origin.y + dy }));
    } else {
      setGeom(clampGeom({ ...g.origin, w: g.origin.w + dx, h: g.origin.h + dy }));
    }
  }

  function endGesture(e: React.PointerEvent<HTMLDivElement>): void {
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

  if (!geom) return null;

  const frameStyle: React.CSSProperties = {
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
      <div
        aria-hidden
        onPointerDown={onResizePointerDown}
        className="absolute bottom-[9px] right-2 w-4 h-4 cursor-nwse-resize text-white/30 hover:text-white/70 transition-colors"
      >
        <svg
          viewBox="0 0 16 16"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <title>Resize</title>
          <line x1="14" y1="6" x2="6" y2="14" />
          <line x1="14" y1="11" x2="11" y2="14" />
        </svg>
      </div>
    </div>
  );
}
