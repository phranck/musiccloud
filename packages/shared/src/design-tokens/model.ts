/**
 * The design-token model: the domain-literal namespaces, the per-group field
 * shapes, the shader parameter specs and the normalized {@link DesignTokens}
 * type. The canonical values live in `defaults.ts`, and the parser that turns a
 * pasted export into this model lives in `parse.ts`.
 *
 * The values originate from the visual reference prototype (`mockups/frontend-prototype.html`)
 * and are exported by it as a single JSON blob ("Copy settings"). An administrator
 * pastes that blob into the dashboard Design page. It is persisted verbatim under
 * the `design_tokens` site-setting key, validated on read, injected into the
 * frontend as `:root` custom properties (material) and fed into the night-sky
 * driver (shader params).
 *
 * This model is shared by three boundaries that must agree on the schema:
 * - **frontend** applies the tokens (CSS vars and shader uniforms),
 * - **backend** whitelists and sanitizes them on the public read endpoint,
 * - **dashboard** validates the admin's JSON live before saving.
 *
 * ## Export shape vs. model shape
 * The prototype export spreads every shader parameter (PARAMS and COLORS) **flat**
 * at the top level, intermixed with the structured groups
 * (`cardRadius`, `glass`, `text`, `vfd`, `footer`, `cover`, `backdrop`).
 * `parseDesignTokens` is the adapter: it reads that flat export form and
 * normalizes it into {@link DesignTokens}, where the shader keys live under a
 * dedicated `shader` namespace. The single-group structures keep their redundant
 * wrapper key 1:1 to the export (`vfd.vfd`, `footer.skytext`, `cover.cover`,
 * `backdrop.backdrop`) so a pasted export round-trips without remapping.
 */

import type { PADDING_DEFAULTS } from "./defaults.js";

// ─── Domain-literal namespaces (PascalCase.PascalCase) ─────────────────────────

/**
 * The glass surface controls. Member values are the wire keys used in the
 * exported JSON and as CSS-var prefixes. The PascalCase member names are the
 * stable references used in code (per the project's domain-literal convention).
 */
export const GlassControl = {
  /** The outer card surface. */
  Card: "card",
  /** The card surface inside an overlay. */
  CardOverlay: "cardOverlay",
  /** The raised button surface. */
  Button: "button",
  /** The recessed well surface. */
  Recessed: "recessed",
  /** The segmented-control recessed track. */
  SegTrack: "segTrack",
  /** The segmented-control raised indicator. */
  SegIndicator: "segIndicator",
  /** Header-controls recessed track (nav hamburger plus day/night and language switchers). */
  NavTrack: "navTrack",
  /** Header-controls raised indicator: the hamburger icon, the active switcher cell, and the hovered nav item. */
  NavIndicator: "navIndicator",
  /** CC-mode segmented-control recessed track (neutral, identical to segTrack). */
  CcSegTrack: "ccSegTrack",
  /** CC-mode segmented-control raised indicator: green tint (analogous to segIndicator's blue). */
  CcSegIndicator: "ccSegIndicator",
} as const;
/** Union of the glass control wire keys (`"card" | "cardOverlay" | …`). */
export type GlassControlKey = (typeof GlassControl)[keyof typeof GlassControl];

/** The surfaces whose text the material themes independently. */
export const TextSurface = {
  /** Text on a raised (embossed) surface. */
  Embossed: "embossed",
  /** Text inside a recessed well. */
  Recessed: "recessed",
  /** Button label text. */
  Button: "button",
  /** Title text on a raised surface. */
  EmbossedTitle: "embossedTitle",
  /** Long-form info, help and description text (artist bio, info and help pages). */
  InfoText: "infoText",
  /** Input placeholder text (the hero search field). Single-emphasis: only its
   *  dimmed color level is consumed. */
  Placeholder: "placeholder",
  /** Header-controls label and item text (nav dropdown items and switcher labels): normal and bright. */
  Nav: "nav",
} as const;
/** Union of the text-surface wire keys (`"embossed" | "recessed" | …`). */
export type TextSurfaceKey = (typeof TextSurface)[keyof typeof TextSurface];

/** The three emphasis levels each surface carries. */
export const TextEmphasis = {
  /** The brightest level. */
  Bright: "bright",
  /** The regular level. */
  Normal: "normal",
  /** The dimmest level. */
  Dimmed: "dimmed",
} as const;
/** Union of the emphasis wire keys (`"bright" | "normal" | "dimmed"`). */
export type TextEmphasisKey = (typeof TextEmphasis)[keyof typeof TextEmphasis];

/** Allowed text capitalization (CSS `text-transform`), consumed by the title. */
export const TextCapitalization = {
  /** No transformation. */
  None: "none",
  /** All letters uppercase. */
  Uppercase: "uppercase",
  /** All letters lowercase. */
  Lowercase: "lowercase",
  /** First letter of each word uppercase. */
  Capitalize: "capitalize",
} as const;
/** Union of the capitalization wire keys. */
export type TextCapitalizationKey = (typeof TextCapitalization)[keyof typeof TextCapitalization];

/** The two themed lighting modes every group carries values for. */
export const DayNightKey = {
  /** The day mode. */
  Day: "day",
  /** The night mode. */
  Night: "night",
} as const;

/**
 * A pair of mode-specific values. The live render cross-fades between day and night.
 *
 * @typeParam T The value shape held for each mode.
 */
export interface DayNight<T> {
  /** The value used in day mode. */
  day: T;
  /** The value used in night mode. */
  night: T;
}

// ─── Per-group field shapes ────────────────────────────────────────────────────

/** Tunable fields of a single glass surface control, per mode. */
export interface GlassFields {
  /** Flat tint color of the surface (`#rrggbb`). */
  tint: string;
  /** Tint alpha applied to the fill (0..1). */
  opacity: number;
  /** Outer float and drop-shadow intensity (0..1). */
  shadow: number;
}

/**
 * Tunable fields of one text surface, per mode. One font (family, size, weight)
 * applies to the whole surface. The three emphasis levels (bright, normal, dimmed)
 * differ only in color and alpha. `capitalization` is per surface (primarily the
 * title consumes it).
 *
 * `fontFamily` and `capitalization` are discrete (not interpolable), so the live
 * render uses the night value (mirroring skytext's single-font emit). `fontSize`,
 * `fontWeight` and the colors cross-fade between day and night.
 */
export interface TextSurfaceFields {
  /** CSS font-family for this surface, one of `TYPO_FONTS`. Discrete (night value used). */
  fontFamily: string;
  /** Font size in px (8..48), cross-faded between day and night. */
  fontSize: number;
  /** Font weight (100..900), cross-faded between day and night. */
  fontWeight: number;
  /** CSS `text-transform` for this surface, one of {@link TextCapitalization}.
   *  Discrete (night value used), primarily consumed by {@link TextSurface.EmbossedTitle}. */
  capitalization: string;
  /** Brightest emphasis level color. */
  brightColor: string;
  /** Brightest emphasis level alpha (0..1). */
  brightOpacity: number;
  /** Normal emphasis level color. */
  normalColor: string;
  /** Normal emphasis level alpha (0..1). */
  normalOpacity: number;
  /** Dimmed emphasis level color. */
  dimmedColor: string;
  /** Dimmed emphasis level alpha (0..1). */
  dimmedOpacity: number;
}

/** Tunable fields of the VFD display, per mode. */
export interface VfdFields {
  /** Display background color. */
  bg: string;
  /** Display background alpha (0..1). */
  bgOpacity: number;
  /** Color of the brightest segments. */
  bright: string;
  /** Color of the normal segments. */
  normal: string;
  /** Color of the dim segments. */
  dim: string;
  /** Color of the unlit ghost segments. */
  ghost: string;
  /** Alpha of the unlit ghost segments (0..1). */
  ghostOpacity: number;
  /** Edge highlight intensity (0..1). */
  edgeLight: number;
  /** Edge shading intensity (0..1). */
  edgeShade: number;
}

/**
 * Tunable fields of the sky-anchored footer text ("skytext"), per mode.
 *
 * The prototype's on-screen `weight` field stays `uiOnly` (preview aid only,
 * stripped from the export), and the production weight lives in CSS. The `size`
 * field is exported and applied as the footer font-size.
 */
export interface SkyTextFields {
  /** CSS font-family value, one of `SKYTEXT_FONTS`. */
  fontFamily: string;
  /** Footer font-size in px (8..48), emitted as `--skytext-<mode>-size`. */
  size: number;
  /** Text color. */
  color: string;
  /** Text alpha (0..1). */
  opacity: number;
  /** Text stroke width in px (0..4). */
  strokeWidth: number;
  /** Text stroke color. */
  strokeColor: string;
}

/**
 * Tunable fields of a sky-anchored link ("skylink"), per mode. The text and
 * underline colors are per mode. `thickness` (0 = no underline) and `offset`
 * are shared across modes (the prototype writes the same value to both).
 */
export interface SkyLinkFields {
  /** Link text color, emitted as `--skylink-<mode>-color`. */
  color: string;
  /** Underline (text-decoration) color, emitted as `--skylink-<mode>-deco`. */
  decoColor: string;
  /** Underline thickness in px (0..4, 0 = no underline). */
  thickness: number;
  /** Underline offset in px (0..8). */
  offset: number;
}

/**
 * Tunable fields of the TFT cover plate. Mode-independent: the cover screen
 * renders one fixed look (no day/night cross-fade), so a single value bag drives
 * it, unlike the {@link DayNight}-wrapped groups.
 */
export interface CoverFields {
  /** Plate background color. */
  bg: string;
  /** Plate background alpha (0..1). */
  bgOpacity: number;
  /** Inner shadow intensity (0..1). */
  innerShadow: number;
  /** Pixel-matrix color. */
  matrixColor: string;
  /** Pixel-matrix alpha (0..1). */
  matrixOpacity: number;
  /** Sheen highlight intensity (0..1). */
  sheenLight: number;
  /** Sheen shadow intensity (0..1). */
  sheenShadow: number;
  /** Tint overlay color. */
  tintColor: string;
  /** Tint overlay alpha (0..1). */
  tintOpacity: number;
}

/**
 * Tunable fields of the global card drop-shadow geometry. Mode-independent: one
 * shadow shape for every card (the per-surface strength is the glass `shadow`
 * field). Drives `--mc-shadow-*` in the shared box-shadow recipe.
 */
export interface ShadowFields {
  /** Horizontal offset in px (negative left, positive right, -40..40). */
  offsetX: number;
  /** Vertical offset in px (negative up, positive down, -40..40). */
  offsetY: number;
  /** Blur radius in px (0..120, higher is softer). */
  blur: number;
  /** Shadow color (`#rrggbb`). Its opacity comes from each surface's `shadow` strength. */
  color: string;
}

/** Tunable fields of the info-overlay backdrop scrim, per mode. */
export interface BackdropFields {
  /** Scrim color. */
  color: string;
  /** Scrim alpha (0..1). */
  opacity: number;
  /** Scrim blur radius in px (0..40). */
  blur: number;
}

// ─── Shader token typing ───────────────────────────────────────────────────────

/**
 * Numeric night-sky shader parameters with their valid ranges. `bool` params are
 * snapped to 0 or 1. Keys and ranges are transcribed 1:1 from the prototype PARAMS.
 */
export const SHADER_NUMBER_SPECS = {
  dayness: { min: 0, max: 1 },
  dayTransition: { min: 0, max: 10 },
  autoDayNight: { min: 0, max: 1, bool: true },
  sunriseHour: { min: 0, max: 12 },
  sunsetHour: { min: 12, max: 24 },
  twilightHours: { min: 0.25, max: 4 },
  vignette: { min: 0, max: 1 },
  skyWidth: { min: 1280, max: 16384 },
  skyHeight: { min: 720, max: 9216 },
  skyFov: { min: 30, max: 120 },
  polarisX: { min: 0, max: 1 },
  polarisY: { min: 0, max: 1 },
  rotationPeriod: { min: 120, max: 3600 },
  catalogSize: { min: 0.5, max: 4 },
  catalogBrightness: { min: 0, max: 2 },
  starDensity: { min: 20, max: 400 },
  starSize: { min: 0.5, max: 4 },
  starBrightness: { min: 0, max: 2 },
  twinkleAmount: { min: 0, max: 1 },
  twinkleSpeed: { min: 0, max: 3 },
  cloudScale: { min: 0.5, max: 12 },
  cloudCoverage: { min: 0, max: 1 },
  cloudSoftness: { min: 0.02, max: 0.8 },
  cloudOpacity: { min: 0, max: 1 },
  cloudNightBrightness: { min: 0, max: 3 },
  cloudDayBrightness: { min: 0, max: 3 },
  cloudDetail: { min: 2, max: 7 },
  clearZones: { min: 0, max: 1 },
  warpStrength: { min: 0, max: 2 },
  windSpeed: { min: 0, max: 0.05 },
  windAngle: { min: 0, max: 360 },
  evolveSpeed: { min: 0, max: 0.2 },
  moonIntensity: { min: 0, max: 2 },
  moonAngle: { min: 0, max: 360 },
  sunIntensity: { min: 0, max: 2 },
  sunAngle: { min: 0, max: 360 },
  starOcclusion: { min: 0, max: 3 },
  animate: { min: 0, max: 1, bool: true },
  renderScale: { min: 0.25, max: 1 },
  fpsCap: { min: 5, max: 60 },
} as const satisfies Record<string, { min: number; max: number; bool?: boolean }>;

/** Hex-color shader parameters (`#rrggbb`), transcribed 1:1 from prototype COLORS. */
export const SHADER_COLOR_KEYS = [
  "skyTop",
  "skyBottom",
  "skyTopDay",
  "skyBottomDay",
  "cloudColor",
  "cloudColorDay",
] as const;

/** Union of numeric shader parameter keys. */
export type ShaderNumberKey = keyof typeof SHADER_NUMBER_SPECS;
/** Union of color shader parameter keys. */
export type ShaderColorKey = (typeof SHADER_COLOR_KEYS)[number];

/** The full flat shader-token namespace (numeric params and hex colors). */
export type ShaderTokens = { [K in ShaderNumberKey]: number } & {
  [K in ShaderColorKey]: string;
};

/** Union of the padding and gap token keys (the `--mc-*` CSS-var names of `PADDING_DEFAULTS`). */
export type PaddingKey = keyof typeof PADDING_DEFAULTS;

// ─── The model ─────────────────────────────────────────────────────────────────

/**
 * The complete, normalized design-token model. One object themes the entire
 * glass material and the night-sky shader for both day and night.
 */
export interface DesignTokens {
  /** Night-sky shader parameters (flat: numeric uniforms and hex colors). */
  shader: ShaderTokens;
  /** Outer-card corner radius in px (0..40), the root of the radius cascade. */
  cardRadius: number;
  /** Structural padding and gap tokens, keyed by their `--mc-*` CSS-var name, in px.
   *  Mode-independent (no day/night) and emitted verbatim as custom properties. */
  paddings: Record<PaddingKey, number>;
  /** Glass surface tokens, keyed by control. */
  glass: Record<GlassControlKey, DayNight<GlassFields>>;
  /** Text tokens, keyed by surface. */
  text: Record<TextSurfaceKey, DayNight<TextSurfaceFields>>;
  /** VFD display tokens (single group, wrapper key kept 1:1 to export). */
  vfd: { vfd: DayNight<VfdFields> };
  /** Footer and skytext tokens (export key `footer`, internal group `skytext`). */
  footer: { skytext: DayNight<SkyTextFields> };
  /** TFT cover-plate tokens (single group, wrapper key kept 1:1 to export).
   *  Mode-independent: one fixed look, no day/night ({@link CoverFields}). */
  cover: { cover: CoverFields };
  /** Global card drop-shadow geometry (single group, mode-independent). The
   *  per-surface strength is the glass `shadow` field ({@link ShadowFields}). */
  shadow: { shadow: ShadowFields };
  /** Info-overlay backdrop tokens (single group, wrapper key kept 1:1 to export). */
  backdrop: { backdrop: DayNight<BackdropFields> };
  /** Sky-anchored link tokens (single group, wrapper key kept 1:1 to export). */
  skylink: { skylink: DayNight<SkyLinkFields> };
  /** Card- and glass-context link tokens (reuse {@link SkyLinkFields}). A separate
   *  group from `skylink`, so a link inside a card can be tuned independently of
   *  links sitting on the sky. */
  cardlink: { cardlink: DayNight<SkyLinkFields> };
}
