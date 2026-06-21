import { describe, expect, it } from "vitest";
import { decodeHtmlEntities, escapeHtml } from "../html.js";

describe("decodeHtmlEntities", () => {
  it("decodes the named entities (amp, lt, gt, quot, apos, nbsp)", () => {
    expect(decodeHtmlEntities("R&amp;B")).toBe("R&B");
    expect(decodeHtmlEntities("a &lt; b &gt; c")).toBe("a < b > c");
    expect(decodeHtmlEntities("say &quot;hi&quot;")).toBe('say "hi"');
    expect(decodeHtmlEntities("it&apos;s")).toBe("it's");
    expect(decodeHtmlEntities("a&nbsp;b")).toBe("a b");
  });

  it("decodes decimal and hex numeric references", () => {
    expect(decodeHtmlEntities("it&#39;s")).toBe("it's");
    expect(decodeHtmlEntities("it&#x27;s")).toBe("it's");
    expect(decodeHtmlEntities("caf&#233;")).toBe("café");
  });

  it("decodes several entities in one string", () => {
    expect(decodeHtmlEntities("Rock &amp; Roll &amp; Blues")).toBe("Rock & Roll & Blues");
  });

  it("leaves bare ampersands and unknown entities verbatim", () => {
    // No trailing `;` → not an entity.
    expect(decodeHtmlEntities("Tom & Jerry")).toBe("Tom & Jerry");
    expect(decodeHtmlEntities("AT&T")).toBe("AT&T");
    // Unknown named entity is returned untouched, never blanked.
    expect(decodeHtmlEntities("&notanentity;")).toBe("&notanentity;");
  });

  it("ignores out-of-range numeric references", () => {
    expect(decodeHtmlEntities("&#9999999999;")).toBe("&#9999999999;");
  });
});

describe("escapeHtml", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`<a href="x">Tom & Jerry's</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;",
    );
  });

  it("round-trips with decodeHtmlEntities for the named set", () => {
    const raw = `Tom & Jerry's "B" <tag>`;
    expect(decodeHtmlEntities(escapeHtml(raw))).toBe(raw);
  });
});
