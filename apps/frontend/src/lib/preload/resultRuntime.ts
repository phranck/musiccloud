import type { ComponentProps, ComponentType } from "react";

/**
 * Preloadable dynamic imports for result-time UI.
 *
 * Keep these imports out of the initial landing bundle. The landing screen
 * stays lean until the user submits a resolve request. LandingPage can then
 * call `preloadResolveResultRuntime()` while the loading CD is already
 * visible, so the result UI is likely ready by the time `/api/resolve`
 * returns.
 */

type LazyComponent<TProps> = { default: ComponentType<TProps> };

type DisambiguationPanelProps = ComponentProps<
  typeof import("@/components/panels/DisambiguationPanel").DisambiguationPanel
>;
type GenreBrowseGridProps = ComponentProps<typeof import("@/components/panels/GenreBrowseGrid").GenreBrowseGrid>;
type GenreSearchResultsProps = ComponentProps<
  typeof import("@/components/panels/GenreSearchResults").GenreSearchResults
>;
type ShareLayoutProps = ComponentProps<typeof import("@/components/share/ShareLayout").ShareLayout>;
type ToastProps = ComponentProps<typeof import("@/components/ui/Toast").Toast>;

export function loadDisambiguationPanel(): Promise<LazyComponent<DisambiguationPanelProps>> {
  return import("@/components/panels/DisambiguationPanel").then((m) => ({ default: m.DisambiguationPanel }));
}

export function loadGenreBrowseGrid(): Promise<LazyComponent<GenreBrowseGridProps>> {
  return import("@/components/panels/GenreBrowseGrid").then((m) => ({ default: m.GenreBrowseGrid }));
}

export function loadGenreSearchResults(): Promise<LazyComponent<GenreSearchResultsProps>> {
  return import("@/components/panels/GenreSearchResults").then((m) => ({ default: m.GenreSearchResults }));
}

export function loadShareLayout(): Promise<LazyComponent<ShareLayoutProps>> {
  return import("@/components/share/ShareLayout").then((m) => ({ default: m.ShareLayout }));
}

export function loadToast(): Promise<LazyComponent<ToastProps>> {
  return import("@/components/ui/Toast").then((m) => ({ default: m.Toast }));
}

export function preloadResolveResultRuntime(): void {
  void loadShareLayout();
}
