/** Duration for the visible successful-copy acknowledgement. */
export const COPY_SUCCESS_DURATION_MS = 3000;

interface ClipboardWriter {
  writeText(text: string): Promise<void>;
}

/**
 * Binds one delegated copy listener for all rendered documentation blocks.
 * The returned cleanup function makes the behavior safe for tests and future
 * client-side page transitions.
 */
export function bindCodeCopyControls(root: Document, clipboard: ClipboardWriter = navigator.clipboard): () => void {
  const resetTimers = new Map<HTMLButtonElement, number>();

  const reset = (button: HTMLButtonElement) => {
    const block = button.closest<HTMLElement>("[data-code-block]");
    const success = block?.querySelector<HTMLElement>("[data-copy-success]");
    success?.setAttribute("hidden", "");
    button.setAttribute("aria-label", "Copy code");
    button.setAttribute("title", "Copy code");
    block?.querySelector<HTMLElement>("[data-copy-status]")?.replaceChildren();
    resetTimers.delete(button);
  };

  const onClick = async (event: Event) => {
    const button = event.target instanceof Element ? event.target.closest("[data-copy-code]") : null;
    if (!(button instanceof HTMLButtonElement)) return;

    const targetId = button.dataset.copyTarget;
    const target = targetId ? root.getElementById(targetId) : null;
    const code = target?.matches("code") ? target : target?.querySelector("code");
    const text = code?.textContent;
    if (!text) return;

    const block = button.closest<HTMLElement>("[data-code-block]");
    const success = block?.querySelector<HTMLElement>("[data-copy-success]");
    const status = block?.querySelector<HTMLElement>("[data-copy-status]");

    try {
      await clipboard.writeText(text);
      const previousTimer = resetTimers.get(button);
      if (previousTimer !== undefined) window.clearTimeout(previousTimer);
      if (success) {
        success.hidden = true;
        void success.offsetWidth;
        success.hidden = false;
      }
      button.setAttribute("aria-label", "Code copied");
      button.setAttribute("title", "Code copied");
      status?.replaceChildren("Code copied");
      const timer = window.setTimeout(() => reset(button), COPY_SUCCESS_DURATION_MS);
      resetTimers.set(button, timer);
    } catch {
      success?.setAttribute("hidden", "");
      button.setAttribute("aria-label", "Select code to copy");
      button.setAttribute("title", "Select code to copy");
      status?.replaceChildren("Copy unavailable");
    }
  };

  root.addEventListener("click", onClick);
  return () => {
    root.removeEventListener("click", onClick);
    for (const timer of resetTimers.values()) window.clearTimeout(timer);
    resetTimers.clear();
  };
}
