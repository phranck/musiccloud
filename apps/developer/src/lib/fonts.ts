/**
 * @file The developer portal's self-hosted fonts, for the layout and for the
 * gate pages alike.
 *
 * Every page loads its fonts from the portal's own origin, which is what the
 * content policy allows. The fonts are declared here rather than through the
 * fontsource CSS files, so they carry `font-display: optional` instead of
 * fontsource's `swap`: a font is used only when it is ready at first paint and
 * is never swapped in afterwards, which keeps text from reflowing on every
 * server navigation. Each font is also preloaded, so the fetch starts with the
 * HTML and navigations find it in the cache. The preload and the `@font-face`
 * rule take their address from the same `?url` import, so they cannot point
 * at different files and fetch one twice.
 */
import audiowide400 from "@fontsource/audiowide/files/audiowide-latin-400-normal.woff2?url";
import barlow400 from "@fontsource/barlow/files/barlow-latin-400-normal.woff2?url";
import barlow500 from "@fontsource/barlow/files/barlow-latin-500-normal.woff2?url";
import barlow600 from "@fontsource/barlow/files/barlow-latin-600-normal.woff2?url";
import barlow700 from "@fontsource/barlow/files/barlow-latin-700-normal.woff2?url";
import barlowCondensed400 from "@fontsource/barlow-condensed/files/barlow-condensed-latin-400-normal.woff2?url";
import barlowCondensed500 from "@fontsource/barlow-condensed/files/barlow-condensed-latin-500-normal.woff2?url";
import barlowCondensed600 from "@fontsource/barlow-condensed/files/barlow-condensed-latin-600-normal.woff2?url";

/** One self-hosted font file: a family in one weight, latin subset, normal style. */
export interface PortalFont {
  family: string;
  weight: number;
  /** The file's address on the portal's own origin. */
  url: string;
}

/**
 * Every font weight the portal renders. Body copy and controls run in Barlow,
 * headlines in Barlow Condensed (the h1 to h6 rule in `global.css`) and the
 * brand wordmark in Audiowide, which has a single weight.
 */
export const PORTAL_FONTS: readonly PortalFont[] = [
  { family: "Barlow", weight: 400, url: barlow400 },
  { family: "Barlow", weight: 500, url: barlow500 },
  { family: "Barlow", weight: 600, url: barlow600 },
  { family: "Barlow", weight: 700, url: barlow700 },
  { family: "Barlow Condensed", weight: 400, url: barlowCondensed400 },
  { family: "Barlow Condensed", weight: 500, url: barlowCondensed500 },
  { family: "Barlow Condensed", weight: 600, url: barlowCondensed600 },
  { family: "Audiowide", weight: 400, url: audiowide400 },
];

/** One `@font-face` rule per font, as a single stylesheet text. */
export const PORTAL_FONT_FACE_CSS = PORTAL_FONTS.map(
  ({ family, weight, url }) =>
    `@font-face{font-family:"${family}";font-style:normal;font-display:optional;font-weight:${weight};src:url(${url}) format("woff2")}`,
).join("");

/**
 * The preload tags for every font, for a page rendered as a string.
 *
 * A font preload needs `crossorigin` even from the page's own origin, or the
 * browser fetches the file a second time for the `@font-face` rule.
 *
 * @returns One `<link rel="preload">` per font, joined.
 */
export function portalFontPreloadTags(): string {
  return PORTAL_FONTS.map(
    ({ url }) => `<link rel="preload" as="font" type="font/woff2" crossorigin href="${url}" />`,
  ).join("\n    ");
}
