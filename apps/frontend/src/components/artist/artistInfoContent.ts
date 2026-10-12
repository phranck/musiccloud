import type { ArtistInfoResponse } from "@musiccloud/shared";
import type { ArtistInfoStatus } from "@/components/artist/artistPanelTypes";
import { toPopularTrackItems, toSimilarTrackItems } from "@/components/artist/artistTrackItems";

/**
 * Which sections of the artist column have something to show.
 *
 * @property profile - The payload carries a profile.
 * @property popularTracks - At least one of the artist's own tracks is listed.
 * @property events - At least one upcoming event is listed.
 * @property similarTracks - At least one similar artist resolved to a playable
 *   track. A name without a track has nothing to click, so it does not count.
 */
export interface ArtistSectionPresence {
  profile: boolean;
  popularTracks: boolean;
  events: boolean;
  similarTracks: boolean;
}

/**
 * Decides, per section, whether the artist column has content to show.
 *
 * The loading hook, the mobile card and the desktop cards all ask this, so the
 * hook never reports a column as ready that no card can fill. The track
 * sections count the rows {@link toPopularTrackItems} and
 * {@link toSimilarTrackItems} build, which are the rows the lists render.
 *
 * @param data - The artist-info payload, or `null` when none has arrived.
 * @returns One flag per section, all `false` for `null`.
 */
export function artistSectionPresence(data: ArtistInfoResponse | null): ArtistSectionPresence {
  return {
    profile: !!data?.profile,
    popularTracks: toPopularTrackItems(data).length > 0,
    events: (data?.events?.length ?? 0) > 0,
    similarTracks: toSimilarTrackItems(data).length > 0,
  };
}

/**
 * Whether any section of the artist column has content to show.
 *
 * Decides between the `ready` and the `empty` status, so a payload whose only
 * entries are similar artists without a track reads as empty, exactly as the
 * cards render it.
 *
 * @param data - The artist-info payload, or `null` when none has arrived.
 * @returns `true` when at least one section of {@link artistSectionPresence} is set.
 */
export function hasArtistInfoContent(data: ArtistInfoResponse | null): boolean {
  return Object.values(artistSectionPresence(data)).some(Boolean);
}

/**
 * The load status a card works with when its owner may not have passed one.
 *
 * A status from the hook wins. Without one, a running load is `loading`, and a
 * settled one is `ready` or `empty` by {@link hasArtistInfoContent}, the same
 * rule the hook applies.
 *
 * @param status - The status the owner passed, if any.
 * @param isLoading - Whether a load is running.
 * @param data - The artist-info payload, or `null` when none has arrived.
 * @returns The status to render against.
 */
export function effectiveArtistInfoStatus(
  status: ArtistInfoStatus | undefined,
  isLoading: boolean,
  data: ArtistInfoResponse | null,
): ArtistInfoStatus {
  if (status) return status;
  if (isLoading) return "loading";
  return hasArtistInfoContent(data) ? "ready" : "empty";
}
