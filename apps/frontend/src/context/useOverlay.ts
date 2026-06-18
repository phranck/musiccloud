import type { PublicContentPage } from "@musiccloud/shared";
import { createContext, use } from "react";

/**
 * Imperative surface the overlay context exposes to consumers: the current
 * overlay page (or `null`) plus the open/close actions.
 */
export interface OverlayAPI {
  /** The page currently shown in the overlay, or `null` when closed. */
  page: PublicContentPage | null;
  /** Opens the overlay on the given page (pushes history, sets the title). */
  open: (page: PublicContentPage) => void;
  /** Closes the overlay and restores the previous URL/title. */
  close: () => void;
}

/**
 * Overlay context, `null` until an `OverlayProvider` mounts above the consumer.
 *
 * Lives in its own module — split from the `OverlayProvider` component in
 * `OverlayContext.tsx` — so React Fast Refresh can hot-swap the provider
 * during dev HMR. A file that mixes a component export with context/hook
 * exports is not a valid Fast Refresh boundary: Vite invalidates it on every
 * edit. Mirrors the `i18n/localeContext.ts` split. Production is unaffected
 * (no Fast Refresh there).
 */
export const OverlayCtx = createContext<OverlayAPI | null>(null);

/** Event name fired by nav-click interception; see PageHeader.tsx. */
export const OVERLAY_OPEN_EVENT = "mc:overlay-open";

/** Flag on `window` set while at least one OverlayProvider is mounted. */
export const PRESENCE_FLAG = "__mcOverlayActive";

/**
 * True when a `PageOverlayIsland` is mounted on the current page. Reads a
 * `window` flag rather than the React context, so it is safe to call outside
 * a provider — `PageHeader.tsx` uses it to decide whether to intercept a nav
 * click (client-side overlay) or fall through to full-page navigation.
 *
 * @returns Whether an overlay provider is currently mounted.
 */
export function isOverlayActive(): boolean {
  if (typeof window === "undefined") return false;
  return (window as unknown as Record<string, unknown>)[PRESENCE_FLAG] === true;
}

/**
 * Reads the overlay context. Throws when no `OverlayProvider` is an ancestor.
 *
 * @returns The current overlay page plus its open/close actions.
 */
export function useOverlay(): OverlayAPI {
  const ctx = use(OverlayCtx);
  if (!ctx) throw new Error("useOverlay must be used inside OverlayProvider");
  return ctx;
}
