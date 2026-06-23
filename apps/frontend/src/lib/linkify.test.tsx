import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { linkify } from "@/lib/linkify";

function renderLinkify(text: string) {
  return render(<div>{linkify(text)}</div>);
}

describe("linkify", () => {
  it("wraps a bare http URL in an mc-cardlink anchor opening in a new tab", () => {
    renderLinkify("Visit http://example.com for more.");
    const a = document.querySelector("a");
    expect(a).not.toBeNull();
    expect(a?.getAttribute("href")).toBe("http://example.com");
    expect(a?.className).toContain("mc-cardlink");
    expect(a?.getAttribute("target")).toBe("_blank");
    expect(a?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(a?.textContent).toBe("http://example.com");
    expect(document.body.textContent).toBe("Visit http://example.com for more.");
  });

  it("prefixes scheme-less www. URLs with https:// in href but keeps the visible label", () => {
    renderLinkify("See www.jamendo.com/artist/42 now");
    const a = document.querySelector("a");
    expect(a?.getAttribute("href")).toBe("https://www.jamendo.com/artist/42");
    expect(a?.textContent).toBe("www.jamendo.com/artist/42");
  });

  it("turns an email address into a mailto link without a target", () => {
    renderLinkify("Mail foo.bar@band.co.uk!");
    const a = document.querySelector("a");
    expect(a).not.toBeNull();
    expect(a?.getAttribute("href")).toBe("mailto:foo.bar@band.co.uk");
    expect(a?.hasAttribute("target")).toBe(false);
    expect(a?.textContent).toBe("foo.bar@band.co.uk");
    expect(document.body.textContent).toBe("Mail foo.bar@band.co.uk!");
  });

  it("excludes trailing sentence punctuation from the link", () => {
    renderLinkify("Read https://a.org.");
    const a = document.querySelector("a");
    expect(a?.getAttribute("href")).toBe("https://a.org");
    expect(document.body.textContent).toBe("Read https://a.org.");
  });

  it("linkifies multiple links in one run, preserving the text between them", () => {
    renderLinkify("a https://x.org and b https://y.net done");
    const links = document.querySelectorAll("a");
    expect(links.length).toBe(2);
    expect(links[0].getAttribute("href")).toBe("https://x.org");
    expect(links[1].getAttribute("href")).toBe("https://y.net");
    expect(document.body.textContent).toBe("a https://x.org and b https://y.net done");
  });

  it("leaves plain text without links untouched", () => {
    renderLinkify("No links here at all");
    expect(document.querySelectorAll("a").length).toBe(0);
    expect(document.body.textContent).toBe("No links here at all");
  });
});
