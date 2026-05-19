import { type RefObject, useEffect } from "react";

import { useOverlayEscape } from "@/hooks/useOverlayEscape";

/**
 * Closes a dropdown/panel on outside-click (mousedown) and ESC key.
 * Both handlers are only registered when `isOpen` is true.
 */
export function useOutsideClick(ref: RefObject<HTMLElement | null>, isOpen: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!isOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [isOpen, onClose, ref]);

  useOverlayEscape({ enabled: isOpen, onEscape: onClose });
}
