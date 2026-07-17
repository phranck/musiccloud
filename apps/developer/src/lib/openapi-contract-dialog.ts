const HIGHLIGHT_CHUNK_LINE_COUNT = 120;

/** Reads the build-time-only source without accepting arbitrary page markup. */
function parseDeferredContractSource(source: HTMLElement | null): string | null {
  if (!source?.textContent) return null;

  try {
    const payload: unknown = JSON.parse(source.textContent);
    return typeof payload === "string" ? payload : null;
  } catch {
    // A malformed local preview must not prevent the native dialog from closing
    // or restoring focus.
  }

  return null;
}

/**
 * Builds a detached Shiki pre node in line-sized chunks. The markup originates
 * from build-time Shiki output, never from a runtime request or user input.
 */
function createProgressiveHighlighter(root: Document, highlighted: string) {
  const parts = /^(<pre\b[^>]*><code\b[^>]*>)([\s\S]*)(<\/code><\/pre>)$/.exec(highlighted);
  if (!parts) return null;

  const [, openingMarkup, lineMarkup, closingMarkup] = parts;
  const shell = root.createElement("template");
  shell.innerHTML = `${openingMarkup}${closingMarkup}`;
  const pre = shell.content.querySelector<HTMLPreElement>("pre.shiki");
  const code = pre?.querySelector<HTMLElement>("code");
  if (!pre || !code) return null;

  return { pre, code, lines: lineMarkup.split("\n") };
}

/**
 * Client-side controller for the statically embedded OpenAPI-contract dialog.
 *
 * The dialog opens in its loading state before the contract payload is parsed.
 * Shiki lines are assembled off-document over successive frames, then swapped
 * in at once so the loading state never blocks an interaction. No click-time
 * request occurs.
 */
export function bindOpenApiContractDialog(root: Document): () => void {
  const cleanups: Array<() => void> = [];

  for (const dialog of root.querySelectorAll<HTMLDialogElement>("[data-openapi-contract-dialog]")) {
    if (dialog.dataset.openapiContractBound === "true") continue;
    dialog.dataset.openapiContractBound = "true";

    const triggers = Array.from(
      root.querySelectorAll<HTMLButtonElement>(`[data-openapi-contract-trigger][aria-controls="${dialog.id}"]`),
    );
    const closeControl = dialog.querySelector<HTMLButtonElement>("[data-openapi-contract-close]");
    const sourceElement = dialog.dataset.openapiContractSource
      ? root.getElementById(dialog.dataset.openapiContractSource)
      : null;
    const view = root.defaultView;
    let opener: HTMLButtonElement | null = null;
    let renderSession = 0;
    let source: string | null | undefined;
    let highlighted = false;

    const scheduleTask = (callback: () => void) => {
      if (view) view.setTimeout(callback, 0);
      else setTimeout(callback, 0);
    };
    const scheduleFrame = (callback: () => void) => {
      if (view?.requestAnimationFrame) view.requestAnimationFrame(callback);
      else setTimeout(callback, 16);
    };
    const close = () => {
      renderSession += 1;
      dialog.close();
    };
    const renderCode = (session: number) => {
      if (session !== renderSession || highlighted) return;

      const codeFrame = dialog.querySelector<HTMLElement>(".code-block__frame");
      source ??= parseDeferredContractSource(sourceElement);
      if (!codeFrame || !source) return;

      const progressiveHighlighter = createProgressiveHighlighter(root, source);
      if (!progressiveHighlighter) return;

      let nextLineIndex = 0;
      const appendHighlightChunk = () => {
        if (session !== renderSession) return;

        const lineChunk = progressiveHighlighter.lines.slice(nextLineIndex, nextLineIndex + HIGHLIGHT_CHUNK_LINE_COUNT);
        const chunk = root.createElement("template");
        chunk.innerHTML = lineChunk.join("\n");
        progressiveHighlighter.code.append(chunk.content);
        nextLineIndex += lineChunk.length;

        if (nextLineIndex < progressiveHighlighter.lines.length) {
          scheduleFrame(appendHighlightChunk);
          return;
        }

        if (session === renderSession) {
          codeFrame.replaceChildren(progressiveHighlighter.pre);
          highlighted = true;
          dialog.dataset.openapiContractState = "ready";
        }
      };

      scheduleFrame(appendHighlightChunk);
    };
    const open = (trigger: HTMLButtonElement) => {
      opener = trigger;
      if (highlighted) {
        dialog.dataset.openapiContractState = "ready";
        if (!dialog.open) dialog.showModal();
        return;
      }

      dialog.dataset.openapiContractState = "loading";
      if (!dialog.open) dialog.showModal();
      const session = ++renderSession;
      scheduleTask(() => renderCode(session));
    };
    const onBackdropClick = (event: MouseEvent) => {
      if (event.target === dialog) close();
    };
    const onCancel = (event: Event) => {
      event.preventDefault();
      close();
    };
    const restoreFocus = () => {
      opener?.focus();
      opener = null;
    };

    const triggerListeners = triggers.map((trigger) => {
      const onTriggerClick = () => open(trigger);
      trigger.addEventListener("click", onTriggerClick);
      return { trigger, onTriggerClick };
    });
    closeControl?.addEventListener("click", close);
    dialog.addEventListener("click", onBackdropClick);
    dialog.addEventListener("cancel", onCancel);
    dialog.addEventListener("close", restoreFocus);

    cleanups.push(() => {
      for (const { trigger, onTriggerClick } of triggerListeners) trigger.removeEventListener("click", onTriggerClick);
      closeControl?.removeEventListener("click", close);
      dialog.removeEventListener("click", onBackdropClick);
      dialog.removeEventListener("cancel", onCancel);
      dialog.removeEventListener("close", restoreFocus);
      delete dialog.dataset.openapiContractBound;
    });
  }

  return () => cleanups.forEach((cleanup) => cleanup());
}
