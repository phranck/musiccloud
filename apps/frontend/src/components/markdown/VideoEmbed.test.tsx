import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarkdownHtml } from "@/components/markdown/MarkdownHtml";

const EMBED = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ";

/** The markup the backend renders for a video, as it arrives here. */
function videoHtml(href = EMBED): string {
  return `<figure class="mc-video"><a class="mc-video__link" style="aspect-ratio:16 / 9" href="${href}" rel="noopener noreferrer">Play the video</a></figure>`;
}

describe("a video written into a page", () => {
  it("contacts nothing until a reader asks for it", () => {
    const { container } = render(<MarkdownHtml html={videoHtml()} />);

    expect(container.querySelector("iframe")).toBeNull();
    expect(screen.getByRole("link", { name: "Play the video" })).toBeTruthy();
  });

  it("holds the room the video will take, so nothing jumps when it opens", () => {
    render(<MarkdownHtml html={videoHtml()} />);

    expect(screen.getByRole("link", { name: "Play the video" }).style.aspectRatio).toBe("16 / 9");
  });

  it("becomes the frame on the first click", () => {
    const { container } = render(<MarkdownHtml html={videoHtml()} />);

    fireEvent.click(screen.getByRole("link", { name: "Play the video" }));

    const frame = container.querySelector("iframe");
    expect(frame?.getAttribute("src")).toBe(`${EMBED}?autoplay=1`);
    expect(frame?.style.aspectRatio).toBe("16 / 9");
  });

  it("refuses to open a frame anywhere but the host the renderer builds", () => {
    // The address is read back off the markup here, and markup is not a promise.
    const { container } = render(<MarkdownHtml html={videoHtml("https://evil.example/embed/x")} />);

    fireEvent.click(screen.getByRole("link", { name: "Play the video" }));

    expect(container.querySelector("iframe")).toBeNull();
  });
});
