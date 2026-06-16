/**
 * Serialises a validated {@link DesignTokens} blob into the `:root` custom-property
 * declaration block the glass material reads.
 *
 * Emitted once during SSR as an inline `<style>` in `BaseLayout`'s synchronous
 * head (after `global.css`, so it wins the cascade), this is what makes the
 * persisted tokens take effect on the very first paint with no flash of the
 * compiled-in defaults and no client round-trip.
 *
 * Safety: the input must already be the output of `parseDesignTokens` — every
 * colour is constrained to `#rrggbb`/`rgb()` and every number is range-clamped,
 * so the produced string can never carry arbitrary CSS even though it is emitted
 * with `set:html`.
 */

import type { DesignTokens, GlassControlKey, GlassFields, TextSurfaceKey } from "@musiccloud/shared";

/**
 * Composes a `#rrggbb`/`rgb()` colour and a 0..1 opacity into an `rgba()` string,
 * mirroring the prototype's apply-time folding of tint colour + opacity.
 * Hex is expanded to channels; an already-functional colour is passed through.
 */
function toRgba(color: string, alpha: number): string {
  if (color.startsWith("#")) {
    const n = Number.parseInt(color.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
  }
  return color;
}

/**
 * Lifts a `#rrggbb` colour's HSL lightness by `pct` percentage points (clamped to
 * 0..100), returning a new `#rrggbb`. Non-hex inputs (e.g. `rgb()`) pass through
 * unchanged.
 *
 * Drives the button hover/active background: the configured button tint, a few %
 * lighter in HSL. Computed here (at SSR) rather than via CSS `hsl(from …)` so it
 * works in every browser and matches the reference prototype exactly.
 */
function liftLightness(color: string, pct: number): string {
  if (!color.startsWith("#") || color.length !== 7) return color;
  const n = Number.parseInt(color.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  let s = 0;
  let l = (max + min) / 2;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  l = Math.min(1, Math.max(0, l + pct / 100));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m0 = l - c / 2;
  let rr = 0;
  let gg = 0;
  let bb = 0;
  if (h < 60) {
    rr = c;
    gg = x;
  } else if (h < 120) {
    rr = x;
    gg = c;
  } else if (h < 180) {
    gg = c;
    bb = x;
  } else if (h < 240) {
    gg = x;
    bb = c;
  } else if (h < 300) {
    rr = x;
    bb = c;
  } else {
    rr = c;
    bb = x;
  }
  const to = (v: number) =>
    Math.round((v + m0) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(rr)}${to(gg)}${to(bb)}`;
}

/** Button hover/active HSL lightness lift, in percentage points. */
const BUTTON_HOVER_LIFT = 10;
const BUTTON_ACTIVE_LIFT = 5;

/** Builds the nine `--<control>-<mode>-<field>` declarations for one glass control + mode. */
function glassControlDecls(control: GlassControlKey, fields: GlassFields, mode: "day" | "night"): string {
  const p = `--${control}-${mode}`;
  return [
    `${p}-tt:${toRgba(fields.tintTop, fields.opacity)}`,
    `${p}-tb:${toRgba(fields.tintBottom, fields.opacity)}`,
    `${p}-bl:${fields.blur}px`,
    `${p}-sa:${fields.saturate}`,
    `${p}-br:${fields.brightness}`,
    `${p}-el:${fields.edgeLight}`,
    `${p}-es:${fields.edgeShadow}`,
    `${p}-rm:${fields.rim}`,
    `${p}-sh:${fields.shadow}`,
  ].join(";");
}

/**
 * Serialises the design tokens into a `:root { … }` block. The selector is
 * `html:root` (specificity above the plain `:root` defaults in `glass.css`)
 * so the override wins regardless of how the bundler orders the stylesheets.
 *
 * @param tokens A validated token set (from `parseDesignTokens`).
 * @returns A single-rule CSS string ready to inline in `<style>`.
 */
export function designTokensToCss(tokens: DesignTokens): string {
  const decls: string[] = [];

  for (const control of Object.keys(tokens.glass) as GlassControlKey[]) {
    const dn = tokens.glass[control];
    decls.push(glassControlDecls(control, dn.day, "day"));
    decls.push(glassControlDecls(control, dn.night, "night"));
  }

  // Button hover/active tints: the configured button tint lifted in HSL (same
  // opacity), per mode, so `.mc-glass-button` cross-fades them like the base tint.
  // A raised button hover/active lightens ONLY its background (never resizes).
  const btn = tokens.glass.button;
  for (const mode of ["day", "night"] as const) {
    const f = btn[mode];
    decls.push(`--button-${mode}-htt:${toRgba(liftLightness(f.tintTop, BUTTON_HOVER_LIFT), f.opacity)}`);
    decls.push(`--button-${mode}-htb:${toRgba(liftLightness(f.tintBottom, BUTTON_HOVER_LIFT), f.opacity)}`);
    decls.push(`--button-${mode}-att:${toRgba(liftLightness(f.tintTop, BUTTON_ACTIVE_LIFT), f.opacity)}`);
    decls.push(`--button-${mode}-atb:${toRgba(liftLightness(f.tintBottom, BUTTON_ACTIVE_LIFT), f.opacity)}`);
  }

  // Per-surface text: one font (size/weight cross-faded per mode; family discrete,
  // night value emitted) + three emphasis colour levels (bright/normal/dimmed),
  // each colour cross-faded in glass.css. `capitalization` is discrete (night value).
  for (const surface of Object.keys(tokens.text) as TextSurfaceKey[]) {
    const dn = tokens.text[surface];
    for (const mode of ["day", "night"] as const) {
      const s = dn[mode];
      decls.push(`--text-${surface}-bright-${mode}:${toRgba(s.brightColor, s.brightOpacity)}`);
      decls.push(`--text-${surface}-normal-${mode}:${toRgba(s.normalColor, s.normalOpacity)}`);
      decls.push(`--text-${surface}-dimmed-${mode}:${toRgba(s.dimmedColor, s.dimmedOpacity)}`);
      decls.push(`--text-${surface}-size-${mode}:${s.fontSize}px`);
      decls.push(`--text-${surface}-weight-${mode}:${s.fontWeight}`);
    }
    decls.push(`--text-${surface}-font:${dn.night.fontFamily}`);
    decls.push(`--text-${surface}-transform:${dn.night.capitalization}`);
  }

  // VFD: screen bg + inset edge strengths (CSS) AND the four phosphor colours
  // (read off the resolved CSS vars by the canvas, re-drawn on dayness change).
  const vfd = tokens.vfd.vfd;
  decls.push(`--vfd-day-bg:${toRgba(vfd.day.bg, vfd.day.bgOpacity)}`);
  decls.push(`--vfd-night-bg:${toRgba(vfd.night.bg, vfd.night.bgOpacity)}`);
  decls.push(`--vfd-day-el:${vfd.day.edgeLight}`);
  decls.push(`--vfd-night-el:${vfd.night.edgeLight}`);
  decls.push(`--vfd-day-es:${vfd.day.edgeShade}`);
  decls.push(`--vfd-night-es:${vfd.night.edgeShade}`);
  decls.push(`--vfd-day-bright:${vfd.day.bright}`);
  decls.push(`--vfd-night-bright:${vfd.night.bright}`);
  decls.push(`--vfd-day-normal:${vfd.day.normal}`);
  decls.push(`--vfd-night-normal:${vfd.night.normal}`);
  decls.push(`--vfd-day-dim:${vfd.day.dim}`);
  decls.push(`--vfd-night-dim:${vfd.night.dim}`);
  decls.push(`--vfd-day-ghost:${toRgba(vfd.day.ghost, vfd.day.ghostOpacity)}`);
  decls.push(`--vfd-night-ghost:${toRgba(vfd.night.ghost, vfd.night.ghostOpacity)}`);

  // Info-overlay backdrop scrim (colour+opacity folded, blur px).
  const bd = tokens.backdrop.backdrop;
  decls.push(`--backdrop-day-bg:${toRgba(bd.day.color, bd.day.opacity)}`);
  decls.push(`--backdrop-night-bg:${toRgba(bd.night.color, bd.night.opacity)}`);
  decls.push(`--backdrop-day-blur:${bd.day.blur}px`);
  decls.push(`--backdrop-night-blur:${bd.night.blur}px`);

  // Sky-anchored footer text (colour+opacity, stroke, font-size, font). Day/night
  // fonts are identical in practice, so one font var (night) is emitted; size is
  // emitted per mode and cross-faded in `.mc-skytext`.
  const st = tokens.footer.skytext;
  decls.push(`--skytext-day-color:${toRgba(st.day.color, st.day.opacity)}`);
  decls.push(`--skytext-night-color:${toRgba(st.night.color, st.night.opacity)}`);
  decls.push(`--skytext-day-stroke-w:${st.day.strokeWidth}px`);
  decls.push(`--skytext-night-stroke-w:${st.night.strokeWidth}px`);
  decls.push(`--skytext-day-stroke-c:${st.day.strokeColor}`);
  decls.push(`--skytext-night-stroke-c:${st.night.strokeColor}`);
  decls.push(`--skytext-day-size:${st.day.size}px`);
  decls.push(`--skytext-night-size:${st.night.size}px`);
  decls.push(`--skytext-font:${st.night.fontFamily}`);

  // Sky-anchored link (live-example teaser + footer links): text + underline
  // colour per mode, cross-faded in `a.mc-skylink`; underline width (0 = none)
  // and offset are shared, so the day value carries both.
  const sl = tokens.skylink.skylink;
  decls.push(`--skylink-day-color:${sl.day.color}`);
  decls.push(`--skylink-night-color:${sl.night.color}`);
  decls.push(`--skylink-day-deco:${sl.day.decoColor}`);
  decls.push(`--skylink-night-deco:${sl.night.decoColor}`);
  decls.push(`--skylink-thickness:${sl.day.thickness}px`);
  decls.push(`--skylink-offset:${sl.day.offset}px`);

  // TFT cover screen layers (bg, inset shadow strength, LCD matrix colour +
  // layer opacity, sheen highlight/shade strengths, art tint).
  const cover = tokens.cover.cover;
  decls.push(`--cover-day-bg:${toRgba(cover.day.bg, cover.day.bgOpacity)}`);
  decls.push(`--cover-night-bg:${toRgba(cover.night.bg, cover.night.bgOpacity)}`);
  decls.push(`--cover-day-inner:${cover.day.innerShadow}`);
  decls.push(`--cover-night-inner:${cover.night.innerShadow}`);
  decls.push(`--cover-day-matrix:${cover.day.matrixColor}`);
  decls.push(`--cover-night-matrix:${cover.night.matrixColor}`);
  decls.push(`--cover-day-matrix-o:${cover.day.matrixOpacity}`);
  decls.push(`--cover-night-matrix-o:${cover.night.matrixOpacity}`);
  decls.push(`--cover-day-sheen-l:${cover.day.sheenLight}`);
  decls.push(`--cover-night-sheen-l:${cover.night.sheenLight}`);
  decls.push(`--cover-day-sheen-s:${cover.day.sheenShadow}`);
  decls.push(`--cover-night-sheen-s:${cover.night.sheenShadow}`);
  decls.push(`--cover-day-tint:${toRgba(cover.day.tintColor, cover.day.tintOpacity)}`);
  decls.push(`--cover-night-tint:${toRgba(cover.night.tintColor, cover.night.tintOpacity)}`);

  // Sky-gradient base colours: the night-sky shader's sky top/horizon per mode,
  // emitted as CSS vars so the static backdrop behind the canvas renders the same
  // day↔night gradient the shader draws (the canvas fades in over a match).
  const sky = tokens.shader;
  decls.push(`--sky-top-day:${sky.skyTopDay}`);
  decls.push(`--sky-bottom-day:${sky.skyBottomDay}`);
  decls.push(`--sky-top-night:${sky.skyTop}`);
  decls.push(`--sky-bottom-night:${sky.skyBottom}`);

  // Outer-card radius root (consumed by cardGeometry's --mc-card-radius fallback).
  decls.push(`--mc-card-radius:${tokens.cardRadius}px`);

  // Structural padding/gap tokens — emitted verbatim (the keys ARE the `--mc-*`
  // CSS-var names) in px. Consumed by the cards/rows/grid/segmented components.
  for (const [key, px] of Object.entries(tokens.paddings)) {
    decls.push(`${key}:${px}px`);
  }
  // SSR night seed; the day/night seed script in BaseLayout overrides --g-dayness
  // on <html> before first paint (and on every ClientRouter swap).
  decls.push("--g-dayness:0");

  return `html:root{${decls.join(";")}}`;
}
