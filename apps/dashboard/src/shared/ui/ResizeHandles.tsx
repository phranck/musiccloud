import { getResizeHandleHitAreaStyle, RESIZE_HANDLES, type ResizeHandle } from "@musiccloud/shared";
import type { CSSProperties, PointerEvent } from "react";

interface ResizeHandlesProps {
  onResizeStart: (handle: ResizeHandle, event: PointerEvent<HTMLDivElement>) => void;
}

export function ResizeHandles({ onResizeStart }: ResizeHandlesProps) {
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
