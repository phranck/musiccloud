/**
 * Production settings of the night-sky WebGL background (plan MC-029,
 * Phase 4). The values are the user-approved prototype JSON — fifth
 * iteration, re-tuned 2026-06-13 for the static sky plane (MC-031: star
 * density/size, twinkle, wind, occlusion, day horizon color) — and must
 * stay in lockstep with `mockups/frontend-prototype.html` (the tuning tool that
 * produced them).
 *
 * Default behaviour encoded here: fixed NIGHT start (`dayness: 0`,
 * `autoDayNight: 0`); the day mode and the local-time automatic remain
 * opt-in features of the BackgroundScene API.
 */

/** All tunable parameters of the night-sky scene (shader uniforms + loop config). */
export interface NightSkySettings {
  /** Night→day blend: 0 = night sky with stars, 1 = summer day. */
  dayness: number;
  /** Duration in seconds of the animated manual day/night fade. */
  dayTransition: number;
  /** 1 = follow the viewer's local clock (opt-in), 0 = fixed `dayness`. */
  autoDayNight: 0 | 1;
  /** Local hour the morning twilight is centred on (auto mode). */
  sunriseHour: number;
  /** Local hour the evening twilight is centred on (auto mode). */
  sunsetHour: number;
  /** Length of the dawn/dusk transition window in hours (auto mode). */
  twilightHours: number;
  /** Corner darkening, 0..1. */
  vignette: number;
  /**
   * Width of the FIXED virtual sky plane in CSS pixels (plan MC-031). The
   * sky is a static backdrop the viewport only crops — resizing the window
   * shows more or less of this plane instead of squashing it. Larger than
   * native 5K (5120) so even a 5K display sees a partial view.
   */
  skyWidth: number;
  /** Height of the fixed virtual sky plane in CSS pixels (> 2880, see {@link skyWidth}). */
  skyHeight: number;
  /** Degrees of sky mapped onto the VIRTUAL plane height (not the window). */
  skyFov: number;
  /**
   * Horizontal position of Polaris (0 = left, 1 = right). Dual role since
   * MC-031: it is where Polaris appears in the WINDOW *and* the anchor of
   * the crop within the virtual plane (`offset = polarisX × (skyWidth −
   * viewportWidth)`), so Polaris sits here for every window size.
   */
  polarisX: number;
  /** Vertical position of Polaris (0 = bottom, 1 = top); same dual role as {@link polarisX}. */
  polarisY: number;
  /** Seconds per full sky revolution around Polaris (real sky: ~86164 s). */
  rotationPeriod: number;
  /** Dot size of the catalog stars (CSS px at scale 1). */
  catalogSize: number;
  /** Glow strength of the catalog stars. */
  catalogBrightness: number;
  /** Cell density of the procedural fill-star field. */
  starDensity: number;
  /** Dot size of the fill stars (CSS px). */
  starSize: number;
  /** Brightness of the fill stars. */
  starBrightness: number;
  /** Twinkle strength, 0..1. */
  twinkleAmount: number;
  /** Twinkle speed factor. */
  twinkleSpeed: number;
  /** Spatial frequency of the cloud field (higher = smaller formations). */
  cloudScale: number;
  /** Sky fraction covered by clouds, 0..1. */
  cloudCoverage: number;
  /** Edge softness of the coverage threshold. */
  cloudSoftness: number;
  /** Opacity of the cloud layer, 0..1. */
  cloudOpacity: number;
  /** Brightness multiplier of the night cloud colour (1 = production baseline). */
  cloudNightBrightness: number;
  /** Brightness multiplier of the day cloud colour (1 = production baseline). */
  cloudDayBrightness: number;
  /** fbm octaves of the cloud field (integer 2..7). */
  cloudDetail: number;
  /** Strength of the macro clear-sky carving, 0..1. */
  clearZones: number;
  /** Domain-warp strength (ragged edges). */
  warpStrength: number;
  /** Cloud drift speed (noise-domain units per second). */
  windSpeed: number;
  /** Cloud drift direction in degrees (0 = right, 90 = up). */
  windAngle: number;
  /** Shape-evolution speed (time as third noise dimension). */
  evolveSpeed: number;
  /** Cool night rim-light strength on cloud edges. */
  moonIntensity: number;
  /** Direction the moonlight comes from, degrees. */
  moonAngle: number;
  /** Warm day rim-light strength on cloud edges. */
  sunIntensity: number;
  /** Direction the sunlight comes from, degrees. */
  sunAngle: number;
  /** How strongly clouds dim the stars behind them. */
  starOcclusion: number;
  /** Master switch: 0 freezes the scene as a still image (no GPU work). */
  animate: 0 | 1;
  /** Internal render resolution relative to CSS size (before DPR). */
  renderScale: number;
  /** Maximum frames per second of the idle loop. */
  fpsCap: number;
  /** Night sky color, top of screen (#rrggbb). */
  skyTop: string;
  /** Night sky color, horizon (#rrggbb). */
  skyBottom: string;
  /** Day sky color, top of screen (#rrggbb). */
  skyTopDay: string;
  /** Day sky color, horizon (#rrggbb). */
  skyBottomDay: string;
  /** Cloud base color at night (#rrggbb). */
  cloudColor: string;
  /** Cloud base color at day (#rrggbb). */
  cloudColorDay: string;
}

/** User-approved production defaults (prototype sign-off 2026-06-15 re-tune). */
export const NIGHT_SKY_DEFAULTS: NightSkySettings = {
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

/**
 * Valid ranges of the numeric settings — the prototype's slider bounds.
 * Consumers clamp external values (e.g. future remote config) against these
 * so an out-of-range number can never break the shader.
 */
export const NIGHT_SKY_RANGES: Record<
  Exclude<
    keyof NightSkySettings,
    "skyTop" | "skyBottom" | "skyTopDay" | "skyBottomDay" | "cloudColor" | "cloudColorDay"
  >,
  { min: number; max: number }
> = {
  dayness: { min: 0, max: 1 },
  dayTransition: { min: 0.2, max: 10 },
  autoDayNight: { min: 0, max: 1 },
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
  animate: { min: 0, max: 1 },
  renderScale: { min: 0.25, max: 1 },
  fpsCap: { min: 5, max: 60 },
};

/**
 * Frame rate the manual day/night fade renders at (user decision
 * 2026-06-12): the scene idles at `fpsCap` (7), but the one-second fade
 * would look steppy there — while a fade runs, the loop temporarily lifts
 * the cap to this value and falls back right after.
 */
export const DAY_FADE_FPS = 30;

/**
 * Clamped smoothstep on 0..1 (`3t²−2t³`, ported from the prototype). The single
 * easing curve shared by the two ramps that need it: the twilight day-amount
 * ramp here ({@link daynessForLocalTime}) and the manual day-fade easing in the
 * loop driver.
 *
 * @param t - Input, clamped to [0, 1] before easing.
 * @returns The eased value in [0, 1].
 */
export function smooth01(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

/** The three clock parameters consumed by {@link daynessForLocalTime}. */
export interface TwilightConfig {
  /** Local hour the morning twilight is centred on. */
  sunriseHour: number;
  /** Local hour the evening twilight is centred on. */
  sunsetHour: number;
  /** Length of the dawn/dusk transition window in hours. */
  twilightHours: number;
}

/**
 * Maps a local wall-clock time to the day amount: 0 at night, 1 at day,
 * with a smooth twilight ramp of `twilightHours` centred on sunrise and
 * sunset. The curve is continuous, so the opt-in auto mode plays dawn and
 * dusk out in REAL TIME while the page stays open. Pure function — exact
 * port of the prototype implementation, covered by unit tests.
 *
 * @param date - The viewer's local time to evaluate.
 * @param config - Sunrise/sunset centres and twilight window length.
 * @returns Day amount in [0, 1].
 */
export function daynessForLocalTime(date: Date, config: TwilightConfig): number {
  const h = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  const half = config.twilightHours / 2;
  const up = smooth01((h - (config.sunriseHour - half)) / config.twilightHours);
  const down = 1 - smooth01((h - (config.sunsetHour - half)) / config.twilightHours);
  return up * down;
}
