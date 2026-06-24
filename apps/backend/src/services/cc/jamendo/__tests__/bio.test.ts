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

  it("preserves a safe link, forcing https and dropping a leading www.", () => {
    const html = jamendoBioToHtml(
      '<p><a href="http://www.instagram.com/tamaralaurel">Instagram: @TamaraLaurel</a></p>',
    );
    expect(html).toBe('<p><a href="https://instagram.com/tamaralaurel">Instagram: @TamaraLaurel</a></p>');
  });

  it("keeps a mailto link as-is", () => {
    expect(jamendoBioToHtml('<p><a href="mailto:hi@band.de">write me</a></p>')).toBe(
      '<p><a href="mailto:hi@band.de">write me</a></p>',
    );
  });

  it("drops an unsafe-scheme link but keeps its text", () => {
    expect(jamendoBioToHtml('<p><a href="javascript:alert(1)">click</a></p>')).toBe("<p>click</p>");
  });

  it("strips every attribute except the href from a preserved link", () => {
    expect(jamendoBioToHtml('<p><a href="https://x.com" onclick="alert(1)" target="_blank">y</a></p>')).toBe(
      '<p><a href="https://x.com">y</a></p>',
    );
  });

  it("escapes the href and text of a preserved link", () => {
    const html = jamendoBioToHtml('<p><a href="https://x.com/?a=1&b=2">a & b</a></p>');
    expect(html).toBe('<p><a href="https://x.com/?a=1&amp;b=2">a &amp; b</a></p>');
  });

  it("preserves multiple links across paragraphs (real Jamendo bio shape)", () => {
    const raw =
      '<p>Singer-Songwriter.</p> <p><a href="http://www.tamaralaurel.com">www.tamaralaurel.com</a></p> <p><a href="http://www.twitter.com/tamaralaurel">Twitter: @TamaraLaurel</a></p>';
    expect(jamendoBioToHtml(raw)).toBe(
      '<p>Singer-Songwriter.</p><p><a href="https://tamaralaurel.com">www.tamaralaurel.com</a></p><p><a href="https://twitter.com/tamaralaurel">Twitter: @TamaraLaurel</a></p>',
    );
  });
});
