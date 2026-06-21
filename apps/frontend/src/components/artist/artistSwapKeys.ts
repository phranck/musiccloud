import type { ArtistInfoResponse } from "@musiccloud/shared";

/**
 * Builders for the `SmoothSwap` identity keys of the three artist-column
 * sections. They live in one module so the desktop cards and the mobile
 * `ArtistInfoCard` derive byte-identical keys from the same payload — a key
 * mismatch across viewports would make a data swap cross-fade twice.
 *
 * Each key encodes the section's row identities (not just its length), so a
 * same-length content change still triggers the cross-fade, and falls back to a
 * stable `*-empty` sentinel when there is no data.
 */

/** Identity key for the popular-tracks list. */
export function buildTracksSwapKey(data: ArtistInfoResponse | null): string {
  return data?.topTracks.map((track) => track.deezerUrl).join("|") ?? "tracks-empty";
}

/** Identity key for the upcoming-events list. */
export function buildEventsSwapKey(data: ArtistInfoResponse | null): string {
  return (
    data?.events.map((event) => `${event.date}:${event.venueName}:${event.city}:${event.ticketUrl ?? ""}`).join("|") ??
    "events-empty"
  );
}

/** Identity key for the similar-artist-tracks list. */
export function buildSimilarSwapKey(data: ArtistInfoResponse | null): string {
  return (
    data?.similarArtistTracks?.map((entry) => `${entry.artistName}:${entry.track?.deezerUrl ?? ""}`).join("|") ??
    "similar-empty"
  );
}
