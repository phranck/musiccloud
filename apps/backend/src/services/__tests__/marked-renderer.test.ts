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

  it("highlights ```mc-query genre:jazz with custom grammar tokens", async () => {
    const out = (await marked.parse("```mc-query\ngenre: jazz\n```", { async: true })) as string;
    expect(out).toMatch(/<span style="color:/);
  });

  it("recognizes # comments inside ```mc-query", async () => {
    // Grammar's comment-hash pattern isolates the comment into its own span.
    // vitesse-dark renders comment scopes in its grey-green tint
    // (no italic — that was an incorrect spec assumption).
    const out = (await marked.parse("```mc-query\ngenre: jazz # filter\n```", { async: true })) as string;
    expect(out).toMatch(/<span style="color:#[0-9A-F]+"># filter<\/span>/i);
  });

  it("recognizes // comments inside ```mc-query", async () => {
    const out = (await marked.parse("```mc-query\nartist: foo // note\n```", { async: true })) as string;
    expect(out).toMatch(/<span style="color:#[0-9A-F]+">\/\/ note<\/span>/i);
  });

  it("falls back gracefully for unknown language not in highlighter list", async () => {
    // ruby is a real Shiki bundled lang but not in our explicit highlighter
    // langs-list. The singleton must throw in codeToHtml and our catch-block
    // must render escaped plain text instead of crashing the whole pipeline.
    const out = (await marked.parse("```ruby\nputs :hi\n```", { async: true })) as string;
    expect(out).toContain("puts");
  });

  it("renders an alert [[pill:...]] marker", async () => {
    const out = (await marked.parse("foo [[pill:REQ tone=alert]] bar", { async: true })) as string;
    expect(out).toContain('<span class="mc-pill mc-pill-alert">REQ</span>');
  });

  it("allows spaces in [[pill:...]] labels before trailing options", async () => {
    const out = (await marked.parse("foo [[pill:TITLE ODER ARTIST tone=alert]] bar", {
      async: true,
    })) as string;
    expect(out).toContain('<span class="mc-pill mc-pill-alert">TITLE ODER ARTIST</span>');
  });

  it("defaults [[pill:...]] to neutral tone and preserves casing", async () => {
    const out = (await marked.parse("foo [[pill:Info]] bar", { async: true })) as string;
    expect(out).toContain('<span class="mc-pill mc-pill-neutral">Info</span>');
  });

  it("applies [[pill:...]] case options", async () => {
    const out = (await marked.parse("foo [[pill:done tone=success case=upper]] [[pill:LOUD case=lower]]", {
      async: true,
    })) as string;
    expect(out).toContain('<span class="mc-pill mc-pill-success">DONE</span>');
    expect(out).toContain('<span class="mc-pill mc-pill-neutral">loud</span>');
  });

  it("ignores unknown [[pill:...]] options", async () => {
    const out = (await marked.parse("foo [[pill:Status tone=danger case=title]] bar", { async: true })) as string;
    expect(out).toContain('<span class="mc-pill mc-pill-neutral">Status</span>');
  });

  it("keeps key-value text as a label when no pill label precedes it", async () => {
    const out = (await marked.parse("foo [[pill:A=B]] bar", { async: true })) as string;
    expect(out).toContain('<span class="mc-pill mc-pill-neutral">A=B</span>');
  });

  it("escapes HTML in [[pill:...]] labels", async () => {
    const out = (await marked.parse("foo [[pill:<script> tone=alert]] bar", { async: true })) as string;
    expect(out).toContain('<span class="mc-pill mc-pill-alert">&lt;script&gt;</span>');
    expect(out).not.toContain("<script>");
  });

  it("leaves legacy badge markers as plain text", async () => {
    const out = (await marked.parse("foo [[REQ]] [[REQUIRED]] [[OPT]] bar", { async: true })) as string;
    expect(out).not.toContain("mc-pill");
    expect(out).toContain("[[REQ]]");
    expect(out).toContain("[[REQUIRED]]");
    expect(out).toContain("[[OPT]]");
  });

  it("renders {{Esc}} as a mc-kbd element", async () => {
    const out = (await marked.parse("press {{Esc}} now", { async: true })) as string;
    expect(out).toContain('<kbd class="mc-kbd">Esc</kbd>');
  });

  it("escapes HTML inside {{...}} kbd content", async () => {
    const out = (await marked.parse("test {{<script>}} end", { async: true })) as string;
    expect(out).toContain('<kbd class="mc-kbd">&lt;script&gt;</kbd>');
    expect(out).not.toContain("<script>");
  });

  it("renders :::fields blocks as definition lists with dynamic label width", async () => {
    const out = (await marked.parse(
      ":::fields\ngenre: Genre name or Genre1|Genre2 [[pill:REQ tone=alert]]\ncount: Applies the same amount to tracks, albums, and artists. {{Esc}}\n:::\n",
      { async: true },
    )) as string;

    expect(out).toContain('<dl class="mc-fields"');
    expect(out).toContain("grid-template-columns:max-content minmax(0, 1fr)");
    expect(out).toContain("column-gap:1.1rem");
    expect(out).toContain("<dt>genre:</dt>");
    expect(out).toContain('<span class="mc-pill mc-pill-alert">REQ</span>');
    expect(out).toContain("<dt>count:</dt>");
    expect(out).toContain('<kbd class="mc-kbd">Esc</kbd>');
  });

  it("accepts fixed labelWidth and gap options for :::fields blocks", async () => {
    const out = (await marked.parse(
      ":::fields labelWidth=9ch gap=1.25rem\ngenre: Jazz [[pill:REQ tone=alert]]\ntracks: 1-50 [[pill:OPT]]\n:::\n",
      { async: true },
    )) as string;

    expect(out).toContain("grid-template-columns:9ch minmax(0, 1fr)");
    expect(out).toContain("column-gap:1.25rem");
    expect(out).toContain('<span class="mc-pill mc-pill-neutral">OPT</span>');
  });

  it("ignores unsafe :::fields layout values", async () => {
    const out = (await marked.parse(
      ":::fields labelWidth=url(javascript:alert(1)) gap=calc(1rem+1px)\nname: value\n:::\n",
      { async: true },
    )) as string;

    expect(out).toContain("grid-template-columns:max-content minmax(0, 1fr)");
    expect(out).toContain("column-gap:1.1rem");
    expect(out).not.toContain("javascript");
    expect(out).not.toContain("calc");
  });

  it("escapes :::fields labels", async () => {
    const out = (await marked.parse(":::fields\n<script>: value\n:::\n", { async: true })) as string;
    expect(out).toContain("<dt>&lt;script&gt;:</dt>");
    expect(out).not.toContain("<script>");
  });
});
