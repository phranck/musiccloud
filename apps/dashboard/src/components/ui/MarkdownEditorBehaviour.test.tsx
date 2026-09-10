import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MarkdownEditor } from "@/components/ui/MarkdownEditor";

/**
 * The lazy chunk carrying CodeMirror takes a moment to arrive, and under load
 * it takes longer than the default.
 */
const CHUNK_WAIT = { timeout: 10_000 };

/**
 * Mounts the editor and waits until CodeMirror itself is in the document.
 *
 * @param value - What the editor opens with.
 * @returns The rendered container and the editor's content element.
 */
async function mountEditor(value: string) {
  const { container } = render(<MarkdownEditor value={value} onChange={() => {}} showHints={false} />);

  const content = await waitFor(() => {
    const element = container.querySelector(".cm-content");
    if (!element) throw new Error("CodeMirror has not arrived yet");
    return element as HTMLElement;
  }, CHUNK_WAIT);

  return { container, content };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("what the editor draws", () => {
  it("colours each part of a shortcode as its own role", async () => {
    const { content } = await mountEditor('[[icon name="key" size=24]]');

    const roles = [...content.querySelectorAll('[class*="cm-shortcode-"]')].map((span) => ({
      role: span.className,
      text: span.textContent,
    }));

    // The opening pair reaches the DOM as two spans, because the Markdown
    // parser has already split the text there. Both carry the bracket role.
    expect(
      roles
        .filter((span) => span.role === "cm-shortcode-bracket")
        .map((span) => span.text)
        .join(""),
    ).toBe("[[]]");
    expect(roles).toContainEqual({ role: "cm-shortcode-token", text: "icon" });
    expect(roles).toContainEqual({ role: "cm-shortcode-attribute-name", text: "name" });
    expect(roles).toContainEqual({ role: "cm-shortcode-value-string", text: '"key"' });
    expect(roles).toContainEqual({ role: "cm-shortcode-value-bare", text: "24" });
  });

  it("colours a shortcode that a page may not use, so a typo is visible", async () => {
    const { content } = await mountEditor("[[nosuchthing]]");

    expect(content.querySelector(".cm-shortcode-unknown-token")?.textContent).toBe("nosuchthing");
  });

  it("colours a site variable, which is also replaced before a reader sees it", async () => {
    const { content } = await mountEditor("Up to {freeRequestsPerMinute} a minute.");

    expect(content.querySelector(".cm-shortcode-variable")?.textContent).toBe("{freeRequestsPerMinute}");
  });

  it("colours a shortcode indented into what Markdown reads as a code block", async () => {
    // At the default precedence the Markdown mark ends up inside this one and
    // the innermost span decides, so the shortcode came out in the code colour
    // whilst the same shortcode at the margin did not.
    const { content } = await mountEditor("    [[pill:Beta]]");

    expect(content.querySelector(".cm-shortcode-token")?.textContent).toBe("pill");
  });

  it("leaves a container alone until it closes, which is what the page does too", async () => {
    // The scanner the editor colours from is the one the page renders with, so
    // a half-written container is not a shortcode to either of them yet. It
    // takes its colour the moment the closing sequence is typed.
    const { content } = await mountEditor("[[card {");
    expect(content.querySelector(".cm-shortcode-token")).toBeNull();

    const { content: closed } = await mountEditor("[[card {\ncopy\n}]]");
    expect(closed.querySelector(".cm-shortcode-token")?.textContent).toBe("card");
  });
});
