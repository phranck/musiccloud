import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MediaCardHead } from "@/components/cards/MediaCardHead";
import { MediaCardContentTypeValue, type ShareContentConfiguration } from "@/lib/types/media-card";

const songInfoProps = vi.hoisted(() => ({ current: null as { artist: string } | null }));
vi.mock("@/components/cards/SongInfo", () => ({
  SongInfo: (props: { artist: string }) => {
    songInfoProps.current = props;
    return null;
  },
}));

const SHARE_CONFIG: ShareContentConfiguration = {
  type: MediaCardContentTypeValue.Share,
  title: "Juanitos",
  artist: "",
  artworkUrl: "",
  platforms: [],
  platformsLabel: "",
  shortUrl: "https://musiccloud.local/lwo02WYT",
};

describe("MediaCardHead display rows", () => {
  /**
   * An artist's own card has no artist to name on the display's second row, and
   * a blank row made the card read like a track's. The row says "Artist" instead.
   */
  it("shows the kind line on the second display row when the card sets one", () => {
    render(<MediaCardHead content={{ ...SHARE_CONFIG, kindLine: "Artist" }} animated={false} />);
    expect(songInfoProps.current?.artist).toBe("Artist");
  });

  it("shows the artist on the second display row otherwise", () => {
    render(
      <MediaCardHead
        content={{ ...SHARE_CONFIG, title: "Everybody Loves The Partys", artist: "Juanitos" }}
        animated={false}
      />,
    );
    expect(songInfoProps.current?.artist).toBe("Juanitos");
  });
});
