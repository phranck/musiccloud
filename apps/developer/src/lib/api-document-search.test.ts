// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  buildDocumentSearchIndex,
  clearDocumentSearchHighlight,
  highlightDocumentSearchMatches,
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

  it("marks every prose match while preserving contiguous query phrases", () => {
    document.body.innerHTML = `
      <section id="target">
        <p>Track title metadata is available. A track can have an alternate title.</p>
        <pre><code>track title</code></pre>
      </section>
    `;
    const target = document.getElementById("target") as HTMLElement;

    const marks = highlightDocumentSearchMatches(target, "track title");

    expect(marks.map((mark) => mark.textContent)).toEqual(["Track title", "track", "title"]);
    expect(target.querySelectorAll("mark[data-api-search-highlight]")).toHaveLength(3);
    expect(target.querySelector("code mark")).toBeNull();

    clearDocumentSearchHighlight(document);
    expect(target.querySelector("mark")).toBeNull();
    expect(target.textContent).toContain("Track title metadata is available");
  });
});
