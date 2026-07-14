import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CoverImage } from "@/components/ui/CoverImage";
import { SlideArtworkKind } from "@/components/ui/SlideArtworkTypes";

describe("CoverImage compact fallback", () => {
  it("renders the Generic Single when square artwork is missing", () => {
    const { container } = render(<CoverImage imgDim={48} kind={SlideArtworkKind.Square} />);

    expect(
      container.querySelector("[data-cover-fallback-disc='true'] [data-vinyl-disc-format='single']"),
    ).toHaveAttribute("data-vinyl-label-variant", "generic");
  });

  it("replaces a failed square cover with the Generic Single", () => {
    const { container } = render(
      <CoverImage artworkUrl="/missing-cover.jpg" imgDim={48} kind={SlideArtworkKind.Square} />,
    );

    fireEvent.error(container.querySelector("img") as HTMLImageElement);

    expect(
      container.querySelector("[data-cover-fallback-disc='true'] [data-vinyl-disc-format='single']"),
    ).toHaveAttribute("data-vinyl-label-variant", "generic");
  });

  it("keeps the user icon fallback for missing round artist artwork", () => {
    const { container } = render(<CoverImage imgDim={48} kind={SlideArtworkKind.Round} />);

    expect(container.querySelector("[data-cover-fallback-disc='true']")).not.toBeInTheDocument();
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
