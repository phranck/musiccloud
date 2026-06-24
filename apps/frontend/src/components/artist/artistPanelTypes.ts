import type { ArtistTopTrack } from "@musiccloud/shared";

/**
 * Handler invoked when a user activates an artist-panel track row to resolve
 * and play it in place. Receives the row's {@link ArtistTopTrack} and resolves
 * once the resolve/playback flow has been kicked off, or rejects on failure
 * (the row surfaces the rejection as a toast).
 *
 * Lives in this neutral types module — not in a component file — so the row
 * component (`PopularTrack`), its sections, and the share-layout consumers can
 * all import it without forming a circular dependency through each other.
 */
export type ArtistPanelTrackResolveHandler = (track: ArtistTopTrack) => Promise<void>;

/**
 * One normalized entry for the shared artist track list/grid — the "protocol"
 * the presentation consumes. The owner maps the raw {@link import("@musiccloud/shared").ArtistInfoResponse}
 * parts (the artist's own top tracks, or similar-artist tracks) into this shape,
 * so the list/grid components stay pure presentation and never know which source
 * produced a row.
 *
 * @property track - The track to show (cover, title, duration) and resolve on activation.
 * @property artistLabel - The other artist's name, shown as a subline for similar
 *   tracks; omitted for the artist's own popular tracks (which may show the album).
 */
export interface ArtistTrackItem {
  track: ArtistTopTrack;
  artistLabel?: string;
}

/**
 * Load phase of the artist-info fetch. Shared by the artist cards (which render
 * per-phase content) and `ShareLayout` (which drives the phase via its reducer
 * and uses it as the GSAP-flip trigger), so the two can never drift apart.
 */
export type ArtistInfoStatus = "loading" | "ready" | "empty" | "error";

/**
 * The four section titles of the artist column. Supplied by the presentation
 * owner (`ShareLayout`) so the cards stay pure presentation and never hardcode
 * their own title: commercial passes its i18n defaults, the Creative-Commons
 * path can pass its own wording, and the shared cards know about neither case.
 */
export interface ArtistCardLabels {
  /** Title of the artist profile / info card. */
  profile: string;
  /** Title of the popular-tracks card. */
  popularTracks: string;
  /** Title of the upcoming-events card. */
  events: string;
  /** Title of the similar-artists / similar-tracks card. */
  similar: string;
  /**
   * Credit footer shown under the artist profile, naming the data source
   * (commercial = Spotify/Deezer/Last.fm, Creative Commons = Jamendo).
   */
  profileProvidedBy: string;
}
