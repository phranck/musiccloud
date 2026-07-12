// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  buildDocumentSearchIndex,
  clearDocumentSearchHighlight,
  highlightDocumentSearchMatch,
  searchDocumentIndex,
} from "./api-document-search";

describe("API document search", () => {
  it("indexes grouped visible prose but excludes fenced code content", () => {
    document.body.innerHTML = `
      <main data-api-search-root>
        <article
          id="endpoint-post-api-v1-resolve"
          data-api-search-entry
          data-api-search-group="Resolve"
          data-api-search-title="Quick resolve"
          data-api-search-addon="POST"
        >
          <h3>Quick resolve</h3>
          <p>Resolve a music URL or structured query.</p>
          <pre><code>MUSICCLOUD_API_KEY apiV1ResolvePost</code></pre>
        </article>
      </main>
    `;

    const index = buildDocumentSearchIndex(document.querySelector("[data-api-search-root]") as HTMLElement);

    expect(index).toHaveLength(1);
    expect(index[0]).toMatchObject({
      group: "Resolve",
      title: "Quick resolve",
      addon: "POST",
      targetId: "endpoint-post-api-v1-resolve",
    });
    expect(index[0]?.text).toContain("Resolve a music URL or structured query");
    expect(index[0]?.text).not.toContain("MUSICCLOUD_API_KEY");
    expect(searchDocumentIndex(index, "music url")[0]?.results[0]?.title).toBe("Quick resolve");
    expect(searchDocumentIndex(index, "apiV1ResolvePost")).toEqual([]);
  });

  it("marks only the first matching prose occurrence and restores the DOM", () => {
    document.body.innerHTML = `
      <section id="target">
        <p>Missing, invalid, or revoked API key. Invalid keys return 401.</p>
        <pre><code>invalid</code></pre>
      </section>
    `;
    const target = document.getElementById("target") as HTMLElement;

    const mark = highlightDocumentSearchMatch(target, "invalid");

    expect(mark?.textContent).toBe("invalid");
    expect(target.querySelectorAll("mark[data-api-search-highlight]")).toHaveLength(1);
    expect(target.querySelector("code mark")).toBeNull();

    clearDocumentSearchHighlight(document);
    expect(target.querySelector("mark")).toBeNull();
    expect(target.textContent).toContain("Missing, invalid, or revoked API key");
  });
});
