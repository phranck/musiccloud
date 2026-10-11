import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CandidateRowContent } from "@/components/ui/CandidateRowContent";

const DEEZER_COVER_1000 =
  "https://cdn-images.dzcdn.net/images/cover/803b9908e22fc5e948ad627e48fe66ee/1000x1000-000000-80-0-0.jpg";

describe("CandidateRowContent artwork", () => {
  /**
   * The services send their largest artwork. Decoding a list of 1000-pixel
   * covers for 64-pixel rows dropped frames the moment the list appeared.
   */
  it("shows a thumbnail-sized cover in the row", () => {
    const { container } = render(<CandidateRowContent artworkUrl={DEEZER_COVER_1000} primary="Kerala" />);

    expect(container.querySelector("img")?.getAttribute("src")).toContain("/250x250-");
  });

  it("shows a thumbnail-sized cover on the selected row's record as well", () => {
    const { container } = render(
      <CandidateRowContent artworkUrl={DEEZER_COVER_1000} primary="Kerala" slideArtwork slideArtworkActive />,
    );

    const sources = Array.from(container.querySelectorAll("img"), (image) => image.getAttribute("src") ?? "");
    expect(sources.filter((source) => source.includes("dzcdn.net"))).not.toHaveLength(0);
    expect(sources.filter((source) => source.includes("/1000x1000-"))).toHaveLength(0);
  });
});
