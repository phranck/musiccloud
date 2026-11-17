import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { COPY_CONFIRMATION_MS, useClipboardCopy } from "./useClipboardCopy";

/**
 * Installs a clipboard whose `writeText` the test controls.
 *
 * @param writeText - What a copy calls.
 */
function stubClipboard(writeText: (value: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
}

describe("useClipboardCopy", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("copies the value and confirms it until the confirmation time has passed", async () => {
    const writeText = vi.fn(async () => undefined);
    stubClipboard(writeText);
    const { result } = renderHook(() => useClipboardCopy());

    await act(() => result.current.copy("{payeeName}"));
    expect(writeText).toHaveBeenCalledWith("{payeeName}");
    expect(result.current.copied).toBe(true);

    act(() => vi.advanceTimersByTime(COPY_CONFIRMATION_MS - 1));
    expect(result.current.copied).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.copied).toBe(false);
  });

  it("confirms nothing when the browser refuses the clipboard", async () => {
    stubClipboard(async () => {
      throw new DOMException("denied", "NotAllowedError");
    });
    const { result } = renderHook(() => useClipboardCopy());

    await act(() => result.current.copy("{payeeName}"));
    expect(result.current.copied).toBe(false);
  });
});
