/**
 * @file The website's glass material, resolved for one email.
 *
 * The site paints every card, well and button from the design tokens an
 * operator edits, blending the day and the night value of each through
 * `--g-dayness`. An email cannot do that: it has no custom properties in most
 * clients, no `color-mix`, and no idea what time it is where it is read. What
 * it has is two colour schemes, so this resolves the same tokens twice, once
 * per scheme, and hands the renderer plain values.
 *
 * Light takes the day value and dark the night value, which is what the site
 * shows at full dayness and at none. The geometry comes from
 * `@musiccloud/shared`'s card geometry, the same numbers the frontend's
 * `cardGeometry` builds its CSS from, so a card in an email is the shape of
 * the card on the share page.
 */

import {
  type DesignTokens,
  GlassControl,
  raisedControlRadiusPx,
  recessedSurfaceRadiusPx,
  TextEmphasis,
  TextSurface,
} from "@musiccloud/shared";

/** The two schemes an email is rendered for. A client picks one; the site blends between them. */
export const EmailColorScheme = {
  Light: "light",
  Dark: "dark",
} as const;

/** A scheme value from {@link EmailColorScheme}. */
export type EmailColorSchemeValue = (typeof EmailColorScheme)[keyof typeof EmailColorScheme];

/** The card that holds the message, matching the share page's outer card. */
export interface EmailCardSurface {
  /** Fill, tint and opacity already folded into one `rgba()`. */
  fill: string;
  /** Outer radius in pixels, straight from the `cardRadius` token. */
  radiusPx: number;
  /** Padding between the card's edge and the wells inside it. */
  paddingPx: number;
  /** Complete `box-shadow` value, from the shadow tokens and this surface's strength. */
  shadow: string;
}

/** A well inside the card. Every block of copy sits in one, as on the site. */
export interface EmailWellSurface {
  fill: string;
  radiusPx: number;
}

/** A raised control inside a well. */
export interface EmailButtonSurface {
  fill: string;
  radiusPx: number;
  /** Label colour, from the button text surface's bright level. */
  color: string;
  fontFamily: string;
  fontSizePx: number;
  fontWeight: number;
  /** Horizontal padding, matching the site's `px-5` on a glass button. */
  paddingXPx: number;
  /** Vertical padding, chosen so the control reaches the site's 41px height at its font size. */
  paddingYPx: number;
}

/** Type for one text surface resolved for an email. */
export interface EmailTextSurface {
  bright: string;
  normal: string;
  dimmed: string;
  fontFamily: string;
  fontSizePx: number;
  fontWeight: number;
  textTransform: string;
}

/**
 * The line that sits on the sky rather than on a card.
 *
 * On the share page that is the claim under the wordmark, above the card, and
 * an email puts its footer line in the same place for the same reason: it
 * belongs to the product, not to the message.
 */
export interface EmailSkyTextSurface {
  color: string;
  fontFamily: string;
  fontSizePx: number;
}

/** Everything one email render needs from the design tokens. */
export interface EmailSurfaces {
  card: EmailCardSurface;
  well: EmailWellSurface;
  button: EmailButtonSurface;
  /** Copy inside a well, which is where all of an email's text sits. */
  text: EmailTextSurface;
  /** Headings, which the site sets from its own title surface. */
  title: EmailTextSurface;
  /** The claim under the wordmark, above the card. */
  skyText: EmailSkyTextSurface;
}

/**
 * How much larger copy is set in an email than on the site.
 *
 * The site's sizes are read on a screen the reader chose to look at, at a
 * distance they chose. An email is read in a pane beside other things, often
 * on a phone, and the same size reads small there. The control labels keep
 * their own size, because a button is a target rather than something to read.
 */
const EMAIL_COPY_SCALE = 1.125;

/** Horizontal padding of a glass button on the site (`px-5`). */
const BUTTON_PADDING_X_PX = 20;

/** Vertical padding that brings a 14px label to the site's 41px control height. */
const BUTTON_PADDING_Y_PX = 11;

/**
 * Folds a token's `#rrggbb` tint and its opacity into one `rgba()`, the way
 * `designTokensToCss` does for the browser.
 *
 * @param color - Tint as `#rrggbb`, or any value that is already functional.
 * @param alpha - Opacity from 0 to 1.
 * @returns An `rgba()` string, or the input unchanged when it carries no hex.
 */
function toRgba(color: string, alpha: number): string {
  if (!color.startsWith("#") || color.length !== 7) return color;
  const value = Number.parseInt(color.slice(1), 16);
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
}

/**
 * The bare `r,g,b` triplet of a hex colour, so a caller can compose it with an
 * alpha of its own.
 *
 * @param color - Colour as `#rrggbb`.
 * @returns The triplet, or the input unchanged when it carries no hex.
 */
function rgbTriplet(color: string): string {
  if (!color.startsWith("#") || color.length !== 7) return color;
  const value = Number.parseInt(color.slice(1), 16);
  return `${(value >> 16) & 255},${(value >> 8) & 255},${value & 255}`;
}

/**
 * Makes a font stack safe to write into a double-quoted `style` attribute.
 *
 * A token's family is CSS as an author would write it, so a name with a space
 * arrives quoted: `"Barlow", sans-serif`. Inline styles in an email are written
 * into `style="…"`, and that first double quote ends the attribute, taking
 * every declaration after it with it. Single quotes are equally valid CSS and
 * survive.
 *
 * @param fontFamily - The family as the token carries it.
 * @returns The same stack, quoted so it cannot close the attribute.
 */
function inlineSafeFontFamily(fontFamily: string): string {
  return fontFamily.replaceAll('"', "'");
}

/**
 * Resolves one text surface for a scheme.
 *
 * @param tokens - The validated token set.
 * @param surface - Which text surface to read.
 * @param scheme - Which colour scheme the email is being rendered for.
 * @returns The colours, the font and the transform for that surface.
 */
function resolveText(
  tokens: DesignTokens,
  surface: keyof DesignTokens["text"],
  scheme: EmailColorSchemeValue,
  sizeScale = 1,
): EmailTextSurface {
  const fields = tokens.text[surface][scheme === EmailColorScheme.Light ? "day" : "night"];
  return {
    [TextEmphasis.Bright]: toRgba(fields.brightColor, fields.brightOpacity),
    [TextEmphasis.Normal]: toRgba(fields.normalColor, fields.normalOpacity),
    [TextEmphasis.Dimmed]: toRgba(fields.dimmedColor, fields.dimmedOpacity),
    fontFamily: inlineSafeFontFamily(fields.fontFamily),
    fontSizePx: Math.round(fields.fontSize * sizeScale),
    fontWeight: fields.fontWeight,
    textTransform: fields.capitalization,
  };
}

/**
 * Resolves the whole material for one email.
 *
 * @param tokens - The validated token set, as `parseDesignTokens` returns it.
 * @param scheme - Light takes every day value, dark every night value.
 * @returns The surfaces the email renderer paints with.
 */
export function resolveEmailSurfaces(tokens: DesignTokens, scheme: EmailColorSchemeValue): EmailSurfaces {
  const mode = scheme === EmailColorScheme.Light ? "day" : "night";
  const card = tokens.glass[GlassControl.Card][mode];
  const well = tokens.glass[GlassControl.Recessed][mode];
  const button = tokens.glass[GlassControl.Button][mode];
  const shadow = tokens.shadow.shadow;
  const buttonText = resolveText(tokens, TextSurface.Button, scheme);

  return {
    card: {
      fill: toRgba(card.tint, card.opacity),
      radiusPx: tokens.cardRadius,
      paddingPx: tokens.paddings["--mc-pad-card"],
      shadow: `${shadow.offsetX}px ${shadow.offsetY}px ${shadow.blur}px rgba(${rgbTriplet(shadow.color)},${card.shadow})`,
    },
    well: {
      fill: toRgba(well.tint, well.opacity),
      radiusPx: recessedSurfaceRadiusPx(tokens.cardRadius),
    },
    button: {
      fill: toRgba(button.tint, button.opacity),
      radiusPx: raisedControlRadiusPx(tokens.cardRadius),
      color: buttonText.bright,
      fontFamily: buttonText.fontFamily,
      fontSizePx: buttonText.fontSizePx,
      fontWeight: buttonText.fontWeight,
      paddingXPx: BUTTON_PADDING_X_PX,
      paddingYPx: BUTTON_PADDING_Y_PX,
    },
    skyText: {
      color: toRgba(tokens.footer.skytext[mode].color, tokens.footer.skytext[mode].opacity),
      fontFamily: inlineSafeFontFamily(tokens.footer.skytext[mode].fontFamily),
      fontSizePx: tokens.footer.skytext[mode].size,
    },
    text: resolveText(tokens, TextSurface.Recessed, scheme, EMAIL_COPY_SCALE),
    title: resolveText(tokens, TextSurface.EmbossedTitle, scheme, EMAIL_COPY_SCALE),
  };
}
