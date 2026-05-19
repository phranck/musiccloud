import { useEffect, useEffectEvent, useRef } from "react";

interface OverlayEscapeOptions {
  enabled: boolean;
  onEscape: () => void;
}

interface OverlayEscapeEntry {
  id: symbol;
  onEscape: () => void;
}

const escapeStack: OverlayEscapeEntry[] = [];
let listening = false;

function handleEscapeKey(event: KeyboardEvent): void {
  if (event.key !== "Escape") return;
  const entry = escapeStack.at(-1);
  if (!entry) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  entry.onEscape();
}

function ensureEscapeListener(): void {
  if (listening || typeof document === "undefined") return;
  document.addEventListener("keydown", handleEscapeKey);
  listening = true;
}

function removeEscapeListenerIfUnused(): void {
  if (!listening || escapeStack.length > 0 || typeof document === "undefined") return;
  document.removeEventListener("keydown", handleEscapeKey);
  listening = false;
}

export function useOverlayEscape({ enabled, onEscape }: OverlayEscapeOptions): void {
  const idRef = useRef<symbol>(Symbol("overlay-escape"));
  const onEscapeEvent = useEffectEvent(onEscape);

  useEffect(() => {
    if (!enabled) return;
    const entry: OverlayEscapeEntry = {
      id: idRef.current,
      onEscape: () => onEscapeEvent(),
    };
    escapeStack.push(entry);
    ensureEscapeListener();
    return () => {
      const index = escapeStack.findIndex((item) => item.id === entry.id);
      if (index >= 0) escapeStack.splice(index, 1);
      removeEscapeListenerIfUnused();
    };
  }, [enabled]);
}
