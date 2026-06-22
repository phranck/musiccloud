import { describe, expect, it } from "vitest";
import { jamendoBioToHtml } from "../bio.js";

describe("jamendoBioToHtml", () => {
  it("returns null for empty or missing input", () => {
    expect(jamendoBioToHtml(null)).toBeNull();
    expect(jamendoBioToHtml(undefined)).toBeNull();
    expect(jamendoBioToHtml("")).toBeNull();
    expect(jamendoBioToHtml("   ")).toBeNull();
  });

  it("wraps paragraphs and converts <br> to line breaks", () => {
    const html = jamendoBioToHtml("<p>Line one<br />Line two</p><p>Second para</p>");
    expect(html).toBe("<p>Line one<br>Line two</p><p>Second para</p>");
  });

  it("decodes the typographic entities Jamendo leaves in bios", () => {
    expect(jamendoBioToHtml("<p>that&lsquo;s &amp; more&hellip;</p>")).toBe("<p>that‘s &amp; more…</p>");
  });

  it("strips all tags and escapes any injected markup (no raw user HTML survives)", () => {
    const html = jamendoBioToHtml('<p>hi</p><script>alert(1)</script><img src=x onerror="alert(1)">');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("<img");
  });

  it("re-escapes markup that was encoded as entities so it cannot be reintroduced", () => {
    const html = jamendoBioToHtml("<p>look: &lt;script&gt;evil&lt;/script&gt;</p>");
    expect(html).toBe("<p>look: &lt;script&gt;evil&lt;/script&gt;</p>");
  });

  it("returns null when the markup carries no text", () => {
    expect(jamendoBioToHtml("<p></p><br />")).toBeNull();
  });
});
