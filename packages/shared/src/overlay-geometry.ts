export const RESIZE_HANDLES = ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const;

export type ResizeHandle = (typeof RESIZE_HANDLES)[number];

export interface ResizeHandleHitAreaStyle {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
  width?: number;
  height?: number;
  cursor: string;
}

export interface ViewportRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ViewportRectConstraints {
  viewportWidth: number;
  viewportHeight: number;
  minWidth: number;
  minHeight: number;
  margin: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function maxRectWidth(constraints: ViewportRectConstraints): number {
  return Math.max(constraints.minWidth, constraints.viewportWidth - constraints.margin * 2);
}

function maxRectHeight(constraints: ViewportRectConstraints): number {
  return Math.max(constraints.minHeight, constraints.viewportHeight - constraints.margin * 2);
}

function clampAxisStart(start: number, size: number, minPosition: number, maxPosition: number): number {
  return clamp(start, minPosition, Math.max(minPosition, maxPosition - size));
}

function resizeAxis(
  start: number,
  size: number,
  delta: number,
  resizeStart: boolean,
  resizeEnd: boolean,
  minSize: number,
  maxSize: number,
  minPosition: number,
  maxPosition: number,
): { start: number; size: number } {
  let nextStart = start + (resizeStart ? delta : 0);
  let nextEnd = start + size + (resizeEnd ? delta : 0);

  if (resizeStart && !resizeEnd) {
    nextStart = clamp(nextStart, minPosition, nextEnd - minSize);
    if (nextEnd - nextStart > maxSize) nextStart = nextEnd - maxSize;
    nextStart = Math.max(nextStart, minPosition);
  } else if (resizeEnd && !resizeStart) {
    nextEnd = clamp(nextEnd, nextStart + minSize, maxPosition);
    if (nextEnd - nextStart > maxSize) nextEnd = nextStart + maxSize;
    nextEnd = Math.min(nextEnd, maxPosition);
  } else {
    const nextSize = clamp(size, minSize, maxSize);
    nextStart = clampAxisStart(start, nextSize, minPosition, maxPosition);
    nextEnd = nextStart + nextSize;
  }

  return {
    start: nextStart,
    size: Math.max(minSize, nextEnd - nextStart),
  };
}

export function clampViewportRect(rect: ViewportRect, constraints: ViewportRectConstraints): ViewportRect {
  const maxWidth = maxRectWidth(constraints);
  const maxHeight = maxRectHeight(constraints);
  const width = clamp(rect.width, constraints.minWidth, maxWidth);
  const height = clamp(rect.height, constraints.minHeight, maxHeight);

  return {
    x: clampAxisStart(rect.x, width, constraints.margin, constraints.viewportWidth - constraints.margin),
    y: clampAxisStart(rect.y, height, constraints.margin, constraints.viewportHeight - constraints.margin),
    width,
    height,
  };
}

export function moveViewportRect(
  origin: ViewportRect,
  deltaX: number,
  deltaY: number,
  constraints: ViewportRectConstraints,
): ViewportRect {
  return clampViewportRect({ ...origin, x: origin.x + deltaX, y: origin.y + deltaY }, constraints);
}

export function resizeViewportRect(
  origin: ViewportRect,
  handle: ResizeHandle,
  deltaX: number,
  deltaY: number,
  constraints: ViewportRectConstraints,
): ViewportRect {
  const horizontal = resizeAxis(
    origin.x,
    origin.width,
    deltaX,
    handle.includes("w"),
    handle.includes("e"),
    constraints.minWidth,
    maxRectWidth(constraints),
    constraints.margin,
    constraints.viewportWidth - constraints.margin,
  );
  const vertical = resizeAxis(
    origin.y,
    origin.height,
    deltaY,
    handle.includes("n"),
    handle.includes("s"),
    constraints.minHeight,
    maxRectHeight(constraints),
    constraints.margin,
    constraints.viewportHeight - constraints.margin,
  );

  return {
    x: horizontal.start,
    y: vertical.start,
    width: horizontal.size,
    height: vertical.size,
  };
}

export function getResizeHandleCursor(handle: ResizeHandle): string {
  if (handle === "n" || handle === "s") return "ns-resize";
  if (handle === "e" || handle === "w") return "ew-resize";
  if (handle === "ne" || handle === "sw") return "nesw-resize";
  return "nwse-resize";
}

const HANDLE_THICKNESS = 8;
const HANDLE_OFFSET = -4;
const HANDLE_EDGE_INSET = 16;
const HANDLE_CORNER_SIZE = 18;
const HANDLE_CORNER_OFFSET = -7;

export function getResizeHandleHitAreaStyle(handle: ResizeHandle): ResizeHandleHitAreaStyle {
  const cursor = getResizeHandleCursor(handle);

  switch (handle) {
    case "n":
      return {
        top: HANDLE_OFFSET,
        left: HANDLE_EDGE_INSET,
        right: HANDLE_EDGE_INSET,
        height: HANDLE_THICKNESS,
        cursor,
      };
    case "e":
      return {
        top: HANDLE_EDGE_INSET,
        right: HANDLE_OFFSET,
        bottom: HANDLE_EDGE_INSET,
        width: HANDLE_THICKNESS,
        cursor,
      };
    case "s":
      return {
        right: HANDLE_EDGE_INSET,
        bottom: HANDLE_OFFSET,
        left: HANDLE_EDGE_INSET,
        height: HANDLE_THICKNESS,
        cursor,
      };
    case "w":
      return {
        top: HANDLE_EDGE_INSET,
        bottom: HANDLE_EDGE_INSET,
        left: HANDLE_OFFSET,
        width: HANDLE_THICKNESS,
        cursor,
      };
    case "ne":
      return {
        top: HANDLE_CORNER_OFFSET,
        right: HANDLE_CORNER_OFFSET,
        width: HANDLE_CORNER_SIZE,
        height: HANDLE_CORNER_SIZE,
        cursor,
      };
    case "se":
      return {
        right: HANDLE_CORNER_OFFSET,
        bottom: HANDLE_CORNER_OFFSET,
        width: HANDLE_CORNER_SIZE,
        height: HANDLE_CORNER_SIZE,
        cursor,
      };
    case "sw":
      return {
        bottom: HANDLE_CORNER_OFFSET,
        left: HANDLE_CORNER_OFFSET,
        width: HANDLE_CORNER_SIZE,
        height: HANDLE_CORNER_SIZE,
        cursor,
      };
    case "nw":
      return {
        top: HANDLE_CORNER_OFFSET,
        left: HANDLE_CORNER_OFFSET,
        width: HANDLE_CORNER_SIZE,
        height: HANDLE_CORNER_SIZE,
        cursor,
      };
  }
}
