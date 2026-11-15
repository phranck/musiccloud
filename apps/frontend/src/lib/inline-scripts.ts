/**
 * @file The scripts the site writes inline, and their content-policy hashes.
 *
 * Each of these runs before the page is painted or before its islands
 * hydrate, so it cannot wait for a bundled module script. The pages write
 * each text with `set:html`, and the hash is taken from the same text, so the
 * enforced policy names exactly what the pages carry. A script that does not
 * need to run that early belongs in a bundled `<script>`, which Astro hashes.
 */
import { ENDPOINTS } from "@musiccloud/shared";
import { inlineBlockHash } from "@musiccloud/shared/node";

/**
 * Seeds `--g-dayness` from the persisted day/night mode, the system scheme or
 * the local clock, before the first paint and again after every client-side
 * navigation. The navigation replaces the `<html>` element and drops the
 * style the background worker writes, and the persisted background island does
 * not publish again on navigation.
 */
export const DAYNESS_SEED_SCRIPT = `(function () {
  function smooth01(t) {
    var c = Math.max(0, Math.min(1, t));
    return c * c * (3 - 2 * c);
  }
  function clockDayness() {
    var d = new Date();
    var h = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
    var half = 1.5 / 2;
    var up = smooth01((h - (6.5 - half)) / 1.5);
    var down = 1 - smooth01((h - (20.5 - half)) / 1.5);
    return up * down;
  }
  function readMode() {
    try {
      var raw = window.localStorage.getItem("mc.background.dayNightMode");
      if (raw === "day" || raw === "night" || raw === "system" || raw === "automatic") return raw;
    } catch (e) {}
    return "system";
  }
  function dayness() {
    var mode = readMode();
    if (mode === "day") return 1;
    if (mode === "night") return 0;
    if (mode === "automatic") return clockDayness();
    return typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
      ? 0
      : 1;
  }
  function apply() {
    document.documentElement.style.setProperty("--g-dayness", String(dayness()));
  }
  apply();
  if (!window.__mcDaynessBound) {
    window.__mcDaynessBound = true;
    document.addEventListener("astro:after-swap", apply);
  }
})();`;

/**
 * Sends `/?share=<streaming-url>` on to the share page through the backend
 * before the landing page hydrates. The parameter is not called `url`, because
 * Vite's dev server answers `/?url=…` itself as an asset import.
 */
export const SHARE_REDIRECT_SCRIPT = `(function () {
  var shared = new URLSearchParams(location.search).get("share");
  if (shared) location.replace(${JSON.stringify(ENDPOINTS.frontend.redirect)} + "?url=" + encodeURIComponent(shared));
})();`;

/**
 * Applies the visitor's chosen media view on a share page before the first
 * paint, so the cover or the turntable does not flip after hydration.
 */
export const SHARE_MEDIA_VIEW_SCRIPT = `(function () {
  try {
    var view = window.localStorage.getItem("musiccloud:share-media-view");
    if (view === "cover" || view === "turntable") {
      document.documentElement.dataset.shareMediaView = view;
    }
  } catch (e) {}
})();`;

/** The hashes of every script above, for the site's content policy. */
export const SITE_INLINE_SCRIPT_HASHES: readonly string[] = [
  DAYNESS_SEED_SCRIPT,
  SHARE_REDIRECT_SCRIPT,
  SHARE_MEDIA_VIEW_SCRIPT,
].map(inlineBlockHash);
