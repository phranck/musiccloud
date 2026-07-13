import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ArtistPanelList } from "@/components/artist/ArtistPanelList";
import { ArtistPanelRow } from "@/components/artist/ArtistPanelRow";

const FULL = "var(--neu-radius)";
const INNER = "min(5px, var(--neu-radius))";

describe("ArtistPanelList grouped corners", () => {
  it("derives the first and last event row corners from their list positions", () => {
    const { container } = render(
      <ArtistPanelList>
        <ArtistPanelRow href="https://example.test/first">First event</ArtistPanelRow>
        <ArtistPanelRow href="https://example.test/last">Last event</ArtistPanelRow>
      </ArtistPanelList>,
    );

    const rows = Array.from(container.querySelectorAll("a"));

    expect(rows[0]).toHaveStyle({
      borderTopLeftRadius: FULL,
      borderTopRightRadius: FULL,
      borderBottomLeftRadius: INNER,
      borderBottomRightRadius: INNER,
    });
    expect(rows[1]).toHaveStyle({
      borderTopLeftRadius: INNER,
      borderTopRightRadius: INNER,
      borderBottomLeftRadius: FULL,
      borderBottomRightRadius: FULL,
    });
  });
});
