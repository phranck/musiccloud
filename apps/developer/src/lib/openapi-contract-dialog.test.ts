// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bindOpenApiContractDialog } from "./openapi-contract-dialog";

function installDialogBehavior(dialog: HTMLDialogElement) {
  Object.defineProperties(dialog, {
    close: {
      configurable: true,
      value: vi.fn(() => {
        dialog.removeAttribute("open");
        dialog.dispatchEvent(new Event("close"));
      }),
    },
    showModal: {
      configurable: true,
      value: vi.fn(() => dialog.setAttribute("open", "")),
    },
  });
}

describe("OpenAPI contract dialog", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it("opens a loading dialog, then reveals the fully rendered contract", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 16),
    );
    const highlighted = `<pre class="shiki"><code><span class="line">{</span>\n<span class="line">  &quot;openapi&quot;: &quot;3.1.0&quot;</span>\n<span class="line">}</span></code></pre>`;
    const deferredSource = JSON.stringify(highlighted).replace(/</g, "\\u003c");

    document.body.innerHTML = `
      <button type="button" data-openapi-contract-trigger aria-controls="openapi-contract-dialog">View contract</button>
      <script id="openapi-contract-source" type="application/json">${deferredSource}</script>
      <dialog id="openapi-contract-dialog" data-openapi-contract-dialog data-openapi-contract-source="openapi-contract-source">
        <button type="button" data-openapi-contract-close>Close</button>
        <div class="code-block__frame"></div>
      </dialog>
    `;
    const trigger = document.querySelector<HTMLButtonElement>("[data-openapi-contract-trigger]")!;
    const dialog = document.querySelector<HTMLDialogElement>("[data-openapi-contract-dialog]")!;
    const close = document.querySelector<HTMLButtonElement>("[data-openapi-contract-close]")!;
    installDialogBehavior(dialog);
    const cleanup = bindOpenApiContractDialog(document);

    trigger.click();
    expect(dialog.showModal).toHaveBeenCalledOnce();
    expect(dialog.open).toBe(true);
    expect(dialog.dataset.openapiContractState).toBe("loading");
    expect(dialog.querySelector("code")).toBeNull();

    await vi.advanceTimersByTimeAsync(0);
    expect(dialog.querySelector("code")).toBeNull();

    await vi.runAllTimersAsync();
    expect(dialog.querySelector("code")?.textContent).toBe('{\n  "openapi": "3.1.0"\n}');
    expect(dialog.querySelector(".shiki")).not.toBeNull();
    expect(dialog.querySelector(".line")).not.toBeNull();
    expect(dialog.dataset.openapiContractState).toBe("ready");

    dialog.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(dialog.close).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(trigger);

    trigger.click();
    close.click();
    expect(dialog.close).toHaveBeenCalledTimes(2);

    trigger.click();
    const cancel = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(dialog.close).toHaveBeenCalledTimes(3);
    expect(document.activeElement).toBe(trigger);

    cleanup();
  });

  it("does not introduce a request path for the pre-rendered contract", () => {
    const controller = readFileSync(join(import.meta.dirname, "openapi-contract-dialog.ts"), "utf8");

    expect(controller).not.toContain("fetch(");
  });
});
