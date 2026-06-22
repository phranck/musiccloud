import { getResizeHandleHitAreaStyle, RESIZE_HANDLES, type ResizeHandle } from "@musiccloud/shared";
import type { CSSProperties, PointerEvent } from "react";

/**
 * Props for {@link ResizeHandles}.
 */
export interface ResizeHandlesProps {
  /**
   * Invoked when a resize gesture begins on one of the eight edge/corner
   * handles. Receives the handle identity and the originating pointer event so
   * the owning frame can start pointer capture and track the drag.
   */
  onResizeStart: (handle: ResizeHandle, event: PointerEvent<HTMLDivElement>) => void;
}

/**
 * The eight invisible edge/corner hit areas overlaid on the windowed overlay
 * frame for resizing. Each handle is purely decorative to assistive tech
 * (`aria-hidden`) and positioned via the shared hit-area geometry so the cursor
 * and grab regions stay consistent across edges and corners.
 */
export function ResizeHandles({ onResizeStart }: ResizeHandlesProps) {
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
