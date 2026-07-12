// @vitest-environment jsdom

import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bindCodeCopyControls, COPY_SUCCESS_DURATION_MS } from "./code-copy";

describe("code copy controls", () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it("shows CopySuccess for three seconds and resets the timer after another copy", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <div data-code-block>
        <button type="button" data-copy-code data-copy-target="source">
          <span data-copy-icon></span>
          <span data-copy-success hidden></span>
        </button>
        <span data-copy-status></span>
        <pre><code id="source">const value = 1;</code></pre>
      </div>
    `;
    const writeText = vi.fn().mockResolvedValue(undefined);
    const cleanup = bindCodeCopyControls(document, { writeText });
    const button = document.querySelector<HTMLButtonElement>("[data-copy-code]") as HTMLButtonElement;
    const copy = document.querySelector<HTMLElement>("[data-copy-icon]") as HTMLElement;
    const success = document.querySelector<HTMLElement>("[data-copy-success]") as HTMLElement;

    await act(async () => button.click());
    expect(writeText).toHaveBeenCalledWith("const value = 1;");
    expect(copy.hidden).toBe(true);
    expect(success.hidden).toBe(false);
    expect(COPY_SUCCESS_DURATION_MS).toBe(3000);

    await act(async () => vi.advanceTimersByTimeAsync(2500));
    await act(async () => button.click());
    await act(async () => vi.advanceTimersByTimeAsync(2999));
    expect(success.hidden).toBe(false);

    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(copy.hidden).toBe(false);
    expect(success.hidden).toBe(true);
    cleanup();
  });
});
