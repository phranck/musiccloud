import { isTrackingEnabled } from "@/lib/analytics/trackingConfig";

/** One value an event's data may carry. */
type MusicSignalValue = string | number | boolean | null;

/** The data an event may carry, keyed by name. */
export type MusicSignalData = Record<string, MusicSignalValue>;

type UmamiClient = {
  track: (eventName: string, eventData?: MusicSignalData) => void | Promise<void>;
};

declare global {
  interface Window {
    umami?: UmamiClient;
  }
}

/**
 * Sends a single natural-language event name to Umami.
 *
 * Format convention: `Group: Detail` in Title Case. Each UI action gets its
 * own fully-qualified name (no `properties` payload), so the Umami events
 * list reads as plain English without a property drilldown.
 *
 * Suppression: gated by `isTrackingEnabled()` BEFORE touching `window.umami`.
 * In addition the script-inject in `BaseLayout.astro` is gated by the same
 * helper, so a misconfigured environment fails closed on both layers.
 *
 * @param name - The event name.
 * @param data - What the event carries beside its name, for the few events
 *   whose question is which of many things it was, such as which support
 *   prompt. Nothing by default, which is the convention above.
 */
export function sendMusicSignal(name: string, data?: MusicSignalData): void {
  if (!isTrackingEnabled()) return;
  if (typeof window === "undefined") return;
  const umami = window.umami;
  if (!umami || typeof umami.track !== "function") return;
  try {
    void (data === undefined ? umami.track(name) : umami.track(name, data));
  } catch {
    // Analytics must never affect the product flow.
  }
}

/**
 * What a support prompt did, ported from lmaa.space's `support-prompt-shown`,
 * `support-prompt-clicked` and `support-prompt-dismissed`. Each carries the
 * prompt's id, its internal name and its slot. Without these, more prompts
 * are only more noise: nothing says which text or which place worked.
 */
export const SupportPromptSignal = {
  Shown: "Support Prompt: Shown",
  Clicked: "Support Prompt: Clicked",
  Dismissed: "Support Prompt: Dismissed",
} as const;

/**
 * Audio-preview lifecycle. The five terminal states (Paused, Finished,
 * Error, Unavailable) plus the two entry states (Started, Resumed) cover the
 * full transport state machine of `AudioPlayer`.
 */
export const PreviewSignal = {
  Started: "Preview: Started",
  Resumed: "Preview: Resumed",
  Paused: "Preview: Paused",
  Finished: "Preview: Finished",
  Error: "Preview: Error",
  Unavailable: "Preview: Unavailable",
} as const;

/**
 * Share-button states. `NativeButton` is the open click (web-share modal
 * shown), the other four are the four post-action outcomes.
 */
export const ShareSignal = {
  NativeButton: "Share: Native Button",
  LinkCopied: "Share: Link Copied",
  LinkCopyFailed: "Share: Link Copy Failed",
  NativeCompleted: "Share: Native Completed",
  NativeCancelled: "Share: Native Cancelled",
} as const;

/** Analyzer display mode toggle (keyboard "D" or future click affordance). */
export const DisplaySignal = {
  Analyzer: "Display: Analyzer",
  VuMeter: "Display: VU Meter",
} as const;

/** Sky background mode switcher (the four day-night modes, plan MC-030). */
export const SkySignal = {
  Day: "Sky: Day",
  Night: "Sky: Night",
  System: "Sky: System",
  Automatic: "Sky: Automatic",
} as const;

/** Search-funnel entry: the user submitted the search box. */
export const SearchSignal = {
  Submitted: "Search: Submitted",
} as const;

/** Search-funnel terminal states: backend resolve outcome. */
export const ResolveSignal = {
  Completed: "Resolve: Completed",
  FailedClient: "Resolve: Failed (Client)",
  FailedUnknown: "Resolve: Failed (Unknown)",
} as const;

/** Clickable UI cards. One event name per card type, irrespective of source. */
export const CardSignal = {
  PopularTrack: "Card: Popular Track",
  SimilarArtist: "Card: Similar Artist",
  UpcomingEvent: "Card: Upcoming Event",
  DisambiguationCandidate: "Card: Disambiguation Candidate",
  LiveExample: "Card: Live Example",
  ArtistInfo: "Card: Artist Info",
} as const;

/** Footer interactions. */
export const FooterSignal = {
  LayeredLogo: "Footer: Layered Logo",
} as const;

/** The way to the support page. */
export const SupportSignal = {
  /** The header link to `/support-me` was clicked. */
  HeaderButton: "Support: Header Button",
} as const;

/** Generic navigation. Per-link splitting was decided against to keep the
 *  Umami events list bounded when admins add new external nav entries. */
export const NavSignal = {
  External: "Nav: External",
} as const;

/** Genre overview entry point (user input `genre:?`). */
export const GenreSignal = {
  Overview: "Genre: Overview",
} as const;

/**
 * Title-cases an underscore- or hyphen-separated key. Used by every dynamic
 * generator that turns a backend slug (`acid_house`, `apple_music`) into a
 * human-readable event detail (`Acid House`, `Apple Music`).
 */
function humanizeKey(key: string): string {
  return key
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

/** `serviceSignal("apple_music")` → `"Service: Apple Music"`. */
export function serviceSignal(serviceKey: string): string {
  return `Service: ${humanizeKey(serviceKey)}`;
}

/**
 * `genreSignal({ name: "ambient", displayName: "Ambient" })` →
 * `"Genre: Ambient"`. Prefers the backend-provided display name when
 * available, falls back to humanizing the slug.
 */
export function genreSignal(name: string, displayName?: string): string {
  return `Genre: ${displayName ?? humanizeKey(name)}`;
}

/** `infoPageSignal("imprint")` → `"Info: Imprint"`. */
export function infoPageSignal(pageSlug: string): string {
  return `Info: ${humanizeKey(pageSlug)}`;
}
