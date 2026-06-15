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

import type { DesignTokens, GlassControlKey, GlassFields, TextLevelKey } from "@musiccloud/shared";

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

  for (const level of Object.keys(tokens.text) as TextLevelKey[]) {
    const dn = tokens.text[level];
    decls.push(`--text-${level}-day:${toRgba(dn.day.color, dn.day.opacity)}`);
    decls.push(`--text-${level}-night:${toRgba(dn.night.color, dn.night.opacity)}`);
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

  // Outer-card radius root (consumed by cardGeometry's --mc-card-radius fallback).
  decls.push(`--mc-card-radius:${tokens.cardRadius}px`);
  // SSR night seed against a flash of an uninitialised cross-fade; the runtime
  // dayness channel overrides this via an inline style on <html> once booted.
  decls.push("--g-dayness:0");

  return `html:root{${decls.join(";")}}`;
}
