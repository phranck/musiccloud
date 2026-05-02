import { describe, expect, it } from "vitest";

// admin-content.ts side-effects: marked.use(...) which sets up the custom code renderer.
import "../admin-content.js";

import { marked } from "marked";

describe("marked custom code renderer", () => {
  it("emits language class for plain ```js block", async () => {
    const out = (await marked.parse("```js\nconst x = 1;\n```", { async: true })) as string;
    expect(out).toMatch(/<pre>(?:<code class="language-js">)/);
    expect(out).not.toContain("data-card-style");
  });

  it("emits data-card-style='recessed' for ```js recessed block", async () => {
    const out = (await marked.parse("```js recessed\nconst x = 1;\n```", { async: true })) as string;
    expect(out).toMatch(/<pre data-card-style="recessed">/);
    expect(out).toContain('class="language-js"');
  });

  it("emits data-card-style='embossed' for ```js embossed block", async () => {
    const out = (await marked.parse("```js embossed\nconst x = 1;\n```", { async: true })) as string;
    expect(out).toMatch(/<pre data-card-style="embossed">/);
    expect(out).toContain('class="language-js"');
  });

  it("emits data-card-style without language for ```recessed block", async () => {
    const out = (await marked.parse("```recessed\nplain text\n```", { async: true })) as string;
    expect(out).toMatch(/<pre data-card-style="recessed">/);
    expect(out).not.toContain('class="language-');
  });

  it("emits data-card-style without language for ```embossed block", async () => {
    const out = (await marked.parse("```embossed\nplain text\n```", { async: true })) as string;
    expect(out).toMatch(/<pre data-card-style="embossed">/);
    expect(out).not.toContain('class="language-');
  });

  it("ignores unknown modifier (```js foobar treated as ```js)", async () => {
    const out = (await marked.parse("```js foobar\nconst x = 1;\n```", { async: true })) as string;
    expect(out).toContain('class="language-js"');
    expect(out).not.toContain("data-card-style");
  });

  it("inline code stays unchanged", async () => {
    const out = (await marked.parse("hello `foo` world", { async: true })) as string;
    expect(out).toContain("<code>foo</code>");
    expect(out).not.toContain("data-card-style");
  });

  it("highlights ```js with shiki tokens", async () => {
    // After marked-highlight integration, ```js parsing must be async.
    const out = (await marked.parse("```js\nconst x = 1;\n```", { async: true })) as string;
    expect(out).toMatch(/<span style="color:/);
  });

  it("falls back to plain text for unknown language", async () => {
    const out = (await marked.parse("```nonexistent-lang\nplain\n```", { async: true })) as string;
    expect(out).toContain("<pre");
    expect(out).toContain("plain");
  });
});
