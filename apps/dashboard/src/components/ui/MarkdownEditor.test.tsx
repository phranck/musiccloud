import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarkdownEditor } from "@/components/ui/MarkdownEditor";

function renderEditor(props: Partial<React.ComponentProps<typeof MarkdownEditor>> = {}) {
  const { container } = render(
    <MarkdownEditor id="editor" value="# Heading" onChange={() => {}} showHints {...props} />,
  );
  const wrapper = container.querySelector("#editor");
  if (!wrapper) throw new Error("editor wrapper not found");
  return wrapper;
}

describe("MarkdownEditor", () => {
  it("lays a bounded editor out as a column so the code area can fill it and scroll", () => {
    const wrapper = renderEditor({ height: "100%" });

    expect(wrapper.className).toContain("flex flex-col");
    expect((wrapper as HTMLElement).style.height).toBe("100%");

    const codeArea = wrapper.firstElementChild;
    expect(codeArea?.className).toContain("flex-1");
    expect(codeArea?.className).toContain("min-h-0");
  });

  it("lets an unbounded editor grow with its document", () => {
    const wrapper = renderEditor();

    expect(wrapper.className).not.toContain("flex flex-col");
    expect((wrapper as HTMLElement).style.height).toBe("");
  });
});
