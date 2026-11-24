/**
 * @file Entry point of the social-media module: where somebody can be found,
 * the social platforms musiccloud knows, how an address is sorted into one of
 * them, and how it is brought to its canonical form. Exports exactly the public
 * names of the platform catalog, the normalizers, the detection and the list
 * normalization; the helpers in `url-helpers.ts` stay internal.
 */

export * from "./detect.js";
export * from "./links.js";
export * from "./normalizers.js";
export * from "./platforms.js";
