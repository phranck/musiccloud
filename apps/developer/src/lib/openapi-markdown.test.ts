import { describe, expect, it } from "vitest";
import { renderOpenApiMarkdown } from "./openapi-markdown";

describe("renderOpenApiMarkdown", () => {
  it("renders readable OpenAPI Markdown while escaping raw HTML", () => {
    const html = renderOpenApiMarkdown(
      "Use **structured search** with `title:`.\n\n- First item\n- [Reference](https://api.musiccloud.io/docs)\n\n<script>alert('unsafe')</script>",
    );

    expect(html).toContain("<strong>structured search</strong>");
    expect(html).toContain("<code>title:</code>");
    expect(html).toContain("<ul>");
    expect(html).toContain('<a class="content-link text-fg" href="https://api.musiccloud.io/docs">Reference</a>');
    expect(html).toContain("&lt;script&gt;alert('unsafe')&lt;/script&gt;");
    expect(html).not.toContain("<script>");
  });
});
