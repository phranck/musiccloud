import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApiContent } from "./ApiContent";

describe("ApiContent", () => {
  it("normalizes chapters and entries from their headings through their content", () => {
    const html = renderToStaticMarkup(
      <ApiContent data-api-search-root>
        <ApiContent.Chapter aria-labelledby="chapter-title">
          <ApiContent.Chapter.Header id="chapter-title">
            <ApiContent.Chapter.Header.Icon>Icon</ApiContent.Chapter.Header.Icon>
            <ApiContent.Chapter.Header.Title>Chapter</ApiContent.Chapter.Header.Title>
          </ApiContent.Chapter.Header>
          <ApiContent.Chapter.Body>
            <ApiContent.Entry>
              <ApiContent.Entry.Title>Entry</ApiContent.Entry.Title>
              <ApiContent.Entry.Content>Content</ApiContent.Entry.Content>
            </ApiContent.Entry>
          </ApiContent.Chapter.Body>
        </ApiContent.Chapter>
      </ApiContent>,
    );

    expect(html).toContain('class="api-reference-content api-content"');
    expect(html).toContain('data-api-search-root="true"');
    expect(html).toMatch(
      /<section[^>]*class="api-content__chapter"[^>]*aria-labelledby="chapter-title"|<section[^>]*aria-labelledby="chapter-title"[^>]*class="api-content__chapter"/,
    );
    expect(html).toMatch(
      /<h2[^>]*class="api-content__chapter-header"[^>]*id="chapter-title"|<h2[^>]*id="chapter-title"[^>]*class="api-content__chapter-header"/,
    );
    expect(html).toContain('<span class="api-content__chapter-header-icon">Icon</span>');
    expect(html).toContain('<span class="api-content__chapter-header-title">Chapter</span>');
    expect(html).toContain('<div class="api-content__chapter-body">');
    expect(html).toContain('<div class="api-content__entry">');
    expect(html).toContain('<h3 class="api-content__entry-title">Entry</h3>');
    expect(html).toContain('<div class="api-content__entry-content">Content</div>');
  });
});
