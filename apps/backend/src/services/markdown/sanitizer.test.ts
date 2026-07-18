import { describe, expect, it } from "vitest";

import { sanitizeMarkdownHtml } from "./sanitizer.js";

describe("managed Markdown HTML sanitizer", () => {
  it("removes executable elements, event handlers, and dangerous URL schemes", () => {
    const html = sanitizeMarkdownHtml(
      '<p onclick="alert(1)">Safe</p><script>alert(2)</script><iframe src="https://attacker.invalid"></iframe><a href="java\nscript:alert(3)">unsafe</a><img src="data:image/svg+xml,unsafe" onerror="alert(4)">',
    );

    expect(html).toContain("<p>Safe</p>");
    expect(html).toContain("<a>unsafe</a>");
    expect(html).not.toMatch(/<script|<iframe|onclick|onerror|javascript:|data:/i);
  });

  it("preserves the allowlisted Markdown, footnote, and syntax-highlighting contract", () => {
    const html = sanitizeMarkdownHtml(
      '<h2 id="overview">Overview</h2><pre data-card-style="recessed" data-card-padding="0.75rem"><code class="language-js"><span style="color:#A1B2C3;font-style:italic">const</span></code></pre><dl class="mc-fields" style="display:grid;grid-template-columns:9ch minmax(0, 1fr);column-gap:1.25rem"><dt>Name</dt><dd>Value</dd></dl><a href="#fn-1" data-footnote-ref aria-describedby="footnote-label">1</a>',
    );

    expect(html).toContain('<h2 id="overview">Overview</h2>');
    expect(html).toContain('<pre data-card-style="recessed" data-card-padding="0.75rem">');
    expect(html).toContain('<span style="color:#A1B2C3;font-style:italic">const</span>');
    expect(html).toContain(
      '<dl class="mc-fields" style="display:grid;grid-template-columns:9ch minmax(0, 1fr);column-gap:1.25rem">',
    );
    expect(html).toContain('<a href="#fn-1" data-footnote-ref="" aria-describedby="footnote-label">1</a>');
  });
});
