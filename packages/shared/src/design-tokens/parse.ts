/**
 * The design-token parser: the per-group field spec tables, the sanitizers that
 * validate one value against its spec, the legacy glass-tint migration, and
 * {@link parseDesignTokens}, which turns a pasted prototype export into a
 * guaranteed-valid {@link DesignTokens}.
 */

import {
  BACKDROP_DEFAULTS,
  CARD_RADIUS_DEFAULT,
  CARDLINK_DEFAULTS,
  COVER_DEFAULTS,
  DESIGN_TOKENS_DEFAULTS,
  GLASS_DEFAULTS,
  PADDING_DEFAULTS,
  PADDING_MAX,
  SHADER_DEFAULTS,
  SHADOW_DEFAULTS,
  SKYLINK_DEFAULTS,
  SKYTEXT_DEFAULTS,
  SKYTEXT_FONTS,
  TEXT_SURFACE_DEFAULTS,
  TYPO_FONTS,
  VFD_DEFAULTS,
} from "./defaults.js";
import {
  type BackdropFields,
  type CoverFields,
  type DayNight,
  type DesignTokens,
  type GlassControlKey,
  type GlassFields,
  type PaddingKey,
  SHADER_COLOR_KEYS,
  SHADER_NUMBER_SPECS,
  type ShaderNumberKey,
  type ShaderTokens,
  type ShadowFields,
  type SkyLinkFields,
  type SkyTextFields,
  TextCapitalization,
  type TextSurfaceFields,
  type TextSurfaceKey,
  type VfdFields,
} from "./model.js";

/** Allowed `text-transform` values (the {@link TextCapitalization} members). */
const TEXT_CAPITALIZATIONS = Object.values(TextCapitalization);

// ─── Field-spec tables (drive validation, mirror the prototype field defs) ─────

/**
 * A single tunable field's validation contract.
 *
 * - `color`: a `#rrggbb` or `rgb()`/`rgba()` string (see `sanitizeColor`).
 * - `number`: a finite number clamped into `min..max`, snapped to 0 or 1 when `bool` is set.
 * - `font`: one of {@link SKYTEXT_FONTS}.
 * - `enum`: one of `values`.
 */
type FieldSpec =
  | { kind: "color" }
  | { kind: "number"; min: number; max: number; bool?: boolean }
  | { kind: "font" }
  | { kind: "enum"; values: readonly string[] };

/** Validation contract of each {@link GlassFields} field. */
const GLASS_FIELD_SPECS: Record<keyof GlassFields, FieldSpec> = {
  tint: { kind: "color" },
  opacity: { kind: "number", min: 0, max: 1 },
  shadow: { kind: "number", min: 0, max: 1 },
};

/** Validation contract of each {@link TextSurfaceFields} field. */
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

/** Validation contract of each {@link VfdFields} field. */
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

/** Validation contract of each {@link SkyTextFields} field. */
const SKYTEXT_FIELD_SPECS: Record<keyof SkyTextFields, FieldSpec> = {
  fontFamily: { kind: "font" },
  size: { kind: "number", min: 8, max: 48 },
  color: { kind: "color" },
  opacity: { kind: "number", min: 0, max: 1 },
  strokeWidth: { kind: "number", min: 0, max: 4 },
  strokeColor: { kind: "color" },
};

/** Validation contract of each {@link CoverFields} field. */
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

/** Validation contract of each {@link ShadowFields} field. */
const SHADOW_FIELD_SPECS: Record<keyof ShadowFields, FieldSpec> = {
  offsetX: { kind: "number", min: -40, max: 40 },
  offsetY: { kind: "number", min: -40, max: 40 },
  blur: { kind: "number", min: 0, max: 120 },
  color: { kind: "color" },
};

/** Validation contract of each {@link BackdropFields} field. */
const BACKDROP_FIELD_SPECS: Record<keyof BackdropFields, FieldSpec> = {
  color: { kind: "color" },
  opacity: { kind: "number", min: 0, max: 1 },
  blur: { kind: "number", min: 0, max: 40 },
};

/** Validation contract of each {@link SkyLinkFields} field of the sky link. */
const SKYLINK_FIELD_SPECS: Record<keyof SkyLinkFields, FieldSpec> = {
  color: { kind: "color" },
  decoColor: { kind: "color" },
  thickness: { kind: "number", min: 0, max: 4 },
  offset: { kind: "number", min: 0, max: 8 },
};

/** Card-link fields share the sky-link validation contract. */
const CARDLINK_FIELD_SPECS = SKYLINK_FIELD_SPECS;

// ─── Validation primitives ─────────────────────────────────────────────────────

/** Matches a `#rrggbb` hex color, case-insensitively. */
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
/** Matches `rgb()` or `rgba()` with integer channels and an optional alpha in 0..1. */
const RGB_COLOR = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\)$/i;

/**
 * Returns a CSS-injection-safe color string or `null`. Accepts `#rrggbb`
 * (lowercased) and `rgb()`/`rgba()` with integer channels. Everything else is
 * rejected, so persisted, admin-editable values can never carry arbitrary CSS.
 *
 * @param raw The untrusted value.
 * @returns The lowercased hex color, the `rgb()` string with collapsed
 *   whitespace, or `null` when `raw` is neither.
 */
function sanitizeColor(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (HEX_COLOR.test(v)) return v.toLowerCase();
  if (RGB_COLOR.test(v)) return v.replace(/\s+/g, " ");
  return null;
}

/**
 * Clamps a finite number into `[min, max]`, or snaps it to 0 or 1 for boolean params.
 *
 * @param raw The untrusted value.
 * @param min The lower bound.
 * @param max The upper bound.
 * @param bool When set, values of 0.5 and above become 1 and the rest become 0.
 * @returns The clamped or snapped number, or `null` when `raw` is not a finite number.
 */
function sanitizeNumber(raw: unknown, min: number, max: number, bool?: boolean): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  if (bool) return raw >= 0.5 ? 1 : 0;
  return Math.min(max, Math.max(min, raw));
}

/**
 * Resolves one field against its spec, falling back to `fallback` on any miss.
 *
 * @param raw The untrusted field value.
 * @param fallback The canonical default returned when `raw` is rejected.
 * @param spec The field's validation contract.
 * @param path The dotted field path used in error messages.
 * @param errors Receives one message per rejected value that was present.
 * @returns The sanitized value or `fallback`.
 */
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

/**
 * Resolves an object of fields against a spec table. Unknown keys are dropped.
 *
 * @typeParam T The field shape.
 * @param raw The untrusted object; anything that is not an object counts as empty.
 * @param fallback The canonical defaults per field.
 * @param specs The validation contract per field; its keys decide the output keys.
 * @param path The dotted group path used in error messages.
 * @param errors Receives one message per rejected value that was present.
 * @returns A complete field object.
 */
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

/**
 * Resolves a `{ day, night }` group against a single field-spec table.
 *
 * @typeParam T The per-mode field shape.
 * @param raw The untrusted group; anything that is not an object counts as empty.
 * @param fallback The canonical day and night defaults.
 * @param specs The validation contract per field.
 * @param path The dotted group path used in error messages.
 * @param errors Receives one message per rejected value that was present.
 * @returns A complete day and night pair.
 */
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

/**
 * Deep-clones the canonical defaults (pure data, safe via JSON round-trip).
 *
 * @returns A fresh copy of {@link DESIGN_TOKENS_DEFAULTS}.
 */
function cloneDefaults(): DesignTokens {
  return JSON.parse(JSON.stringify(DESIGN_TOKENS_DEFAULTS)) as DesignTokens;
}

/**
 * Maps a legacy glass gradient onto the flat tint. The material has a single
 * flat `tint`, while a blob saved (or a prototype export pasted) from the older
 * vertical-gradient material carries `tintTop` and no `tint`. Mapping `tintTop`
 * to `tint` keeps the admin's tuned color instead of snapping back to the
 * canonical default. The unknown `tintBottom` (and the frost fields) are dropped
 * by {@link sanitizeFields}.
 *
 * @param raw One glass control's raw `{ day, night }` value from the token blob.
 * @returns The same shape with `tint` seeded from `tintTop` where it was absent.
 */
function migrateLegacyGlassTint(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const migrateMode = (mode: unknown): unknown => {
    if (!mode || typeof mode !== "object") return mode;
    const m = mode as Record<string, unknown>;
    if (m.tint === undefined && m.tintTop !== undefined) return { ...m, tint: m.tintTop };
    return m;
  };
  const src = raw as { day?: unknown; night?: unknown };
  return { ...src, day: migrateMode(src.day), night: migrateMode(src.night) };
}

// ─── Public parser ─────────────────────────────────────────────────────────────

/**
 * Validates and normalizes a raw design-token blob (the prototype export, as a
 * JSON string or already-parsed object) into a guaranteed-valid {@link DesignTokens}.
 *
 * The result is **always** a complete token set: every invalid, out-of-range, or
 * missing value is replaced by its canonical default, every unknown key is
 * dropped, and every color is constrained to `#rrggbb` or `rgb()`, so the output
 * can be emitted into a `<style>` block without CSS-injection risk. Use `errors`
 * (a human-readable list of what was rejected) for admin-facing validation
 * feedback; `tokens` is safe to apply unconditionally.
 *
 * @param raw The exported token blob, as a JSON string or a parsed object. The
 *   shader parameters are read from the flat top level, the structured groups
 *   from `cardRadius`/`glass`/`text`/`vfd`/`footer`/`cover`/`backdrop`.
 * @returns `{ tokens, errors }`: the normalized token set and the list of
 *   rejected or clamped values (empty when the input was fully valid).
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
  // normalized model nests them under `shader`. Read from `obj.shader` when
  // present so re-parsing an already-normalized blob stays idempotent
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

  // cardRadius is a flat top-level number.
  const cardRadius = sanitizeNumber(obj.cardRadius, 0, 40) ?? CARD_RADIUS_DEFAULT;
  if (obj.cardRadius !== undefined && sanitizeNumber(obj.cardRadius, 0, 40) === null) {
    errors.push("cardRadius: invalid number, using default");
  }

  // Paddings are a flat { "--mc-*": px } map. Each known key is clamped to
  // 0..PADDING_MAX and unknown keys are dropped. The keys ARE the emitted CSS-var names.
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
      migrateLegacyGlassTint(rawGlass[control]),
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

  // Cover is mode-independent (one value bag). A blob in the legacy
  // `{ day, night }` shape has its `day` half read, so a persisted token setting
  // keeps working; otherwise the flat single shape is read.
  const rawCover = (obj.cover as { cover?: unknown } | undefined)?.cover;
  const coverSource =
    rawCover && typeof rawCover === "object" && "day" in rawCover ? (rawCover as { day?: unknown }).day : rawCover;
  const cover = sanitizeFields(
    coverSource,
    COVER_DEFAULTS as unknown as Record<string, unknown>,
    COVER_FIELD_SPECS,
    "cover.cover",
    errors,
  ) as unknown as CoverFields;

  const shadow = sanitizeFields(
    (obj.shadow as { shadow?: unknown } | undefined)?.shadow,
    SHADOW_DEFAULTS as unknown as Record<string, unknown>,
    SHADOW_FIELD_SPECS,
    "shadow.shadow",
    errors,
  ) as unknown as ShadowFields;

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
      shadow: { shadow },
      backdrop: { backdrop },
      skylink: { skylink },
      cardlink: { cardlink },
    },
    errors,
  };
}
