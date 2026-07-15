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

  it("formats unmarked API representations as inline code", () => {
    const html = renderOpenApiMarkdown(
      'Call POST /api/v1/resolve with `X-API-Key`. The response is application/json with a string or null value, uses ISO-8601 (YYYY-MM-DD), and may include status: "cc-track".',
    );

    expect(html).toContain("<code>POST /api/v1/resolve</code>");
    expect(html).toContain("<code>X-API-Key</code>");
    expect(html).toContain("<code>application/json</code>");
    expect(html).toContain("<code>string</code>");
    expect(html).toContain("<code>null</code>");
    expect(html).toContain("<code>ISO-8601</code>");
    expect(html).toContain("<code>YYYY-MM-DD</code>");
    expect(html).toContain("<code>status: &quot;cc-track&quot;</code>");
  });
});
