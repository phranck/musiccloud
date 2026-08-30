import { type MouseEvent as ReactMouseEvent, useCallback, useEffect, useRef, useState } from "react";

/** How narrow a column may become while it is being dragged. */
const RESIZE_MIN_WIDTH = 96;

/**
 * Builds the storage key the widths of one table are kept under. The key
 * carries the path and the column ids, so a different table on the same route,
 * or the same table after its columns change, starts from its own widths
 * rather than from someone else's.
 *
 * There is no key on a server, where there is no location to key on and no
 * storage to read. A table rendered there is simply unsized, and the widths
 * arrive once it is running in a browser.
 *
 * @param columnIds - The ids of the columns in render order.
 * @returns The key, or `null` when there is nothing to remember it under.
 */
function getColumnWidthStorageKey(columnIds: string[]): string | null {
  if (columnIds.length === 0) return null;
  if (typeof window === "undefined") return null;
  return `datatable:widths:${window.location.pathname}:${columnIds.join("|")}`;
}

/**
 * Reads the stored widths, keeping only finite numbers. Anything else is
 * discarded, because the value is whatever an earlier version of this code or
 * a person with developer tools left behind.
 *
 * @param storageKey - The key to read, or `null` to start empty.
 * @returns The stored width per column id.
 */
function loadColumnWidths(storageKey: string | null): Record<string, number> {
  if (!storageKey) return {};
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([key, value]) =>
        typeof value === "number" && Number.isFinite(value) ? [[key, value]] : [],
      ),
    );
  } catch {
    return {};
  }
}

interface ResizeState {
  leftColumnId: string;
  rightColumnId: string;
  startX: number;
  startLeftWidth: number;
  startRightWidth: number;
}

interface UseColumnWidthsResult {
  /** The current width per column id. A missing id means the column is unsized. */
  columnWidths: Record<string, number>;
  /**
   * Starts a drag on the divider to the right of the given column. The two
   * neighbouring columns share a fixed combined width, so the table itself
   * keeps its width whilst the divider moves.
   */
  startResize: (event: ReactMouseEvent, leftColumnIndex: number) => void;
}

/**
 * Holds the column widths of a table, persists them per route and column set,
 * and runs the divider dragging.
 *
 * The drag is bound to the window rather than to the divider, because the
 * pointer leaves the narrow divider long before the drag ends. It stops as
 * soon as a column would go below {@link RESIZE_MIN_WIDTH}, which keeps the
 * pointer and the divider from drifting apart.
 *
 * @param columnIds - The ids of the columns in render order.
 * @returns The current widths and the drag starter.
 */
export function useColumnWidths(columnIds: string[]): UseColumnWidthsResult {
  const storageKey = getColumnWidthStorageKey(columnIds);
  // Which key the widths in state were read for. It starts as `null` so a
  // server render and the first browser render agree on an unsized table, and
  // the stored widths are applied afterwards rather than during the render that
  // has to match what the server sent.
  const [storedKey, setStoredKey] = useState<string | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});

  const mouseMoveHandlerRef = useRef<(event: MouseEvent) => void>(() => {});
  const resizeStateRef = useRef<ResizeState | null>(null);

  // The widths belong to one key. When the table changes route or columns, the
  // ones in state describe a table that is no longer on screen.
  useEffect(() => {
    setStoredKey(storageKey);
    setColumnWidths(loadColumnWidths(storageKey));
  }, [storageKey]);

  useEffect(() => {
    // Only write widths that were read for this key, so the empty set the table
    // starts from cannot overwrite what is stored.
    if (!storageKey || storedKey !== storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(columnWidths));
    } catch {}
  }, [storageKey, storedKey, columnWidths]);

  const stopResize = useCallback(() => {
    resizeStateRef.current = null;
    document.body.style.removeProperty("cursor");
    document.body.style.removeProperty("user-select");
    window.removeEventListener("mousemove", mouseMoveHandlerRef.current);
    window.removeEventListener("mouseup", stopResize);
  }, []);

  const onMouseMove = useCallback(
    (event: MouseEvent) => {
      const state = resizeStateRef.current;
      if (!state) return;
      const delta = event.clientX - state.startX;
      const combinedWidth = state.startLeftWidth + state.startRightWidth;
      const maxLeft = combinedWidth - RESIZE_MIN_WIDTH;
      const rawNextLeftWidth = state.startLeftWidth + delta;
      const nextLeftWidth = Math.min(maxLeft, Math.max(RESIZE_MIN_WIDTH, rawNextLeftWidth));
      setColumnWidths((current) => ({
        ...current,
        [state.leftColumnId]: nextLeftWidth,
        [state.rightColumnId]: combinedWidth - nextLeftWidth,
      }));
      if (rawNextLeftWidth <= RESIZE_MIN_WIDTH || rawNextLeftWidth >= maxLeft) {
        stopResize();
      }
    },
    [stopResize],
  );

  useEffect(() => {
    mouseMoveHandlerRef.current = onMouseMove;
  }, [onMouseMove]);

  const startResize = useCallback(
    (event: ReactMouseEvent, leftColumnIndex: number) => {
      event.preventDefault();
      event.stopPropagation();
      const header = (event.currentTarget as HTMLElement).closest("th");
      if (!header) return;
      const leftColumnId = columnIds[leftColumnIndex];
      const rightColumnId = columnIds[leftColumnIndex + 1];
      if (!leftColumnId || !rightColumnId) return;

      let nextLeftWidth = header.getBoundingClientRect().width;
      let nextRightWidth = nextLeftWidth;

      // Every column is frozen at its rendered width before the first move, so
      // the columns that are not being dragged cannot absorb the difference.
      const headerRow = header.parentElement;
      if (headerRow) {
        const headerCells = Array.from(headerRow.querySelectorAll("th"));
        const frozenWidths = Object.fromEntries(
          columnIds
            .map((columnId, index) => {
              const width = headerCells[index]?.getBoundingClientRect().width;
              return typeof width === "number" && Number.isFinite(width) ? [columnId, width] : null;
            })
            .filter((entry): entry is [string, number] => entry !== null),
        );
        const measuredLeft = frozenWidths[leftColumnId];
        const measuredRight = frozenWidths[rightColumnId];
        if (typeof measuredLeft === "number") nextLeftWidth = measuredLeft;
        if (typeof measuredRight === "number") nextRightWidth = measuredRight;
        if (Object.keys(frozenWidths).length > 0) {
          setColumnWidths((current) => ({ ...current, ...frozenWidths }));
        }
      }

      resizeStateRef.current = {
        leftColumnId,
        rightColumnId,
        startX: event.clientX,
        startLeftWidth: nextLeftWidth,
        startRightWidth: nextRightWidth,
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("mousemove", mouseMoveHandlerRef.current);
      window.addEventListener("mouseup", stopResize);
    },
    [columnIds, stopResize],
  );

  useEffect(
    () => () => {
      stopResize();
    },
    [stopResize],
  );

  return { columnWidths, startResize };
}
