import type { ArtistInfoResponse, ArtistTopTrack } from "@musiccloud/shared";
import { render } from "@testing-library/react";
import gsap from "gsap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArtistInfoCard } from "@/components/artist/ArtistInfoCard";
import {
  type ArtistSectionPresence,
  artistSectionPresence,
  effectiveArtistInfoStatus,
  hasArtistInfoContent,
} from "@/components/artist/artistInfoContent";
import type { ArtistCardLabels } from "@/components/artist/artistPanelTypes";
import { AnimatedArtistColumn } from "@/components/share/AnimatedArtistColumn";
import { artistCopy } from "@/copy/artist";

vi.mock("@/hooks/useTrackResolve", () => ({
  useTrackResolve: () => ({ resolving: false, activate: vi.fn() }),
}));

const LABELS: ArtistCardLabels = {
  profile: "Artist Info",
  popularTracks: "Popular Tracks",
  events: "Upcoming Events",
  similar: "Similar Artists",
  profileProvidedBy: "Artist data provided by Spotify, Deezer & Last.fm",
};

const TRACK: ArtistTopTrack = {
  title: "Teardrop",
  artists: ["Massive Attack"],
  albumName: "Mezzanine",
  artworkUrl: null,
  durationMs: null,
  deezerUrl: "https://www.deezer.com/track/1",
  shortId: null,
};

const EMPTY: ArtistInfoResponse = {
  artistName: "Massive Attack",
  topTracks: [],
  profile: null,
  events: [],
  similarArtistTracks: [],
};

/** One payload per section, plus the case that started this: names without tracks. */
const PAYLOADS: Record<string, ArtistInfoResponse> = {
  "a profile only": {
    ...EMPTY,
    profile: {
      imageUrl: null,
      genres: [],
      popularity: null,
      followers: null,
      bioSummary: "A bio.",
      scrobbles: null,
      similarArtists: [],
    },
  },
  "popular tracks only": { ...EMPTY, topTracks: [TRACK] },
  "events only": {
    ...EMPTY,
    events: [
      {
        date: "2027-03-01",
        venueName: "Roundhouse",
        city: "London",
        country: "GB",
        ticketUrl: null,
        source: "bandsintown",
      },
    ],
  },
  "a similar artist with a track only": { ...EMPTY, similarArtistTracks: [{ artistName: "Portishead", track: TRACK }] },
  "similar artists without a track only": {
    ...EMPTY,
    similarArtistTracks: [
      { artistName: "Portishead", track: null },
      { artistName: "Tricky", track: null },
    ],
  },
};

/** jsdom lacks `matchMedia`, which the cards' motion helpers read. */
beforeEach(() => {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false } as MediaQueryList));
});

afterEach(() => {
  gsap.globalTimeline.getChildren(true, true, true).forEach((animation) => animation.kill());
  vi.unstubAllGlobals();
});

describe("artistSectionPresence", () => {
  it("counts a similar artist only when it resolved to a track", () => {
    expect(artistSectionPresence(PAYLOADS["similar artists without a track only"])).toEqual({
      profile: false,
      popularTracks: false,
      events: false,
      similarTracks: false,
    });
    expect(artistSectionPresence(PAYLOADS["a similar artist with a track only"]).similarTracks).toBe(true);
  });

  it("reports nothing for a missing payload", () => {
    expect(hasArtistInfoContent(null)).toBe(false);
    expect(hasArtistInfoContent(PAYLOADS["similar artists without a track only"])).toBe(false);
    expect(hasArtistInfoContent(PAYLOADS["events only"])).toBe(true);
  });
});

describe("effectiveArtistInfoStatus", () => {
  it("prefers the passed status, then a running load, then the content rule", () => {
    expect(effectiveArtistInfoStatus("error", false, PAYLOADS["events only"])).toBe("error");
    expect(effectiveArtistInfoStatus(undefined, true, null)).toBe("loading");
    expect(effectiveArtistInfoStatus(undefined, false, PAYLOADS["events only"])).toBe("ready");
    expect(effectiveArtistInfoStatus(undefined, false, PAYLOADS["similar artists without a track only"])).toBe("empty");
  });
});

/**
 * The presence rule is only worth having if the cards render what it says.
 * Each payload is rendered settled, in the desktop column and in the mobile
 * card, and the sections on screen are compared with the rule's answer.
 */
describe.each(Object.entries(PAYLOADS))("with %s, the cards render what the rule reports", (_name, data) => {
  const presence = artistSectionPresence(data);
  const status = effectiveArtistInfoStatus(undefined, false, data);

  it("in the desktop column", () => {
    const { queryByText } = render(
      <AnimatedArtistColumn
        artistData={data}
        artistLoadStatus={status}
        isLoading={false}
        labels={LABELS}
        nowPlaying={null}
        onArtistResolveStart={() => {}}
        onTrackResolve={async () => {}}
        userRegion=""
        widthPx={512}
      />,
    );
    const rendered: ArtistSectionPresence = {
      profile: queryByText(LABELS.profile) !== null,
      popularTracks: queryByText(LABELS.popularTracks) !== null,
      events: queryByText(LABELS.events) !== null,
      similarTracks: queryByText(LABELS.similar) !== null,
    };

    expect(rendered).toEqual(presence);
  });

  it("in the mobile card", () => {
    const { queryByText } = render(
      <ArtistInfoCard data={data} isLoading={false} labels={LABELS} status={status} userRegion="" />,
    );
    const rendered: ArtistSectionPresence = {
      profile: queryByText(LABELS.profileProvidedBy) !== null,
      popularTracks: queryByText(LABELS.popularTracks) !== null,
      events: queryByText(LABELS.events) !== null,
      similarTracks: queryByText(LABELS.similar) !== null,
    };

    expect(rendered).toEqual(presence);
    expect(queryByText(artistCopy.empty) !== null).toBe(!hasArtistInfoContent(data));
  });
});
