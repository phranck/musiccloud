/**
 * @file The surface of the support ladder's tab switch.
 */

/**
 * The class the support ladder's tab switch carries on its track.
 *
 * The switch is the one recessed control of the ladder that stands on the
 * page's sky rather than in a card, and the track's recessed tint sinks into
 * the sky at night. With this class `global.css` gives the track the card
 * material at night and keeps its own tint by day. Nothing outside the ladder
 * carries it, so every other track keeps its tint.
 */
export const SUPPORT_WELL_CLASS = "mc-support-well";
