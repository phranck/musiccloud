/**
 * Design-token model — the single source of truth for the runtime-tunable
 * glassmorphism material and the WebGL night-sky shader.
 *
 * The values originate from the visual reference prototype (`architecture/frontend-prototype.html`)
 * and are exported by it as a single JSON blob ("Copy settings"). An administrator
 * pastes that blob into the dashboard Design page; it is persisted verbatim under
 * the `design_tokens` site-setting key, validated on read, injected into the
 * frontend as `:root` custom properties (material) and fed into the night-sky
 * driver (shader params).
 *
 * This module is shared by three boundaries that must agree on the schema:
 * - **frontend** applies the tokens (CSS vars + shader uniforms),
 * - **backend** whitelists and sanitises them on the public read endpoint,
 * - **dashboard** validates the admin's JSON live before saving.
 *
 * ## Export shape vs. model shape
 * The prototype export spreads every shader parameter (PARAMS + COLORS) **flat**
 * at the top level, intermixed with the structured groups
 * (`cardRadius`, `glass`, `text`, `vfd`, `footer`, `cover`, `backdrop`).
 * {@link parseDesignTokens} is the adapter: it reads that flat export form and
 * normalises it into {@link DesignTokens}, where the shader keys live under a
 * dedicated `shader` namespace. The single-group structures keep their redundant
 * wrapper key 1:1 to the export (`vfd.vfd`, `footer.skytext`, `cover.cover`,
 * `backdrop.backdrop`) so a pasted export round-trips without remapping.
 */

// ─── Domain-literal namespaces (PascalCase.PascalCase) ─────────────────────────

/**
 * The eight glass surface controls. Member values are the wire keys used in the
 * exported JSON and as CSS-var prefixes; the PascalCase member names are the
 * stable references used in code (per the project's domain-literal convention).
 */
export const GlassControl = {
  Card: "card",
  CardOverlay: "cardOverlay",
  Button: "button",
  Recessed: "recessed",
  SegTrack: "segTrack",
  SegIndicator: "segIndicator",
  /** Header-controls recessed track (nav hamburger + day/night & language switchers). */
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
  Embossed: "embossed",
  Recessed: "recessed",
  Button: "button",
  EmbossedTitle: "embossedTitle",
  /** Long-form info / help / description text (artist bio, info & help pages). */
  InfoText: "infoText",
  /** Input placeholder text (the hero search field). Single-emphasis: only its
   *  dimmed colour level is consumed. */
  Placeholder: "placeholder",
  /** Header-controls label/item text (nav dropdown items + switcher labels): normal + bright. */
  Nav: "nav",
} as const;
/** Union of the text-surface wire keys (`"embossed" | "recessed" | …`). */
export type TextSurfaceKey = (typeof TextSurface)[keyof typeof TextSurface];

/** The three emphasis levels each surface carries. */
export const TextEmphasis = {
  Bright: "bright",
  Normal: "normal",
  Dimmed: "dimmed",
} as const;
/** Union of the emphasis wire keys (`"bright" | "normal" | "dimmed"`). */
export type TextEmphasisKey = (typeof TextEmphasis)[keyof typeof TextEmphasis];

/** Allowed text capitalisation (CSS `text-transform`); consumed by the title. */
export const TextCapitalization = {
  None: "none",
  Uppercase: "uppercase",
  Lowercase: "lowercase",
  Capitalize: "capitalize",
} as const;
/** Union of the capitalisation wire keys. */
export type TextCapitalizationKey = (typeof TextCapitalization)[keyof typeof TextCapitalization];

/** The two themed lighting modes every group carries values for. */
export const DayNightKey = {
  Day: "day",
  Night: "night",
} as const;

/** A pair of mode-specific values; the live render cross-fades day↔night. */
export interface DayNight<T> {
  day: T;
  night: T;
}

// ─── Per-group field shapes ────────────────────────────────────────────────────

/** Tunable fields of a single glass surface control, per mode. */
export interface GlassFields {
  /** Top tint colour of the vertical surface gradient (`#rrggbb`). */
  tintTop: string;
  /** Bottom tint colour of the vertical surface gradient (`#rrggbb`). */
  tintBottom: string;
  /** Tint alpha applied to the gradient (0..1). */
  opacity: number;
  /** Backdrop blur radius in px (0..60); only honoured on outer cards (noFrost). */
  blur: number;
  /** Backdrop saturate boost added to 1 (0..1.5); frost-only. */
  saturate: number;
  /** Backdrop brightness boost added to 1 (0..0.6, "Vibrancy"); frost-only. */
  brightness: number;
  /** Light chamfer-edge intensity (0..1). */
  edgeLight: number;
  /** Shadow chamfer-edge intensity (0..1). */
  edgeShadow: number;
  /** 1px inner rim intensity (0..1). */
  rim: number;
  /** Outer float/drop-shadow intensity (0..0.8). */
  shadow: number;
}

/**
 * Tunable fields of one text surface, per mode. One font (family/size/weight)
 * applies to the whole surface; the three emphasis levels (bright/normal/dimmed)
 * differ only in colour/alpha. `capitalization` is per-surface (primarily the
 * title consumes it).
 *
 * `fontFamily` + `capitalization` are discrete (not interpolable) — the live render
 * uses the night value (mirroring skytext's single-font emit); `fontSize`,
 * `fontWeight` and the colours cross-fade day↔night.
 */
export interface TextSurfaceFields {
  /** CSS font-family for this surface; one of {@link TYPO_FONTS}. Discrete (night value used). */
  fontFamily: string;
  /** Font size in px (8..48); cross-faded day↔night. */
  fontSize: number;
  /** Font weight (100..900); cross-faded day↔night. */
  fontWeight: number;
  /** CSS `text-transform` for this surface; one of {@link TextCapitalization}.
   *  Discrete (night value used); primarily consumed by {@link TextSurface.EmbossedTitle}. */
  capitalization: string;
  /** Brightest emphasis level colour + alpha. */
  brightColor: string;
  brightOpacity: number;
  /** Normal emphasis level colour + alpha. */
  normalColor: string;
  normalOpacity: number;
  /** Dimmed emphasis level colour + alpha. */
  dimmedColor: string;
  dimmedOpacity: number;
}

/** Tunable fields of the VFD display, per mode. */
export interface VfdFields {
  bg: string;
  bgOpacity: number;
  bright: string;
  normal: string;
  dim: string;
  ghost: string;
  ghostOpacity: number;
  edgeLight: number;
  edgeShade: number;
}

/**
 * Tunable fields of the sky-anchored footer text ("skytext"), per mode.
 *
 * Note: the prototype's on-screen `weight` field stays `uiOnly` (preview aid
 * only, stripped from the export); the production weight lives in CSS. The
 * `size` field IS exported and applied as the footer font-size.
 */
export interface SkyTextFields {
  /** CSS font-family value; one of {@link SKYTEXT_FONTS}. */
  fontFamily: string;
  /** Footer font-size in px (8..48); emitted as `--skytext-<mode>-size`. */
  size: number;
  color: string;
  opacity: number;
  /** Text stroke width in px (0..4). */
  strokeWidth: number;
  strokeColor: string;
}

/**
 * Tunable fields of a sky-anchored link ("skylink"), per mode. The text and
 * underline colours are per-mode; `thickness` (0 = no underline) and `offset`
 * are shared across modes (the prototype writes the same value to both).
 */
export interface SkyLinkFields {
  /** Link text colour, emitted as `--skylink-<mode>-color`. */
  color: string;
  /** Underline (text-decoration) colour, emitted as `--skylink-<mode>-deco`. */
  decoColor: string;
  /** Underline thickness in px (0..4; 0 = no underline). */
  thickness: number;
  /** Underline offset in px (0..8). */
  offset: number;
}

/** Tunable fields of the TFT cover plate, per mode. */
export interface CoverFields {
  bg: string;
  bgOpacity: number;
  innerShadow: number;
  matrixColor: string;
  matrixOpacity: number;
  sheenLight: number;
  sheenShadow: number;
  tintColor: string;
  tintOpacity: number;
}

/** Tunable fields of the info-overlay backdrop scrim, per mode. */
export interface BackdropFields {
  color: string;
  opacity: number;
  /** Scrim blur radius in px (0..40). */
  blur: number;
}

// ─── Shader token typing ───────────────────────────────────────────────────────

/**
 * Numeric night-sky shader parameters with their valid ranges. `bool` params are
 * snapped to 0/1. Keys and ranges are transcribed 1:1 from the prototype PARAMS.
 */
export const SHADER_NUMBER_SPECS = {
  dayness: { min: 0, max: 1 },
  dayTransition: { min: 0.2, max: 10 },
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

/** Hex-colour shader parameters (`#rrggbb`), transcribed 1:1 from prototype COLORS. */
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
/** Union of colour shader parameter keys. */
export type ShaderColorKey = (typeof SHADER_COLOR_KEYS)[number];

/** The full flat shader-token namespace (numeric params + hex colours). */
export type ShaderTokens = { [K in ShaderNumberKey]: number } & {
  [K in ShaderColorKey]: string;
};

// ─── The model ─────────────────────────────────────────────────────────────────

/**
 * The complete, normalised design-token model. One object themes the entire
 * glass material and the night-sky shader for both day and night.
 */
export interface DesignTokens {
  /** Night-sky shader parameters (flat: numeric uniforms + hex colours). */
  shader: ShaderTokens;
  /** Outer-card corner radius in px (0..40); root of the radius cascade. */
  cardRadius: number;
  /** Structural padding/gap tokens, keyed by their `--mc-*` CSS-var name → px.
   *  Mode-independent (no day/night); emitted verbatim as custom properties. */
  paddings: Record<PaddingKey, number>;
  /** Glass surface tokens, keyed by control. */
  glass: Record<GlassControlKey, DayNight<GlassFields>>;
  /** Text tokens, keyed by surface. */
  text: Record<TextSurfaceKey, DayNight<TextSurfaceFields>>;
  /** VFD display tokens (single group, wrapper key kept 1:1 to export). */
  vfd: { vfd: DayNight<VfdFields> };
  /** Footer/skytext tokens (export key `footer`, internal group `skytext`). */
  footer: { skytext: DayNight<SkyTextFields> };
  /** TFT cover-plate tokens (single group, wrapper key kept 1:1 to export). */
  cover: { cover: DayNight<CoverFields> };
  /** Info-overlay backdrop tokens (single group, wrapper key kept 1:1 to export). */
  backdrop: { backdrop: DayNight<BackdropFields> };
  /** Sky-anchored link tokens (single group, wrapper key kept 1:1 to export). */
  skylink: { skylink: DayNight<SkyLinkFields> };
  /** Card-/glass-context link tokens (reuse {@link SkyLinkFields}); a separate
   *  group from `skylink` so a link inside a card can be tuned independently of
   *  links sitting on the sky. */
  cardlink: { cardlink: DayNight<SkyLinkFields> };
}

// ─── Canonical defaults (1:1 from the prototype) ───────────────────────────────

/** Allowed `fontFamily` values for skytext (the prototype's font select). */
export const SKYTEXT_FONTS = [
  '"Barlow", sans-serif',
  '"Roboto", sans-serif',
  "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
] as const;

/** Allowed `fontFamily` values for the surface text controls (adds Roboto Condensed,
 *  the production `--font-condensed` used by titles/labels). */
export const TYPO_FONTS = [
  '"Barlow", sans-serif',
  '"Roboto Condensed", "Barlow", sans-serif',
  '"Roboto", sans-serif',
  "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
] as const;

/** Allowed `text-transform` values (the {@link TextCapitalization} members). */
const TEXT_CAPITALIZATIONS = Object.values(TextCapitalization);

/** Default outer-card radius in px (prototype `CARD_RADIUS_DEFAULT`). */
export const CARD_RADIUS_DEFAULT = 28;

/**
 * Canonical padding/gap tokens (prototype `PADDING_DEFAULTS`), keyed by their
 * `--mc-*` CSS-var name → px. Mode-independent structural spacing; the production
 * components + cardGeometry consume these vars. Range 0..{@link PADDING_MAX} px.
 */
export const PADDING_DEFAULTS = {
  "--mc-pad-card": 12,
  "--mc-pad-header": 10,
  "--mc-pad-header-b": 0,
  "--mc-pad-recessed": 3,
  "--mc-pad-artist": 6,
  "--mc-pad-track": 3,
  "--mc-pad-tracktime": 8,
  "--mc-pad-svc-y": 10,
  "--mc-pad-svc-x": 12,
  "--mc-pad-event-x": 12,
  "--mc-pad-event-y": 4,
  "--mc-gap-cards": 22,
  "--mc-gap-list": 3,
  "--mc-gap-grid": 3,
  "--mc-gap-seg": 3,
  "--mc-gap-rowitem": 12,
  "--mc-gap-artist": 16,
} as const satisfies Record<string, number>;
/** Union of the padding/gap token keys (the `--mc-*` CSS-var names). */
export type PaddingKey = keyof typeof PADDING_DEFAULTS;
/** Max padding/gap value in px (prototype `PADDING_MAX`). */
export const PADDING_MAX = 48;

/**
 * Canonical shader defaults.
 *
 * Unlike the glass/text groups (which the prototype defines from scratch),
 * the night sky is an existing production system with its own user-tuned
 * baseline (`NIGHT_SKY_DEFAULTS` in the frontend). These defaults are therefore
 * aligned to that production baseline — NOT the prototype's PARAMS defaults — so
 * that an empty/absent token blob leaves the live sky unchanged; a saved blob
 * (the prototype export the admin pastes) is what overrides it. The frontend
 * re-clamps these against `NIGHT_SKY_RANGES` before feeding the driver.
 *
 * `cloudNightBrightness`/`cloudDayBrightness` scale the cloud night/day colour
 * (the cloud program multiplies by them); the tuned baseline brightens the
 * night clouds (2.1) and slightly dims the day clouds (0.9).
 */
export const SHADER_DEFAULTS: ShaderTokens = {
  dayness: 0,
  dayTransition: 1,
  autoDayNight: 0,
  sunriseHour: 6.5,
  sunsetHour: 20.5,
  twilightHours: 1.5,
  vignette: 0.1,
  skyWidth: 5632,
  skyHeight: 3168,
  skyFov: 110,
  polarisX: 0.5,
  polarisY: 0.66,
  rotationPeriod: 1200,
  catalogSize: 1.7,
  catalogBrightness: 1.1,
  starDensity: 170,
  starSize: 1.1,
  starBrightness: 0.95,
  twinkleAmount: 0.6,
  twinkleSpeed: 1.8,
  cloudScale: 10,
  cloudCoverage: 0.32,
  cloudSoftness: 0.15,
  cloudOpacity: 1,
  cloudNightBrightness: 2.1,
  cloudDayBrightness: 0.9,
  cloudDetail: 7,
  clearZones: 0.4,
  warpStrength: 0.15,
  windSpeed: 0.021,
  windAngle: 180,
  evolveSpeed: 0.035,
  moonIntensity: 0.15,
  moonAngle: 120,
  sunIntensity: 1,
  sunAngle: 120,
  starOcclusion: 0.1,
  animate: 1,
  renderScale: 0.7,
  fpsCap: 7,
  skyTop: "#0b1318",
  skyBottom: "#10273b",
  skyTopDay: "#0076d5",
  skyBottomDay: "#69d1fd",
  cloudColor: "#2c3b47",
  cloudColorDay: "#e6edf3",
};

/** Canonical glass defaults (prototype `G_DEFAULTS`). */
export const GLASS_DEFAULTS: Record<GlassControlKey, DayNight<GlassFields>> = {
  card: {
    day: {
      tintTop: "#000000",
      tintBottom: "#000000",
      opacity: 0.42,
      blur: 6,
      saturate: 0.0,
      brightness: 0.1,
      edgeLight: 0,
      edgeShadow: 0,
      rim: 0.0,
      shadow: 0.3,
    },
    night: {
      tintTop: "#232323",
      tintBottom: "#232323",
      opacity: 0.42,
      blur: 6,
      saturate: 0.25,
      brightness: 0.5,
      edgeLight: 0,
      edgeShadow: 0,
      rim: 0.07,
      shadow: 0.2,
    },
  },
  cardOverlay: {
    day: {
      tintTop: "#000000",
      tintBottom: "#000000",
      opacity: 0.5,
      blur: 42,
      saturate: 0.0,
      brightness: 0.42,
      edgeLight: 0,
      edgeShadow: 0,
      rim: 0.0,
      shadow: 0.42,
    },
    night: {
      tintTop: "#232323",
      tintBottom: "#232323",
      opacity: 0.5,
      blur: 42,
      saturate: 0.75,
      brightness: 0.42,
      edgeLight: 0,
      edgeShadow: 0,
      rim: 0.07,
      shadow: 0.42,
    },
  },
  button: {
    day: {
      tintTop: "#94e3fe",
      tintBottom: "#94e3fe",
      opacity: 0.13,
      blur: 0,
      saturate: 0.0,
      brightness: 0.0,
      edgeLight: 0,
      edgeShadow: 0,
      rim: 0.06,
      shadow: 0.0,
    },
    night: {
      tintTop: "#94e3fe",
      tintBottom: "#94e3fe",
      opacity: 0.13,
      blur: 2,
      saturate: 0.0,
      brightness: 0.42,
      edgeLight: 0,
      edgeShadow: 0,
      rim: 0.06,
      shadow: 0.0,
    },
  },
  recessed: {
    day: {
      tintTop: "#000000",
      tintBottom: "#000000",
      opacity: 0.28,
      blur: 0,
      saturate: 0.0,
      brightness: 0.0,
      edgeLight: 0,
      edgeShadow: 0,
      rim: 0.0,
      shadow: 0.0,
    },
    night: {
      tintTop: "#000000",
      tintBottom: "#000000",
      opacity: 0.28,
      blur: 0,
      saturate: 0.0,
      brightness: 0.0,
      edgeLight: 0,
      edgeShadow: 0,
      rim: 0.0,
      shadow: 0.0,
    },
  },
  segTrack: {
    day: {
      tintTop: "#00364a",
      tintBottom: "#00364a",
      opacity: 0.32,
      blur: 0,
      saturate: 0.0,
      brightness: 0.0,
      edgeLight: 0,
      edgeShadow: 0,
      rim: 0.0,
      shadow: 0.0,
    },
    night: {
      tintTop: "#000000",
      tintBottom: "#000000",
      opacity: 0.28,
      blur: 0,
      saturate: 0.0,
      brightness: 0.0,
      edgeLight: 0,
      edgeShadow: 0,
      rim: 0.0,
      shadow: 0.0,
    },
  },
  segIndicator: {
    day: {
      tintTop: "#94e3fe",
      tintBottom: "#94e3fe",
      opacity: 0.35,
      blur: 0,
      saturate: 0.0,
      brightness: 0.0,
      edgeLight: 0,
      edgeShadow: 0,
      rim: 0.0,
      shadow: 0.0,
    },
    night: {
      tintTop: "#94e3fe",
      tintBottom: "#94e3fe",
      opacity: 0.2,
      blur: 2,
      saturate: 0.0,
      brightness: 0.42,
      edgeLight: 0,
      edgeShadow: 0,
      rim: 0.08,
      shadow: 0.0,
    },
  },
  // Header controls (nav hamburger + day/night & language switchers) — dedicated
  // tokens so they theme independently of the overlay segmented controls. Defaults
  // mirror segTrack/segIndicator (the current shared look).
  navTrack: {
    day: {
      tintTop: "#00364a",
      tintBottom: "#00364a",
      opacity: 0.32,
      blur: 0,
      saturate: 0.0,
      brightness: 0.0,
      edgeLight: 0,
      edgeShadow: 0,
      rim: 0.0,
      shadow: 0.0,
    },
    night: {
      tintTop: "#000000",
      tintBottom: "#000000",
      opacity: 0.28,
      blur: 0,
      saturate: 0.0,
      brightness: 0.0,
      edgeLight: 0,
      edgeShadow: 0,
      rim: 0.0,
      shadow: 0.0,
    },
  },
  navIndicator: {
    day: {
      tintTop: "#94e3fe",
      tintBottom: "#94e3fe",
      opacity: 0.35,
      blur: 0,
      saturate: 0.0,
      brightness: 0.0,
      edgeLight: 0,
      edgeShadow: 0,
      rim: 0.0,
      shadow: 0.0,
    },
    night: {
      tintTop: "#94e3fe",
      tintBottom: "#94e3fe",
      opacity: 0.2,
      blur: 2,
      saturate: 0.0,
      brightness: 0.42,
      edgeLight: 0,
      edgeShadow: 0,
      rim: 0.08,
      shadow: 0.0,
    },
  },
  // CC-mode hero segmented-control tokens — independent of the commercial
  // segTrack/segIndicator so CC green can be tuned without affecting the default.
  // ccSegTrack mirrors segTrack (neutral recessed well); ccSegIndicator mirrors
  // navIndicator shape but with a green tint (#30d158 = system --color-success)
  // in place of the blue. Day/night pair present; exact tone is fine-tuned in
  // the browser (Task 8).
  ccSegTrack: {
    day: {
      tintTop: "#00364a",
      tintBottom: "#00364a",
      opacity: 0.32,
      blur: 0,
      saturate: 0.0,
      brightness: 0.0,
      edgeLight: 0,
      edgeShadow: 0,
      rim: 0.0,
      shadow: 0.0,
    },
    night: {
      tintTop: "#000000",
      tintBottom: "#000000",
      opacity: 0.28,
      blur: 0,
      saturate: 0.0,
      brightness: 0.0,
      edgeLight: 0,
      edgeShadow: 0,
      rim: 0.0,
      shadow: 0.0,
    },
  },
  ccSegIndicator: {
    day: {
      tintTop: "#30d158",
      tintBottom: "#30d158",
      opacity: 0.35,
      blur: 0,
      saturate: 0.0,
      brightness: 0.0,
      edgeLight: 0,
      edgeShadow: 0,
      rim: 0.0,
      shadow: 0.0,
    },
    night: {
      tintTop: "#30d158",
      tintBottom: "#30d158",
      opacity: 0.2,
      blur: 2,
      saturate: 0.0,
      brightness: 0.42,
      edgeLight: 0,
      edgeShadow: 0,
      rim: 0.08,
      shadow: 0.0,
    },
  },
};

/** The six emphasis colour/opacity fields of a {@link TextSurfaceFields} (font excluded). */
type TextColorLevels = Pick<
  TextSurfaceFields,
  "brightColor" | "brightOpacity" | "normalColor" | "normalOpacity" | "dimmedColor" | "dimmedOpacity"
>;

/** Shared day emphasis COLOURS per level: white at falling opacity. The font
 *  (family/size/weight) is supplied per surface. */
const DAY_COLORS: TextColorLevels = {
  brightColor: "#ffffff",
  brightOpacity: 1.0,
  normalColor: "#ffffff",
  normalOpacity: 0.6,
  dimmedColor: "#ffffff",
  dimmedOpacity: 0.4,
};
/** Recessed-surface day colours: brighter normal/dimmed than {@link DAY_COLORS} so
 *  recessed-well text stays legible over the lighter day sky. */
const DAY_COLORS_RECESSED: TextColorLevels = {
  brightColor: "#ffffff",
  brightOpacity: 1.0,
  normalColor: "#ffffff",
  normalOpacity: 0.75,
  dimmedColor: "#ffffff",
  dimmedOpacity: 0.5,
};
/** Shared night emphasis COLOURS per level: greys at full opacity. */
const NIGHT_COLORS: TextColorLevels = {
  brightColor: "#f5f5f7",
  brightOpacity: 1.0,
  normalColor: "#c7c7cc",
  normalOpacity: 1.0,
  dimmedColor: "#9a9aa0",
  dimmedOpacity: 1.0,
};

/** Assembles one surface's day/night defaults from a single font + caps; the three
 *  emphasis levels differ only in colour. `dayColors` defaults to the shared
 *  {@link DAY_COLORS}; a surface may pass its own (e.g. recessed). */
function mkTextSurface(
  fontFamily: string,
  fontSize: number,
  fontWeight: number,
  capitalization: string,
  dayColors: TextColorLevels = DAY_COLORS,
): DayNight<TextSurfaceFields> {
  const font = { fontFamily, fontSize, fontWeight, capitalization };
  return {
    day: { ...font, ...dayColors },
    night: { ...font, ...NIGHT_COLORS },
  };
}

const BARLOW = '"Barlow", sans-serif';
const ROBOTO_COND = '"Roboto Condensed", "Barlow", sans-serif';

/**
 * Canonical per-surface text defaults (from the reference prototype export). One
 * font per surface; the bright/normal/dimmed levels differ only in colour. The
 * prototype is where the families/sizes/weights get tuned.
 */
export const TEXT_SURFACE_DEFAULTS: Record<TextSurfaceKey, DayNight<TextSurfaceFields>> = {
  embossed: mkTextSurface(BARLOW, 14, 500, TextCapitalization.None),
  recessed: mkTextSurface(BARLOW, 15, 200, TextCapitalization.None, DAY_COLORS_RECESSED),
  button: mkTextSurface(BARLOW, 15, 200, TextCapitalization.None),
  embossedTitle: mkTextSurface(ROBOTO_COND, 14, 200, TextCapitalization.Uppercase),
  infoText: mkTextSurface(BARLOW, 12, 200, TextCapitalization.None),
  // Single-emphasis (its dimmed colour is the placeholder colour = the former
  // `text-text-muted`); font matches the hero input's text size.
  placeholder: mkTextSurface(BARLOW, 16, 500, TextCapitalization.None),
  // Header-controls label/item text — mirrors the button text defaults so the
  // switchers/nav read identically until tuned in the prototype's Header section.
  nav: mkTextSurface(BARLOW, 15, 200, TextCapitalization.None),
};

/** Canonical VFD defaults (prototype `VFD_DEFAULTS`). */
export const VFD_DEFAULTS: DayNight<VfdFields> = {
  day: {
    bg: "#00364a",
    bgOpacity: 0.42,
    bright: "#caf0fe",
    normal: "#bce0ee",
    dim: "#93afba",
    ghost: "#00364a",
    ghostOpacity: 1.0,
    edgeLight: 0.0,
    edgeShade: 0.0,
  },
  night: {
    bg: "#000000",
    bgOpacity: 0.32,
    bright: "#caf0fe",
    normal: "#a5c5d1",
    dim: "#839ba7",
    ghost: "#004d65",
    ghostOpacity: 0.42,
    edgeLight: 0.0,
    edgeShade: 0.0,
  },
};

/** Canonical skytext/footer defaults (prototype `SKYTEXT_DEFAULTS`; `weight` uiOnly stripped, `size` exported). */
export const SKYTEXT_DEFAULTS: DayNight<SkyTextFields> = {
  day: {
    fontFamily: '"Barlow", sans-serif',
    size: 13,
    color: "#caf0fe",
    opacity: 1,
    strokeWidth: 0,
    strokeColor: "#000000",
  },
  night: {
    fontFamily: '"Barlow", sans-serif',
    size: 13,
    color: "#caf0fe",
    opacity: 0.55,
    strokeWidth: 0,
    strokeColor: "#0b1f33",
  },
};

/** Canonical cover defaults (prototype `COVER_DEFAULTS`). */
export const COVER_DEFAULTS: DayNight<CoverFields> = {
  day: {
    bg: "#05070a",
    bgOpacity: 1,
    innerShadow: 0.42,
    matrixColor: "#00364a",
    matrixOpacity: 0.42,
    sheenLight: 0.07,
    sheenShadow: 0.16,
    tintColor: "#caf0fe",
    tintOpacity: 0.15,
  },
  night: {
    bg: "#05070a",
    bgOpacity: 1,
    innerShadow: 0.3,
    matrixColor: "#000000",
    matrixOpacity: 0.32,
    sheenLight: 0.07,
    sheenShadow: 0.23,
    tintColor: "#fff2d5",
    tintOpacity: 0.15,
  },
};

/** Canonical info-overlay backdrop defaults (prototype `BACKDROP_DEFAULTS`). */
export const BACKDROP_DEFAULTS: DayNight<BackdropFields> = {
  day: { color: "#000000", opacity: 0.32, blur: 3 },
  night: { color: "#000000", opacity: 0.32, blur: 3 },
};

/** Canonical sky-link defaults (prototype `SKYLINK_DEFAULTS`). */
export const SKYLINK_DEFAULTS: DayNight<SkyLinkFields> = {
  day: { color: "#06324a", decoColor: "#28a8d8", thickness: 1.5, offset: 2.5 },
  night: { color: "#caf0fe", decoColor: "#28a8d8", thickness: 1.5, offset: 2.5 },
};

/**
 * Canonical card-link defaults. Mirror {@link SKYLINK_DEFAULTS} 1:1 — the
 * card link adopts the sky-link colours as its starting point and lives in its
 * own token group so it can later diverge without touching sky links.
 */
export const CARDLINK_DEFAULTS: DayNight<SkyLinkFields> = {
  day: { color: "#06324a", decoColor: "#28a8d8", thickness: 1.5, offset: 2.5 },
  night: { color: "#caf0fe", decoColor: "#28a8d8", thickness: 1.5, offset: 2.5 },
};

/** The fully-assembled canonical default token set. */
export const DESIGN_TOKENS_DEFAULTS: DesignTokens = {
  shader: SHADER_DEFAULTS,
  cardRadius: CARD_RADIUS_DEFAULT,
  paddings: { ...PADDING_DEFAULTS },
  glass: GLASS_DEFAULTS,
  text: TEXT_SURFACE_DEFAULTS,
  vfd: { vfd: VFD_DEFAULTS },
  footer: { skytext: SKYTEXT_DEFAULTS },
  cover: { cover: COVER_DEFAULTS },
  backdrop: { backdrop: BACKDROP_DEFAULTS },
  skylink: { skylink: SKYLINK_DEFAULTS },
  cardlink: { cardlink: CARDLINK_DEFAULTS },
};

// ─── Field-spec tables (drive validation, mirror the prototype field defs) ─────

/** A single tunable field's validation contract. */
type FieldSpec =
  | { kind: "color" }
  | { kind: "number"; min: number; max: number; bool?: boolean }
  | { kind: "font" }
  | { kind: "enum"; values: readonly string[] };

const GLASS_FIELD_SPECS: Record<keyof GlassFields, FieldSpec> = {
  tintTop: { kind: "color" },
  tintBottom: { kind: "color" },
  opacity: { kind: "number", min: 0, max: 1 },
  blur: { kind: "number", min: 0, max: 60 },
  saturate: { kind: "number", min: 0, max: 1.5 },
  brightness: { kind: "number", min: 0, max: 0.6 },
  edgeLight: { kind: "number", min: 0, max: 1 },
  edgeShadow: { kind: "number", min: 0, max: 1 },
  rim: { kind: "number", min: 0, max: 1 },
  shadow: { kind: "number", min: 0, max: 0.8 },
};

const TEXT_SURFACE_FIELD_SPECS: Record<keyof TextSurfaceFields, FieldSpec> = {
  fontFamily: { kind: "enum", values: TYPO_FONTS },
  fontSize: { kind: "number", min: 8, max: 48 },
  fontWeight: { kind: "number", min: 100, max: 900 },
  capitalization: { kind: "enum", values: TEXT_CAPITALIZATIONS },
  brightColor: { kind: "color" },
  brightOpacity: { kind: "number", min: 0, max: 1 },
  normalColor: { kind: "color" },
  normalOpacity: { kind: "number", min: 0, max: 1 },
  dimmedColor: { kind: "color" },
  dimmedOpacity: { kind: "number", min: 0, max: 1 },
};

const VFD_FIELD_SPECS: Record<keyof VfdFields, FieldSpec> = {
  bg: { kind: "color" },
  bgOpacity: { kind: "number", min: 0, max: 1 },
  bright: { kind: "color" },
  normal: { kind: "color" },
  dim: { kind: "color" },
  ghost: { kind: "color" },
  ghostOpacity: { kind: "number", min: 0, max: 1 },
  edgeLight: { kind: "number", min: 0, max: 1 },
  edgeShade: { kind: "number", min: 0, max: 1 },
};

const SKYTEXT_FIELD_SPECS: Record<keyof SkyTextFields, FieldSpec> = {
  fontFamily: { kind: "font" },
  size: { kind: "number", min: 8, max: 48 },
  color: { kind: "color" },
  opacity: { kind: "number", min: 0, max: 1 },
  strokeWidth: { kind: "number", min: 0, max: 4 },
  strokeColor: { kind: "color" },
};

const COVER_FIELD_SPECS: Record<keyof CoverFields, FieldSpec> = {
  bg: { kind: "color" },
  bgOpacity: { kind: "number", min: 0, max: 1 },
  innerShadow: { kind: "number", min: 0, max: 1 },
  matrixColor: { kind: "color" },
  matrixOpacity: { kind: "number", min: 0, max: 1 },
  sheenLight: { kind: "number", min: 0, max: 1 },
  sheenShadow: { kind: "number", min: 0, max: 1 },
  tintColor: { kind: "color" },
  tintOpacity: { kind: "number", min: 0, max: 1 },
};

const BACKDROP_FIELD_SPECS: Record<keyof BackdropFields, FieldSpec> = {
  color: { kind: "color" },
  opacity: { kind: "number", min: 0, max: 1 },
  blur: { kind: "number", min: 0, max: 40 },
};

const SKYLINK_FIELD_SPECS: Record<keyof SkyLinkFields, FieldSpec> = {
  color: { kind: "color" },
  decoColor: { kind: "color" },
  thickness: { kind: "number", min: 0, max: 4 },
  offset: { kind: "number", min: 0, max: 8 },
};

/** Card-link fields share the sky-link validation contract. */
const CARDLINK_FIELD_SPECS = SKYLINK_FIELD_SPECS;

// ─── Validation primitives ─────────────────────────────────────────────────────

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const RGB_COLOR = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\)$/i;

/**
 * Returns a CSS-injection-safe colour string or `null`. Accepts `#rrggbb`
 * (lowercased) and `rgb()/rgba()` with integer channels; everything else is
 * rejected so persisted, admin-editable values can never carry arbitrary CSS.
 */
function sanitizeColor(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (HEX_COLOR.test(v)) return v.toLowerCase();
  if (RGB_COLOR.test(v)) return v.replace(/\s+/g, " ");
  return null;
}

/** Clamps a finite number into [min,max]; snaps to 0/1 for boolean params. */
function sanitizeNumber(raw: unknown, min: number, max: number, bool?: boolean): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  if (bool) return raw >= 0.5 ? 1 : 0;
  return Math.min(max, Math.max(min, raw));
}

/** Resolves one field against its spec, falling back to `fallback` on any miss. */
function sanitizeField(raw: unknown, fallback: unknown, spec: FieldSpec, path: string, errors: string[]): unknown {
  switch (spec.kind) {
    case "color": {
      const c = sanitizeColor(raw);
      if (c === null) {
        if (raw !== undefined) errors.push(`${path}: invalid color, using default`);
        return fallback;
      }
      return c;
    }
    case "number": {
      const n = sanitizeNumber(raw, spec.min, spec.max, spec.bool);
      if (n === null) {
        if (raw !== undefined) errors.push(`${path}: invalid number, using default`);
        return fallback;
      }
      return n;
    }
    case "font": {
      if (typeof raw === "string" && (SKYTEXT_FONTS as readonly string[]).includes(raw)) return raw;
      if (raw !== undefined) errors.push(`${path}: unknown font, using default`);
      return fallback;
    }
    case "enum": {
      if (typeof raw === "string" && spec.values.includes(raw)) return raw;
      if (raw !== undefined) errors.push(`${path}: invalid value, using default`);
      return fallback;
    }
  }
}

/** Resolves an object of fields against a spec table; unknown keys are dropped. */
function sanitizeFields<T extends Record<string, unknown>>(
  raw: unknown,
  fallback: T,
  specs: Record<string, FieldSpec>,
  path: string,
  errors: string[],
): T {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = {} as Record<string, unknown>;
  for (const key of Object.keys(specs)) {
    out[key] = sanitizeField(source[key], fallback[key], specs[key], `${path}.${key}`, errors);
  }
  return out as T;
}

/** Resolves a `{ day, night }` group against a single field-spec table. */
function sanitizeDayNight<T extends Record<string, unknown>>(
  raw: unknown,
  fallback: DayNight<T>,
  specs: Record<string, FieldSpec>,
  path: string,
  errors: string[],
): DayNight<T> {
  const source = (raw && typeof raw === "object" ? raw : {}) as { day?: unknown; night?: unknown };
  return {
    day: sanitizeFields(source.day, fallback.day, specs, `${path}.day`, errors),
    night: sanitizeFields(source.night, fallback.night, specs, `${path}.night`, errors),
  };
}

/** Deep-clones the canonical defaults (pure data, safe via JSON round-trip). */
function cloneDefaults(): DesignTokens {
  return JSON.parse(JSON.stringify(DESIGN_TOKENS_DEFAULTS)) as DesignTokens;
}

// ─── Public parser ─────────────────────────────────────────────────────────────

/**
 * Validates and normalises a raw design-token blob (the prototype export, as a
 * JSON string or already-parsed object) into a guaranteed-valid {@link DesignTokens}.
 *
 * The result is **always** a complete token set: every invalid, out-of-range, or
 * missing value is replaced by its canonical default, every unknown key is
 * dropped, and every colour is constrained to `#rrggbb`/`rgb()` so the output can
 * be emitted into a `<style>` block without CSS-injection risk. Use `errors` (a
 * human-readable list of what was rejected) for admin-facing validation feedback;
 * `tokens` is safe to apply unconditionally.
 *
 * @param raw The exported token blob — a JSON string or a parsed object. The
 *   shader parameters are read from the flat top level; the structured groups
 *   from `cardRadius`/`glass`/`text`/`vfd`/`footer`/`cover`/`backdrop`.
 * @returns `{ tokens, errors }` — the normalised token set and the list of
 *   rejected/clamped values (empty when the input was fully valid).
 */
export function parseDesignTokens(raw: unknown): { tokens: DesignTokens; errors: string[] } {
  const errors: string[] = [];

  let obj: Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        return { tokens: cloneDefaults(), errors: ["root: expected a JSON object"] };
      }
      obj = parsed as Record<string, unknown>;
    } catch {
      return { tokens: cloneDefaults(), errors: ["root: invalid JSON"] };
    }
  } else if (raw && typeof raw === "object") {
    obj = raw as Record<string, unknown>;
  } else {
    return { tokens: cloneDefaults(), errors: ["root: expected an object or JSON string"] };
  }

  // Shader. The prototype export spreads these flat at the top level, but the
  // normalised model nests them under `shader`. Read from `obj.shader` when
  // present so re-parsing an already-normalised blob stays idempotent
  // (`parse(parse(x)) === parse(x)`); otherwise fall back to the flat top level.
  const shaderSource: Record<string, unknown> =
    obj.shader && typeof obj.shader === "object" ? (obj.shader as Record<string, unknown>) : obj;
  const shader = {} as ShaderTokens;
  for (const key of Object.keys(SHADER_NUMBER_SPECS) as ShaderNumberKey[]) {
    const spec = SHADER_NUMBER_SPECS[key];
    const n = sanitizeNumber(shaderSource[key], spec.min, spec.max, (spec as { bool?: boolean }).bool);
    if (n === null) {
      if (shaderSource[key] !== undefined) errors.push(`shader.${key}: invalid number, using default`);
      shader[key] = SHADER_DEFAULTS[key];
    } else {
      shader[key] = n;
    }
  }
  for (const key of SHADER_COLOR_KEYS) {
    const c = sanitizeColor(shaderSource[key]);
    if (c === null) {
      if (shaderSource[key] !== undefined) errors.push(`shader.${key}: invalid color, using default`);
      shader[key] = SHADER_DEFAULTS[key];
    } else {
      shader[key] = c;
    }
  }

  // cardRadius — flat top-level number.
  const cardRadius = sanitizeNumber(obj.cardRadius, 0, 40) ?? CARD_RADIUS_DEFAULT;
  if (obj.cardRadius !== undefined && sanitizeNumber(obj.cardRadius, 0, 40) === null) {
    errors.push("cardRadius: invalid number, using default");
  }

  // Paddings — flat { "--mc-*": px } map; each known key clamped to 0..PADDING_MAX,
  // unknown keys dropped. The keys ARE the emitted CSS-var names.
  const rawPaddings = (obj.paddings && typeof obj.paddings === "object" ? obj.paddings : {}) as Record<string, unknown>;
  const paddings = {} as Record<PaddingKey, number>;
  for (const key of Object.keys(PADDING_DEFAULTS) as PaddingKey[]) {
    const n = sanitizeNumber(rawPaddings[key], 0, PADDING_MAX);
    if (n === null) {
      if (rawPaddings[key] !== undefined) errors.push(`paddings.${key}: invalid number, using default`);
      paddings[key] = PADDING_DEFAULTS[key];
    } else {
      paddings[key] = n;
    }
  }

  // Structured groups.
  const rawGlass = (obj.glass && typeof obj.glass === "object" ? obj.glass : {}) as Record<string, unknown>;
  const glass = {} as Record<GlassControlKey, DayNight<GlassFields>>;
  for (const control of Object.keys(GLASS_DEFAULTS) as GlassControlKey[]) {
    glass[control] = sanitizeDayNight(
      rawGlass[control],
      GLASS_DEFAULTS[control] as unknown as DayNight<Record<string, unknown>>,
      GLASS_FIELD_SPECS,
      `glass.${control}`,
      errors,
    ) as unknown as DayNight<GlassFields>;
  }

  const rawText = (obj.text && typeof obj.text === "object" ? obj.text : {}) as Record<string, unknown>;
  const text = {} as Record<TextSurfaceKey, DayNight<TextSurfaceFields>>;
  for (const surface of Object.keys(TEXT_SURFACE_DEFAULTS) as TextSurfaceKey[]) {
    text[surface] = sanitizeDayNight(
      rawText[surface],
      TEXT_SURFACE_DEFAULTS[surface] as unknown as DayNight<Record<string, unknown>>,
      TEXT_SURFACE_FIELD_SPECS,
      `text.${surface}`,
      errors,
    ) as unknown as DayNight<TextSurfaceFields>;
  }

  const vfd = sanitizeDayNight(
    (obj.vfd as { vfd?: unknown } | undefined)?.vfd,
    VFD_DEFAULTS as unknown as DayNight<Record<string, unknown>>,
    VFD_FIELD_SPECS,
    "vfd.vfd",
    errors,
  ) as unknown as DayNight<VfdFields>;

  const skytext = sanitizeDayNight(
    (obj.footer as { skytext?: unknown } | undefined)?.skytext,
    SKYTEXT_DEFAULTS as unknown as DayNight<Record<string, unknown>>,
    SKYTEXT_FIELD_SPECS,
    "footer.skytext",
    errors,
  ) as unknown as DayNight<SkyTextFields>;

  const cover = sanitizeDayNight(
    (obj.cover as { cover?: unknown } | undefined)?.cover,
    COVER_DEFAULTS as unknown as DayNight<Record<string, unknown>>,
    COVER_FIELD_SPECS,
    "cover.cover",
    errors,
  ) as unknown as DayNight<CoverFields>;

  const backdrop = sanitizeDayNight(
    (obj.backdrop as { backdrop?: unknown } | undefined)?.backdrop,
    BACKDROP_DEFAULTS as unknown as DayNight<Record<string, unknown>>,
    BACKDROP_FIELD_SPECS,
    "backdrop.backdrop",
    errors,
  ) as unknown as DayNight<BackdropFields>;

  const skylink = sanitizeDayNight(
    (obj.skylink as { skylink?: unknown } | undefined)?.skylink,
    SKYLINK_DEFAULTS as unknown as DayNight<Record<string, unknown>>,
    SKYLINK_FIELD_SPECS,
    "skylink.skylink",
    errors,
  ) as unknown as DayNight<SkyLinkFields>;

  const cardlink = sanitizeDayNight(
    (obj.cardlink as { cardlink?: unknown } | undefined)?.cardlink,
    CARDLINK_DEFAULTS as unknown as DayNight<Record<string, unknown>>,
    CARDLINK_FIELD_SPECS,
    "cardlink.cardlink",
    errors,
  ) as unknown as DayNight<SkyLinkFields>;

  return {
    tokens: {
      shader,
      cardRadius,
      paddings,
      glass,
      text,
      vfd: { vfd },
      footer: { skytext },
      cover: { cover },
      backdrop: { backdrop },
      skylink: { skylink },
      cardlink: { cardlink },
    },
    errors,
  };
}
