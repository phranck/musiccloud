import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { linkify } from "@/lib/linkify";

function renderLinkify(text: string) {
  return render(<div>{linkify(text)}</div>);
}

describe("linkify", () => {
  it("renders a plain website as a domain-only mc-cardlink opening in a new tab", () => {
    renderLinkify("Visit https://www.pornophonique.de/music for more.");
    const a = document.querySelector("a");
    expect(a).not.toBeNull();
    expect(a?.getAttribute("href")).toBe("https://www.pornophonique.de/music");
    expect(a?.className).toContain("mc-cardlink");
    expect(a?.getAttribute("target")).toBe("_blank");
    expect(a?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(a?.textContent).toBe("pornophonique.de");
    expect(document.body.textContent).toBe("Visit pornophonique.de for more.");
  });

  it("renders a commercial streaming URL as the platform logo only (no visible text)", () => {
    renderLinkify("Listen on https://open.spotify.com/track/abc now");
    const a = document.querySelector('a[aria-label="Spotify"]');
    expect(a).not.toBeNull();
    expect(a?.getAttribute("href")).toBe("https://open.spotify.com/track/abc");
    expect(a?.querySelector("img")).not.toBeNull();
    expect(a?.textContent).toBe("");
    expect(document.body.textContent).toBe("Listen on  now");
  });

  it("normalises a social profile URL to host/@handle text", () => {
    renderLinkify("Follow https://twitter.com/username today");
    const a = document.querySelector("a");
    expect(a?.getAttribute("href")).toBe("https://twitter.com/username");
    expect(a?.className).toContain("mc-cardlink");
    expect(a?.textContent).toBe("twitter.com/@username");
  });

  it("turns an email address into a mailto link without a target", () => {
    renderLinkify("Mail foo.bar@band.de!");
    const a = document.querySelector("a");
    expect(a).not.toBeNull();
    expect(a?.getAttribute("href")).toBe("mailto:foo.bar@band.de");
    expect(a?.hasAttribute("target")).toBe(false);
    expect(a?.textContent).toBe("foo.bar@band.de");
  });

  it("excludes trailing sentence punctuation from the link", () => {
    renderLinkify("Read https://a.org.");
    const a = document.querySelector("a");
    expect(a?.getAttribute("href")).toBe("https://a.org");
    expect(document.body.textContent).toBe("Read a.org.");
  });

  it("linkifies multiple links, preserving the text between them", () => {
    renderLinkify("a https://x.org and b https://y.net done");
    const links = document.querySelectorAll("a");
    expect(links.length).toBe(2);
    expect(links[0].textContent).toBe("x.org");
    expect(links[1].textContent).toBe("y.net");
    expect(document.body.textContent).toBe("a x.org and b y.net done");
  });

  it("leaves plain text without links untouched", () => {
    renderLinkify("No links here at all");
    expect(document.querySelectorAll("a").length).toBe(0);
    expect(document.body.textContent).toBe("No links here at all");
  });
});
