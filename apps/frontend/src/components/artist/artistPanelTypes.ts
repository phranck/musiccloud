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
 * Load phase of the artist-info fetch. Shared by the artist cards (which render
 * per-phase content) and `ShareLayout` (which drives the phase via its reducer
 * and uses it as the GSAP-flip trigger), so the two can never drift apart.
 */
export type ArtistInfoStatus = "loading" | "ready" | "empty" | "error";
