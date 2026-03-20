/**
 * Thin wrapper around Umami's client-side tracking API.
 * All calls are fire-and-forget; errors are silently swallowed.
 */

declare global {
  interface Window {
    umami?: {
      track: (eventName: string, data?: Record<string, string | number>) => void;
    };
  }
}

function track(eventName: string, data?: Record<string, string | number>) {
  try {
    window.umami?.track(eventName, data);
  } catch {
    // Tracking must never break the app
  }
}

/** Fired when a track/album URL is successfully resolved. */
export function trackResolve(service: string) {
  track("track-resolve", { service });
}

/** Fired when a user clicks a platform button on the share page. */
export function trackServiceLinkClick(service: string) {
  track("service-link-click", { service });
}
