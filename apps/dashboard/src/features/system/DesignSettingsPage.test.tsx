import { EditorView } from "@codemirror/view";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { dashboardCopy } from "@/copy/dashboard";
import { DesignSettingsPage } from "@/features/system/DesignSettingsPage";
import { api } from "@/lib/api";

const m = dashboardCopy.design;

/** The lazy chunk carrying CodeMirror takes a moment to arrive, longer under load. */
const CHUNK_WAIT = { timeout: 10_000 };

/** A design-token blob as it is usually stored: on one line. */
const STORED_JSON = '{"glass":{"card":{"day":{"shadow":0.4}}}}';

/**
 * Renders the page with `stored` as the saved design-token blob.
 *
 * @param stored - The value of the `design_tokens` site setting.
 * @returns The rendered container.
 */
function renderPage(stored: string) {
  vi.spyOn(api, "get").mockResolvedValue({ design_tokens: stored });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DesignSettingsPage />
    </QueryClientProvider>,
  ).container;
}

/**
 * Waits until the editor shows `firstLine` on its first line.
 *
 * @param container - The rendered page.
 * @param firstLine - The text the first line should hold.
 * @returns The editor's line elements.
 */
async function editorLines(container: HTMLElement, firstLine: string) {
  return waitFor(() => {
    const lines = [...container.querySelectorAll(".cm-line")];
    if (lines[0]?.textContent !== firstLine) throw new Error("the editor does not show the text yet");
    return lines;
  }, CHUNK_WAIT);
}

describe("DesignSettingsPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows the stored blob formatted, with line numbers and colored keys, and nothing to save", async () => {
    const container = renderPage(STORED_JSON);

    const lines = await editorLines(container, "{");
    expect(lines.map((line) => line.textContent)).toEqual([
      "{",
      '  "glass": {',
      '    "card": {',
      '      "day": {',
      '        "shadow": 0.4',
      "      }",
      "    }",
      "  }",
      "}",
    ]);
    expect(container.querySelector(".cm-lineNumbers")).not.toBeNull();
    const key = [...container.querySelectorAll(".cm-line span")].find((span) => span.textContent === '"glass"');
    expect(key?.className).not.toBe("");
    expect(container.querySelector(".cm-content")?.getAttribute("aria-labelledby")).toBe("design-tokens-json-label");
    expect((screen.getByRole("button", { name: dashboardCopy.common.save }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: m.format }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows a stored blob that does not parse as it is, so it can be repaired", async () => {
    const container = renderPage('{"glass": ');

    await editorLines(container, '{"glass": ');
    expect(screen.getByText(m.invalidJson)).not.toBeNull();
    expect((screen.getByRole("button", { name: m.format }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("formats pasted JSON on Format, which then counts as a change to save", async () => {
    const container = renderPage("");
    const content = await waitFor(() => {
      const element = container.querySelector(".cm-content");
      if (!element) throw new Error("CodeMirror has not arrived yet");
      return element as HTMLElement;
    }, CHUNK_WAIT);

    const view = EditorView.findFromDOM(content);
    act(() => view?.dispatch({ changes: { from: 0, insert: '{"a":[1,true,null]}' } }));
    const format = screen.getByRole("button", { name: m.format }) as HTMLButtonElement;
    expect(format.disabled).toBe(false);

    fireEvent.click(format);

    const lines = await editorLines(container, "{");
    expect(lines.map((line) => line.textContent)).toEqual([
      "{",
      '  "a": [',
      "    1,",
      "    true,",
      "    null",
      "  ]",
      "}",
    ]);
    expect(format.disabled).toBe(true);
    expect((screen.getByRole("button", { name: dashboardCopy.common.save }) as HTMLButtonElement).disabled).toBe(false);
  });
});
