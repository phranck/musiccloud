import { clampViewportRect, type ResizeHandle, resizeViewportRect, type ViewportRect } from "@musiccloud/shared";
import {
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { getOverlayStackSnapshot, registerOverlay, subscribeOverlayStack } from "./overlay-stack";
import { ResizeHandles } from "./ResizeHandles";

const STYLE_ID = "mc-overlay-keyframes";

const KEYFRAMES_CSS = `
@keyframes mc-overlay-in {
  from { opacity: 0; backdrop-filter: blur(0px); }
  to { opacity: 1; backdrop-filter: blur(24px); }
}
@keyframes mc-overlay-out {
  from { opacity: 1; backdrop-filter: blur(24px); }
  to { opacity: 0; backdrop-filter: blur(0px); }
}
@keyframes mc-card-in {
  from { opacity: 0; transform: scale(0.96) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
@keyframes mc-card-out {
  from { opacity: 1; transform: scale(1) translateY(0); }
  to { opacity: 0; transform: scale(0.96) translateY(8px); }
}
`;

function ensureStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = KEYFRAMES_CSS;
  document.head.appendChild(style);
}

const RESIZABLE_MARGIN = 16;
const RESIZABLE_DEFAULT_WIDTH = 480;
const RESIZABLE_DEFAULT_HEIGHT = 560;
const RESIZABLE_MIN_WIDTH = 360;
const RESIZABLE_MIN_HEIGHT = 320;

function readStoredWidth(key: string): number | null {
  try {
    const raw = localStorage.getItem(`overlay-card-width:${key}`);
    if (raw) {
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) return n;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function getResizableConstraints(minWidth: number, minHeight: number) {
  return {
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    minWidth,
    minHeight,
    margin: RESIZABLE_MARGIN,
  };
}

function centeredRect(width: number, height: number, minWidth: number, minHeight: number): ViewportRect {
  return clampViewportRect(
    {
      x: (window.innerWidth - width) / 2,
      y: (window.innerHeight - height) / 2,
      width,
      height,
    },
    getResizableConstraints(minWidth, minHeight),
  );
}

function isStoredRect(value: unknown): value is ViewportRect {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Record<keyof ViewportRect, unknown>>;
  return (
    typeof candidate.x === "number" &&
    typeof candidate.y === "number" &&
    typeof candidate.width === "number" &&
    typeof candidate.height === "number"
  );
}

function readStoredRect(
  key: string,
  defaultWidth: number,
  defaultHeight: number,
  minWidth: number,
  minHeight: number,
): ViewportRect {
  try {
    const raw = localStorage.getItem(`overlay-card-rect:${key}`);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isStoredRect(parsed)) {
        return clampViewportRect(parsed, getResizableConstraints(minWidth, minHeight));
      }
    }
  } catch {
    /* ignore */
  }

  return centeredRect(readStoredWidth(key) ?? defaultWidth, defaultHeight, minWidth, minHeight);
}

function saveStoredRect(key: string, rect: ViewportRect): void {
  try {
    localStorage.setItem(`overlay-card-rect:${key}`, JSON.stringify(rect));
    localStorage.setItem(`overlay-card-width:${key}`, String(rect.width));
  } catch {
    /* ignore */
  }
}

interface OverlayCardSizeResizable {
  storageKey: string;
  defaultWidth?: number;
  defaultHeight?: number;
  minWidth?: number;
  minHeight?: number;
}

type OverlayCardSize = "fixed-sm" | "fixed-md" | OverlayCardSizeResizable;

interface OverlayCardProps {
  open: boolean;
  onClose: () => void;
  size?: OverlayCardSize;
  "aria-label": string;
  className?: string;
  style?: CSSProperties;
  backdropClose?: boolean;
  zIndex?: number;
  onEscape?: () => boolean;
  children: ReactNode;
}

function Header({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={[
        "px-5 py-4 bg-[var(--ds-surface-inset)] border-b border-[var(--ds-border-subtle)] shrink-0",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}

function Footer({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={[
        "px-5 py-4 bg-[var(--ds-surface-inset)] border-t border-[var(--ds-border-subtle)] shrink-0",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}

function Body({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={["flex-1 overflow-y-auto p-5", className].filter(Boolean).join(" ")}>{children}</div>;
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function trapFocus(e: KeyboardEvent, container: HTMLElement | null) {
  if (e.key !== "Tab" || !container) return;
  const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE);
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

export function OverlayCard({
  open,
  onClose,
  size = "fixed-sm",
  "aria-label": ariaLabel,
  className,
  style,
  backdropClose = false,
  zIndex = 2000,
  onEscape,
  children,
}: OverlayCardProps) {
  const overlayId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const closingRef = useRef(false);
  const resizeStateRef = useRef<{
    handle: ResizeHandle;
    pointerId: number;
    startX: number;
    startY: number;
    origin: ViewportRect;
    captureTarget: HTMLElement;
  } | null>(null);
  const [closing, setClosing] = useState(false);
  const [resizableRect, setResizableRect] = useState<ViewportRect | null>(null);
  const overlayIds = useSyncExternalStore(subscribeOverlayStack, getOverlayStackSnapshot, getOverlayStackSnapshot);
  const stackIndex = overlayIds.indexOf(overlayId);
  const isRegistered = stackIndex !== -1;
  const isTopMost = isRegistered && stackIndex === overlayIds.length - 1;
  const isBaseLayer = isRegistered && stackIndex === 0;
  const isResizable = typeof size === "object";
  const resizableStorageKey = isResizable ? size.storageKey : null;
  const resizableDefaultWidth = isResizable ? (size.defaultWidth ?? RESIZABLE_DEFAULT_WIDTH) : RESIZABLE_DEFAULT_WIDTH;
  const resizableDefaultHeight = isResizable
    ? (size.defaultHeight ?? RESIZABLE_DEFAULT_HEIGHT)
    : RESIZABLE_DEFAULT_HEIGHT;
  const resizableMinWidth = isResizable ? (size.minWidth ?? RESIZABLE_MIN_WIDTH) : RESIZABLE_MIN_WIDTH;
  const resizableMinHeight = isResizable ? (size.minHeight ?? RESIZABLE_MIN_HEIGHT) : RESIZABLE_MIN_HEIGHT;
  const dialogReady = !isResizable || Boolean(resizableRect);

  const startClose = useCallback(() => {
    closingRef.current = true;
    setClosing((current) => (current ? current : true));
  }, []);

  useEffect(() => {
    ensureStyles();
  }, []);

  useEffect(() => {
    if (!open) {
      closingRef.current = false;
      resizeStateRef.current = null;
      setClosing(false);
      setResizableRect(null);
    }
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !resizableStorageKey) return;
    setResizableRect(
      readStoredRect(
        resizableStorageKey,
        resizableDefaultWidth,
        resizableDefaultHeight,
        resizableMinWidth,
        resizableMinHeight,
      ),
    );
  }, [open, resizableDefaultHeight, resizableDefaultWidth, resizableMinHeight, resizableMinWidth, resizableStorageKey]);

  useLayoutEffect(() => {
    if (!open) return;
    const handler = () => {
      if (closingRef.current) return;
      if (onEscape) {
        if (onEscape() === false) return;
      }
      startClose();
    };
    return registerOverlay(overlayId, handler);
  }, [open, onEscape, overlayId, startClose]);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    return () => {
      previousFocusRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open || !isTopMost || !dialogReady) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const first = dialog.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
  }, [dialogReady, open, isTopMost]);

  useEffect(() => {
    if (!open || !isTopMost) return;
    const handler = (e: KeyboardEvent) => trapFocus(e, dialogRef.current);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, isTopMost]);

  useEffect(() => {
    if (!open || !resizableStorageKey) return;
    const onResize = () => {
      setResizableRect((current) =>
        current ? clampViewportRect(current, getResizableConstraints(resizableMinWidth, resizableMinHeight)) : current,
      );
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, resizableMinHeight, resizableMinWidth, resizableStorageKey]);

  const startResize = useCallback(
    (handle: ResizeHandle, event: PointerEvent<HTMLDivElement>) => {
      if (!resizableRect) return;
      event.preventDefault();
      event.stopPropagation();
      const captureTarget = dialogRef.current ?? event.currentTarget;
      captureTarget.setPointerCapture(event.pointerId);
      resizeStateRef.current = {
        handle,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        origin: resizableRect,
        captureTarget,
      };
    },
    [resizableRect],
  );

  const updateResize = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const state = resizeStateRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      event.preventDefault();
      setResizableRect(
        resizeViewportRect(
          state.origin,
          state.handle,
          event.clientX - state.startX,
          event.clientY - state.startY,
          getResizableConstraints(resizableMinWidth, resizableMinHeight),
        ),
      );
    },
    [resizableMinHeight, resizableMinWidth],
  );

  const stopResize = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const state = resizeStateRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      resizeStateRef.current = null;
      if (state.captureTarget.hasPointerCapture(event.pointerId)) {
        state.captureTarget.releasePointerCapture(event.pointerId);
      }
      if (resizableStorageKey) {
        setResizableRect((current) => {
          if (current) saveStoredRect(resizableStorageKey, current);
          return current;
        });
      }
    },
    [resizableStorageKey],
  );

  if (!open) return null;

  const handleBackdropAnimationEnd = (e: React.AnimationEvent) => {
    if (closing && e.target === e.currentTarget) {
      closingRef.current = false;
      setClosing(false);
      onClose();
    }
  };

  const handleBackdropClick = isTopMost && backdropClose && !closing ? startClose : undefined;

  const fixedMaxWidth = isResizable ? "" : size === "fixed-md" ? "max-w-md" : "max-w-sm";
  if (isResizable && !resizableRect) return null;
  const cardAnim = closing ? "mc-card-out 280ms ease forwards" : "mc-card-in 380ms ease forwards";
  const backdropAnim = closing ? "mc-overlay-out 280ms ease forwards" : "mc-overlay-in 360ms ease forwards";
  const effectiveZIndex = isRegistered ? zIndex + stackIndex * 100 : zIndex;
  const cardStyle: CSSProperties = {
    animation: cardAnim,
    ...(isResizable && resizableRect
      ? {
          left: resizableRect.x,
          top: resizableRect.y,
          width: resizableRect.width,
          height: resizableRect.height,
        }
      : {}),
    ...style,
  };

  return (
    <div
      className={isResizable ? "fixed inset-0" : "fixed inset-0 flex items-center justify-center px-4"}
      style={{ zIndex: effectiveZIndex }}
    >
      <div
        className={[
          "absolute inset-0",
          isBaseLayer ? "backdrop-blur-xl bg-black/10" : "bg-black/20",
          isTopMost ? "pointer-events-auto" : "pointer-events-none",
        ]
          .filter(Boolean)
          .join(" ")}
        style={{ animation: backdropAnim }}
        aria-hidden="true"
        onClick={handleBackdropClick}
        onAnimationEnd={handleBackdropAnimationEnd}
      />
      <div
        ref={dialogRef}
        className={[
          `${isResizable ? "fixed flex flex-col" : "relative w-full"} bg-[var(--ds-surface)] border border-[rgba(255,255,255,0.06)] rounded-2xl shadow-xl overflow-hidden ${fixedMaxWidth}`,
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        style={cardStyle}
        role="dialog"
        aria-modal={true}
        aria-label={ariaLabel}
        onPointerMove={isResizable ? updateResize : undefined}
        onPointerUp={isResizable ? stopResize : undefined}
        onPointerCancel={isResizable ? stopResize : undefined}
      >
        {children}
        {isResizable && <ResizeHandles onResizeStart={startResize} />}
      </div>
    </div>
  );
}

OverlayCard.Header = Header;
OverlayCard.Footer = Footer;
OverlayCard.Body = Body;
