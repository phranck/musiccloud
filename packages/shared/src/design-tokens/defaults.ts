/**
 * The canonical design-token defaults, transcribed 1:1 from the reference
 * prototype (the shader defaults excepted, see {@link SHADER_DEFAULTS}), and the
 * font lists the text fields may choose from. `parseDesignTokens` falls back to
 * these values for every missing or invalid field.
 */

import {
  type BackdropFields,
  type CoverFields,
  type DayNight,
  type DesignTokens,
  type GlassControlKey,
  type GlassFields,
  type ShaderTokens,
  type ShadowFields,
  type SkyLinkFields,
  type SkyTextFields,
  TextCapitalization,
  type TextSurfaceFields,
  type TextSurfaceKey,
  type VfdFields,
} from "./model.js";

// ─── Canonical defaults (1:1 from the prototype) ───────────────────────────────

/** Allowed `fontFamily` values for skytext (the prototype's font select). */
export const SKYTEXT_FONTS = [
  '"Barlow", sans-serif',
  '"Roboto", sans-serif',
  "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
] as const;

/** Allowed `fontFamily` values for the surface text controls (adds Roboto Condensed,
 *  the production `--font-condensed` used by titles and labels). */
export const TYPO_FONTS = [
  '"Barlow", sans-serif',
  '"Roboto Condensed", "Barlow", sans-serif',
  '"Roboto", sans-serif',
  "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
] as const;

/** Default outer-card radius in px (prototype `CARD_RADIUS_DEFAULT`). */
export const CARD_RADIUS_DEFAULT = 28;

/**
 * Canonical padding and gap tokens (prototype `PADDING_DEFAULTS`), keyed by their
 * `--mc-*` CSS-var name, in px. Mode-independent structural spacing that the
 * production components and cardGeometry consume. Range 0..{@link PADDING_MAX} px.
 */
export const PADDING_DEFAULTS = {
  "--mc-pad-card": 10,
  "--mc-pad-header": 14,
  "--mc-pad-header-b": 12,
  "--mc-pad-recessed": 3,
  "--mc-pad-artist": 10,
  "--mc-pad-track": 4,
  "--mc-pad-tracktime": 14,
  "--mc-pad-svc-y": 10,
  "--mc-pad-svc-x": 12,
  "--mc-pad-event-x": 12,
  "--mc-pad-event-y": 10,
  "--mc-gap-cards": 22,
  "--mc-gap-list": 3,
  "--mc-gap-grid": 3,
  "--mc-gap-seg": 3,
  "--mc-gap-rowitem": 12,
  "--mc-gap-artist": 16,
} as const satisfies Record<string, number>;
/** Max padding and gap value in px (prototype `PADDING_MAX`). */
export const PADDING_MAX = 48;

/**
 * Canonical shader defaults.
 *
 * Unlike the glass and text groups (which the prototype defines from scratch),
 * the night sky is an existing production system with its own user-tuned
 * baseline (`NIGHT_SKY_DEFAULTS` in the frontend). These defaults are therefore
 * aligned to that production baseline, NOT the prototype's PARAMS defaults, so
 * that an empty or absent token blob leaves the live sky unchanged. A saved blob
 * (the prototype export the admin pastes) is what overrides it. The frontend
 * re-clamps these against `NIGHT_SKY_RANGES` before feeding the driver.
 *
 * `cloudNightBrightness` and `cloudDayBrightness` scale the cloud night and day
 * color (the cloud program multiplies by them). The tuned baseline brightens the
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
  fpsCap: 8,
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
      tint: "#000000",
      opacity: 0.42,
      shadow: 0.3,
    },
    night: {
      tint: "#354046",
      opacity: 0.42,
      shadow: 0.2,
    },
  },
  cardOverlay: {
    day: {
      tint: "#000000",
      opacity: 0.5,
      shadow: 0.42,
    },
    night: {
      tint: "#232323",
      opacity: 0.5,
      shadow: 0.42,
    },
  },
  button: {
    day: {
      tint: "#94e3fe",
      opacity: 0.13,
      shadow: 0.0,
    },
    night: {
      tint: "#94e3fe",
      opacity: 0.13,
      shadow: 0.0,
    },
  },
  recessed: {
    day: {
      tint: "#000000",
      opacity: 0.28,
      shadow: 0.0,
    },
    night: {
      tint: "#000000",
      opacity: 0.28,
      shadow: 0.0,
    },
  },
  segTrack: {
    day: {
      tint: "#00364a",
      opacity: 0.32,
      shadow: 0.0,
    },
    night: {
      tint: "#000000",
      opacity: 0.28,
      shadow: 0.0,
    },
  },
  segIndicator: {
    day: {
      tint: "#94e3fe",
      opacity: 0.35,
      shadow: 0.0,
    },
    night: {
      tint: "#94e3fe",
      opacity: 0.2,
      shadow: 0.0,
    },
  },
  // Header controls (nav hamburger plus day/night and language switchers) have
  // dedicated tokens so they theme independently of the overlay segmented
  // controls. Their defaults mirror segTrack and segIndicator.
  navTrack: {
    day: {
      tint: "#00364a",
      opacity: 0.32,
      shadow: 0.0,
    },
    night: {
      tint: "#004f6f",
      opacity: 0.32,
      shadow: 0.0,
    },
  },
  navIndicator: {
    day: {
      tint: "#94e3fe",
      opacity: 0.35,
      shadow: 0.0,
    },
    night: {
      tint: "#94e3fe",
      opacity: 0.2,
      shadow: 0.0,
    },
  },
  // CC-mode hero segmented-control tokens are independent of the commercial
  // segTrack and segIndicator, so the CC green can be tuned without affecting
  // the default. ccSegTrack mirrors segTrack (neutral recessed well), and
  // ccSegIndicator mirrors the navIndicator shape with a green tint
  // (#30d158 = system --color-success) in place of the blue.
  ccSegTrack: {
    day: {
      tint: "#00364a",
      opacity: 0.32,
      shadow: 0.0,
    },
    night: {
      tint: "#000000",
      opacity: 0.28,
      shadow: 0.0,
    },
  },
  ccSegIndicator: {
    day: {
      tint: "#30d158",
      opacity: 0.35,
      shadow: 0.0,
    },
    night: {
      tint: "#30d158",
      opacity: 0.2,
      shadow: 0.0,
    },
  },
};

/** The six emphasis color and opacity fields of a {@link TextSurfaceFields} (font excluded). */
type TextColorLevels = Pick<
  TextSurfaceFields,
  "brightColor" | "brightOpacity" | "normalColor" | "normalOpacity" | "dimmedColor" | "dimmedOpacity"
>;

/** Shared day emphasis colors per level: white at falling opacity. The font
 *  (family, size, weight) is supplied per surface. */
const DAY_COLORS: TextColorLevels = {
  brightColor: "#ffffff",
  brightOpacity: 1.0,
  normalColor: "#ffffff",
  normalOpacity: 0.6,
  dimmedColor: "#ffffff",
  dimmedOpacity: 0.4,
};
/** Recessed-surface day colors: brighter normal and dimmed levels than {@link DAY_COLORS}
 *  so recessed-well text stays legible over the lighter day sky. */
const DAY_COLORS_RECESSED: TextColorLevels = {
  brightColor: "#ffffff",
  brightOpacity: 1.0,
  normalColor: "#ffffff",
  normalOpacity: 0.75,
  dimmedColor: "#ffffff",
  dimmedOpacity: 0.5,
};
/** Shared night emphasis colors per level: grays at full opacity. */
const NIGHT_COLORS: TextColorLevels = {
  brightColor: "#f5f5f7",
  brightOpacity: 1.0,
  normalColor: "#c7c7cc",
  normalOpacity: 1.0,
  dimmedColor: "#9a9aa0",
  dimmedOpacity: 1.0,
};

/**
 * Assembles one surface's day and night defaults from a single font and
 * capitalization. The three emphasis levels differ only in color.
 *
 * @param fontFamily CSS font-family of the surface, one of {@link TYPO_FONTS}.
 * @param fontSize Font size in px, used for both modes.
 * @param fontWeight Font weight, used for both modes.
 * @param capitalization CSS `text-transform`, one of {@link TextCapitalization}.
 * @param dayColors The day emphasis colors. Defaults to the shared {@link DAY_COLORS};
 *   a surface may pass its own (for example {@link DAY_COLORS_RECESSED}).
 * @returns The surface's day fields (font plus `dayColors`) and night fields
 *   (font plus {@link NIGHT_COLORS}).
 */
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

/** The Barlow font stack, the default family of most text surfaces. */
const BARLOW = '"Barlow", sans-serif';
/** The Roboto Condensed font stack, the default family of the embossed title. */
const ROBOTO_COND = '"Roboto Condensed", "Barlow", sans-serif';

/**
 * Canonical per-surface text defaults (from the reference prototype export). One
 * font per surface; the bright, normal and dimmed levels differ only in color.
 * The prototype is where the families, sizes and weights get tuned.
 */
export const TEXT_SURFACE_DEFAULTS: Record<TextSurfaceKey, DayNight<TextSurfaceFields>> = {
  embossed: mkTextSurface(BARLOW, 14, 500, TextCapitalization.None),
  recessed: mkTextSurface(BARLOW, 15, 200, TextCapitalization.None, DAY_COLORS_RECESSED),
  button: mkTextSurface(BARLOW, 15, 200, TextCapitalization.None),
  embossedTitle: mkTextSurface(ROBOTO_COND, 14, 200, TextCapitalization.Uppercase),
  infoText: mkTextSurface(BARLOW, 12, 200, TextCapitalization.None),
  // Single-emphasis: its dimmed color is the placeholder color (the former
  // `text-text-muted`), and the font matches the hero input's text size.
  placeholder: mkTextSurface(BARLOW, 16, 500, TextCapitalization.None),
  // Header-controls label and item text mirrors the button text defaults, so the
  // switchers and nav read identically until tuned in the prototype's Header section.
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

/** Canonical skytext and footer defaults (prototype `SKYTEXT_DEFAULTS`; `weight` uiOnly stripped, `size` exported). */
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

/**
 * Canonical cover defaults (prototype `COVER_DEFAULTS`). Mode-independent: one
 * fixed look for the cover screen, with no day/night cross-fade.
 */
export const COVER_DEFAULTS: CoverFields = {
  bg: "#05070a",
  bgOpacity: 1,
  innerShadow: 0.42,
  matrixColor: "#00364a",
  matrixOpacity: 0.42,
  sheenLight: 0.07,
  sheenShadow: 0.16,
  tintColor: "#caf0fe",
  tintOpacity: 0.15,
};

/**
 * Canonical drop-shadow geometry default (prototype `SHADOW_DEFAULTS`). Global and
 * mode-independent; the per-surface strength is the glass `shadow` field.
 */
export const SHADOW_DEFAULTS: ShadowFields = {
  offsetX: 0,
  offsetY: 8,
  blur: 11,
  color: "#000000",
};

/** Canonical info-overlay backdrop defaults (prototype `BACKDROP_DEFAULTS`). */
export const BACKDROP_DEFAULTS: DayNight<BackdropFields> = {
  day: { color: "#000000", opacity: 0.32, blur: 3 },
  night: { color: "#000000", opacity: 0.32, blur: 3 },
};

/** Canonical sky-link defaults (prototype `SKYLINK_DEFAULTS`). */
export const SKYLINK_DEFAULTS: DayNight<SkyLinkFields> = {
  day: { color: "#fff800", decoColor: "#fff800", thickness: 0.25, offset: 2.5 },
  night: { color: "#caf0fe", decoColor: "#28a8d8", thickness: 0.25, offset: 2.5 },
};

/**
 * Canonical card-link defaults. The card link adopts the sky-link colors of
 * {@link SKYLINK_DEFAULTS} as its starting point and lives in its own token group,
 * so it can diverge without touching sky links.
 */
export const CARDLINK_DEFAULTS: DayNight<SkyLinkFields> = {
  day: { color: "#fefcdd", decoColor: "#fff800", thickness: 0.25, offset: 3.5 },
  night: { color: "#caf0fe", decoColor: "#28a8d8", thickness: 0.25, offset: 3.5 },
};

/** The fully assembled canonical default token set. */
export const DESIGN_TOKENS_DEFAULTS: DesignTokens = {
  shader: SHADER_DEFAULTS,
  cardRadius: CARD_RADIUS_DEFAULT,
  paddings: { ...PADDING_DEFAULTS },
  glass: GLASS_DEFAULTS,
  text: TEXT_SURFACE_DEFAULTS,
  vfd: { vfd: VFD_DEFAULTS },
  footer: { skytext: SKYTEXT_DEFAULTS },
  cover: { cover: COVER_DEFAULTS },
  shadow: { shadow: SHADOW_DEFAULTS },
  backdrop: { backdrop: BACKDROP_DEFAULTS },
  skylink: { skylink: SKYLINK_DEFAULTS },
  cardlink: { cardlink: CARDLINK_DEFAULTS },
};
