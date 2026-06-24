import { type RefObject, useEffect } from "react";

/**
 * Dismisses an open disclosure layer (dropdown, menu, popover) on an outside
 * pointer press or the Escape key.
 *
 * Listeners are attached only while `open` is true and torn down when it closes
 * or the component unmounts, so a closed layer adds no document-level listeners.
 * A press inside `containerRef` (the element wrapping both the trigger and the
 * panel) is treated as "inside" and never dismisses.
 *
 * Pass a stable `onDismiss` (e.g. a `useCallback`) so the listeners are not
 * re-registered on every render while the layer is open.
 *
 * @param open - Whether the layer is currently open.
 * @param onDismiss - Called to close the layer (stable reference preferred).
 * @param containerRef - Ref to the element considered "inside" the layer.
 * @param panelRef - Optional second "inside" element, for a panel rendered in a
 *   portal (outside `containerRef` in the DOM) — e.g. a menu escaping a clipping
 *   ancestor. A press inside it must not dismiss before the click lands.
 */
export function useDismissableLayer(
  open: boolean,
  onDismiss: () => void,
  containerRef: RefObject<HTMLElement | null>,
  panelRef?: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (containerRef.current?.contains(target) || panelRef?.current?.contains(target)) return;
      onDismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    // A portal panel is viewport-fixed, so it would detach from its trigger on
    // scroll — dismiss instead. A non-portal panel scrolls with its container,
    // so it needs no scroll handling.
    const onScroll = panelRef ? () => onDismiss() : null;
    if (onScroll) window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      if (onScroll) window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, onDismiss, containerRef, panelRef]);
}
