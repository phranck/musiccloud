type EscHandler = () => void;

interface OverlayLayer {
  id: string;
  onEscape: EscHandler;
}

const stack: OverlayLayer[] = [];
let stackSnapshot: string[] = [];
const listeners = new Set<() => void>();

function syncSnapshot() {
  stackSnapshot = stack.map((layer) => layer.id);
}

function emit() {
  for (const listener of listeners) listener();
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key !== "Escape" || stack.length === 0) return;
  e.stopPropagation();
  stack[stack.length - 1]?.onEscape();
}

let listening = false;

export function getOverlayStackSnapshot(): string[] {
  return stackSnapshot;
}

export function subscribeOverlayStack(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function registerOverlay(id: string, onEscape: EscHandler): () => void {
  stack.push({ id, onEscape });
  syncSnapshot();
  emit();

  if (!listening) {
    window.addEventListener("keydown", handleKeyDown);
    listening = true;
  }

  return () => {
    const idx = stack.findIndex((layer) => layer.id === id);
    if (idx !== -1) {
      stack.splice(idx, 1);
      syncSnapshot();
      emit();
    }

    if (stack.length === 0 && listening) {
      window.removeEventListener("keydown", handleKeyDown);
      listening = false;
    }
  };
}
