import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TftScreen } from "@/components/ui/TftScreen";

describe("TftScreen compound", () => {
  it("renders the root frame with the member overlays composed inside it", () => {
    const { container } = render(
      <TftScreen className="size-full" data-media-stage="cover">
        <TftScreen.Cover image="/covers/blue-train.jpg" alt="" />
        <TftScreen.Tint />
        <TftScreen.Grid />
        <TftScreen.Sheen />
        <TftScreen.Shadow />
      </TftScreen>,
    );

    const root = container.querySelector(".mc-tft-screen");
    expect(root).toHaveClass("size-full");
    // Pass-through attributes reach the underlying div.
    expect(root).toHaveAttribute("data-media-stage", "cover");
    expect(container.querySelector(".mc-tft-screen-content")).toBeInTheDocument();
    expect(container.querySelector(".mc-tft-screen-tint")).toBeInTheDocument();
    expect(container.querySelector(".mc-tft-screen-matrix")).toBeInTheDocument();
    expect(container.querySelector(".mc-tft-screen-sheen")).toBeInTheDocument();
    expect(container.querySelector(".mc-tft-screen-shadow")).toBeInTheDocument();
  });

  it("renders an <img> with the given src when Cover gets an image", () => {
    const { container } = render(
      <TftScreen>
        <TftScreen.Cover image="/covers/giant-steps.jpg" alt="Giant Steps" />
      </TftScreen>,
    );

    const img = container.querySelector(".mc-tft-screen-content img");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "/covers/giant-steps.jpg");
    expect(img).toHaveAttribute("alt", "Giant Steps");
  });

  it("renders children inside the content layer when Cover gets no image", () => {
    const { container } = render(
      <TftScreen>
        <TftScreen.Cover>
          <span data-testid="custom-cover">buffer</span>
        </TftScreen.Cover>
      </TftScreen>,
    );

    const content = container.querySelector(".mc-tft-screen-content");
    expect(content?.querySelector("[data-testid='custom-cover']")).toBeInTheDocument();
    // No image shortcut means no <img> is emitted.
    expect(content?.querySelector("img")).toBeNull();
  });
});
