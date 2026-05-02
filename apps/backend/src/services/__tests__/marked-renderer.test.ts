import { describe, expect, it } from "vitest";

// admin-content.ts side-effects: marked.use(...) which sets up the custom code renderer.
import "../admin-content.js";

import { marked } from "marked";

describe("marked custom code renderer", () => {
  it("default-recessed wraps plain ```js block", async () => {
    const out = (await marked.parse("```js\nconst x = 1;\n```", { async: true })) as string;
    expect(out).toMatch(/<pre data-card-style="recessed"><code class="language-js">/);
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

  it("ignores unknown modifier (```js foobar treated as ```js) and defaults to recessed wrap", async () => {
    const out = (await marked.parse("```js foobar\nconst x = 1;\n```", { async: true })) as string;
    expect(out).toContain('class="language-js"');
    expect(out).toMatch(/<pre data-card-style="recessed"><code class="language-js">/);
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

  it("emits data-card-padding when modifier+padding given", async () => {
    const out = (await marked.parse("```js recessed padding=0.75rem\nconst x = 1;\n```", { async: true })) as string;
    expect(out).toMatch(/<pre data-card-style="recessed" data-card-padding="0\.75rem">/);
  });

  it("emits data-card-radius when modifier+radius given", async () => {
    const out = (await marked.parse("```js recessed radius=1rem\nconst x = 1;\n```", { async: true })) as string;
    expect(out).toMatch(/<pre data-card-style="recessed" data-card-radius="1rem">/);
  });

  it("emits both data-card-padding and data-card-radius for embossed modifier", async () => {
    const out = (await marked.parse("```js embossed padding=0.5rem radius=12px\nconst x = 1;\n```", {
      async: true,
    })) as string;
    expect(out).toMatch(/<pre data-card-style="embossed" data-card-padding="0\.5rem" data-card-radius="12px">/);
  });

  it("default-recessed wraps an empty (no-lang, no-modifier) fenced block", async () => {
    const out = (await marked.parse("```\nplain text\n```", { async: true })) as string;
    expect(out).toMatch(/<pre data-card-style="recessed">/);
    expect(out).not.toContain('class="language-');
  });

  it("applies padding/radius with default-recessed modifier when no explicit modifier", async () => {
    const out = (await marked.parse("```js padding=1rem radius=12px\nconst x = 1;\n```", { async: true })) as string;
    expect(out).toMatch(/<pre data-card-style="recessed" data-card-padding="1rem" data-card-radius="12px">/);
    expect(out).toContain('class="language-js"');
  });

  it("styles # comments grey+italic in ```text fences", async () => {
    const out = (await marked.parse("```text\n# a comment\nplain text\n```", { async: true })) as string;
    expect(out).toContain('<span style="color:#9A9AA0;font-style:italic"># a comment</span>');
    expect(out).toContain("plain text");
    expect(out).not.toContain('<span style="color:#9A9AA0;font-style:italic">plain text</span>');
  });

  it("styles // comments grey+italic in ```text fences", async () => {
    const out = (await marked.parse("```text\n// note\nbody\n```", { async: true })) as string;
    expect(out).toContain('<span style="color:#9A9AA0;font-style:italic">// note</span>');
  });

  it("preserves leading whitespace before commenting span in ```text fences", async () => {
    const out = (await marked.parse("```text\n    # indented\n```", { async: true })) as string;
    expect(out).toContain('    <span style="color:#9A9AA0;font-style:italic"># indented</span>');
  });

  it("does not style # or // when they appear mid-line in ```text fences", async () => {
    const out = (await marked.parse("```text\nfoo # not a comment\n```", { async: true })) as string;
    expect(out).not.toContain('<span style="color:#9A9AA0;font-style:italic">');
    expect(out).toContain("foo # not a comment");
  });

  it("text intercept is case-insensitive on the lang", async () => {
    const out = (await marked.parse("```TEXT\n# upper\n```", { async: true })) as string;
    expect(out).toContain('<span style="color:#9A9AA0;font-style:italic"># upper</span>');
  });

  it("text intercept still fires when modifiers follow the lang token", async () => {
    // marked passes the full info-string as `lang` to the highlight callback;
    // the renderer must parse out the actual lang before deciding on the
    // text-comment intercept, otherwise modifier-bearing fences fall through
    // to Shiki's plain-text grammar and miss the comment styling entirely.
    const out = (await marked.parse(
      "```text recessed padding=0.75rem radius=0.75rem\n// commented line\nplain line\n```",
      { async: true },
    )) as string;
    expect(out).toContain('<span style="color:#9A9AA0;font-style:italic">// commented line</span>');
    expect(out).toMatch(/<pre data-card-style="recessed" data-card-padding="0\.75rem" data-card-radius="0\.75rem">/);
  });

  it("shiki highlighting still fires when modifiers follow the lang token", async () => {
    // Same root cause as the text intercept: ```js recessed padding=… must
    // strip the modifiers before handing the lang to Shiki, otherwise no
    // <span style="color:…"> tokens appear in the body.
    const out = (await marked.parse("```js recessed padding=0.75rem\nconst x = 1;\n```", { async: true })) as string;
    expect(out).toMatch(/<span style="color:/);
    expect(out).toMatch(/<pre data-card-style="recessed" data-card-padding="0\.75rem">/);
  });
});
