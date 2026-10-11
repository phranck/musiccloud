import { type DesignTokens, type EmailBlock, EmailBlockType } from "@musiccloud/shared";
import { Marked } from "marked";

import type { EmailBrandingDto, EmailTemplateBrandingOverrides } from "../db/admin-repository.js";
import { escapeHtml } from "../lib/html.js";
import {
  EmailColorScheme,
  type EmailColorSchemeValue,
  type EmailSurfaces,
  resolveEmailSurfaces,
} from "./email-surfaces.js";

/**
 * A dedicated `Marked` instance, separate from the context-specific editorial
 * renderers. Email rendering is synchronous, while editorial extensions may
 * be asynchronous. Keeping this instance local prevents either registry from
 * changing the other's parser options or output contract.
 */
const emailMarked = new Marked({ breaks: true, gfm: true });

const VAR_REGEX = /\{\{(\w+)\}\}/g;

/**
 * Width of the message column, which is the width every card takes.
 *
 * 560px is the width an email is built to: wide enough for a readable line and
 * narrow enough to survive the reading pane of a desktop client without being
 * scaled down.
 */
const CARD_WIDTH_PX = 560;

/**
 * Width of the wordmark above the card, as a share of the column.
 *
 * The share page sets its wordmark to a little over half the card it stands
 * above, and this keeps that relation whatever the column does.
 */
const MASTHEAD_WIDTH_RATIO = 0.62;

/** The wordmark's width in pixels, for the `width` attribute a mail client needs before the CSS loads. */
const MASTHEAD_WIDTH_PX = Math.round(CARD_WIDTH_PX * MASTHEAD_WIDTH_RATIO);

/**
 * Gap between the wells inside the card, from the list-gap token the site uses
 * between stacked rows.
 */
const WELL_GAP_TOKEN = "--mc-gap-list";

/** Vertical padding inside a well, from the token the site's service rows use. */
const WELL_PADDING_Y_TOKEN = "--mc-pad-svc-y";

/** Horizontal padding inside a well, from the same pair. */
const WELL_PADDING_X_TOKEN = "--mc-pad-svc-x";

/**
 * Builds the rules that repaint every surface for a dark client.
 *
 * The document is written with the light scheme inline, because that is what a
 * client shows when it has no opinion. A client that does have one applies
 * these, and every one of them has to win against an inline style, which is
 * what `!important` is doing here rather than any question of ordering.
 *
 * @param dark - The material resolved for the dark scheme.
 * @returns The rule text, without the surrounding `@media` query.
 */
function buildDarkRules(dark: EmailSurfaces): string {
  return `
  table.em-card               { background: ${dark.card.fill} !important; box-shadow: ${dark.card.shadow} !important; }
  td.em-well                  { background: ${dark.well.fill} !important; }
  td.em-button-face           { background: ${dark.button.fill} !important; }
  a.em-button                 { color: ${dark.button.color} !important; }
  h1, h2, h3                  { color: ${dark.title.bright} !important; }
  p                           { color: ${dark.text.normal} !important; }
  a                           { color: ${dark.text.bright} !important; }
  a.em-button                 { color: ${dark.button.color} !important; }
  strong                      { color: ${dark.text.bright} !important; }
  hr                          { border-top-color: ${dark.text.dimmed} !important; }
  .em-footer-text,
  .em-footer-text p           { color: ${dark.text.dimmed} !important; }
`;
}

/**
 * Replaces `{{name}}` placeholders with `variables[name]`. A placeholder
 * whose name isn't a key in `variables` is left untouched (not blanked) —
 * this is what lets `renderEmailPreview`'s always-empty `{}` variables map
 * show `{{username}}` etc. literally rather than silently erasing them, and
 * what makes an undeclared-but-referenced variable on the send path fail
 * loudly (visible raw placeholder) instead of silently vanishing.
 */
function interpolate(text: string, variables: Record<string, string>): string {
  return text.replace(new RegExp(VAR_REGEX.source, "g"), (match, name) =>
    name in variables ? escapeHtml(variables[name]) : match,
  );
}

/**
 * Writes the resolved material onto the markup `marked` produced.
 *
 * Every value here comes from the design tokens, so a heading in an email is
 * the heading the site sets, at the size and weight an operator chose. Headings
 * take the title surface and body copy the surface of the well it sits in,
 * which is what the site does with the same two surfaces.
 *
 * @param html - Markup from the markdown parser.
 * @param surfaces - The material for the scheme being written inline.
 * @returns The same markup with inline styles.
 */
function applyInlineStyles(html: string, surfaces: EmailSurfaces): string {
  const { text, title } = surfaces;
  const heading = (level: 1 | 2, sizePx: number, marginPx: number) =>
    `<h${level} style="font-family:${title.fontFamily};font-size:${sizePx}px;font-weight:${title.fontWeight};color:${title.bright};margin:0 0 ${marginPx}px 0;line-height:1.3;text-transform:${title.textTransform};">`;
  return html
    .replace(/<h1>/g, heading(1, Math.round(title.fontSizePx * 1.375), 16))
    .replace(/<h2>/g, heading(2, Math.round(title.fontSizePx * 1.125), 12))
    .replace(
      /<p>/g,
      `<p style="font-family:${text.fontFamily};font-size:${text.fontSizePx}px;font-weight:${text.fontWeight};line-height:1.6;color:${text.normal};margin:0 0 12px 0;">`,
    )
    .replace(/<a /g, `<a style="color:${text.bright};font-weight:600;" `)
    .replace(/<strong>/g, `<strong style="color:${text.bright};">`);
}

/**
 * Parses markdown to HTML using the module-local {@link emailMarked}
 * instance. `{ async: false }` selects the overload that returns a plain
 * `string`.
 */
function parseMarkdown(text: string, surfaces: EmailSurfaces): string {
  const html = emailMarked.parse(text, { async: false });
  return applyInlineStyles(html, surfaces);
}

/**
 * Builds the `<tr>` markup for a button block.
 *
 * A button on the site is never loose on a card: it sits in a well, inset by
 * the control inset, so the well reads as the frame the control is pressed
 * into. This is that same construction in table markup, and it is why the
 * button carries three nested elements rather than one.
 *
 * The row stands at the right edge, which is where a button belonging to a
 * block belongs.
 *
 * The `em-button` and `em-well` classes are what a dark client repaints; the
 * generic link rule would otherwise take the label and leave it barely legible
 * on the button's own fill.
 *
 * @param label - Visible button text, escaped here.
 * @param url - Already-interpolated target URL.
 * @param surfaces - The material for the scheme being written inline.
 * @param insetPx - Distance between the well and the control inside it.
 * @returns A single `<tr>` row.
 */
function renderButton(label: string, url: string, surfaces: EmailSurfaces, insetPx: number): string {
  const { button, well } = surfaces;
  const face = `<td class="em-button-face" style="border-radius:${button.radiusPx}px;background:${button.fill};"><a class="em-button" href="${url}" style="display:inline-block;padding:${button.paddingYPx}px ${button.paddingXPx}px;font-family:${button.fontFamily};font-size:${button.fontSizePx}px;font-weight:${button.fontWeight};color:${button.color};text-decoration:none;">${escapeHtml(label)}</a></td>`;
  const inWell = `<td class="em-well" style="border-radius:${well.radiusPx}px;background:${well.fill};padding:${insetPx}px;"><table cellpadding="0" cellspacing="0" border="0"><tr>${face}</tr></table></td>`;
  return `<tr><td align="right"><table cellpadding="0" cellspacing="0" border="0" align="right"><tr>${inWell}</tr></table></td></tr>`;
}

/**
 * Builds the streaming asset URL for an `email_assets` row.
 *
 * `baseUrl: null` (the dashboard-preview path) builds a relative path
 * instead of an absolute URL. The preview iframe's `srcDoc` document has no
 * origin of its own, so a relative `/api/...` URL resolves against the
 * dashboard's own origin — which the dashboard's dev/prod setup already
 * proxies to the backend (the same convention `lib/api.ts`'s `resolvePath`
 * uses for every other dashboard API call). An absolute URL built from
 * `PUBLIC_URL` would be wrong here: `PUBLIC_URL` is the public *frontend*
 * domain, not necessarily where the backend itself is reachable (in local
 * dev they're different ports entirely, producing a 404 on the wrong
 * origin). The live-send path (`baseUrl` a real string) still needs an
 * absolute URL — a recipient's mail client has no dashboard proxy to
 * resolve a relative path against.
 *
 * @param assetId - the `email_assets.id` to point at.
 * @param baseUrl - the backend's own public base URL for the send path
 *   (e.g. `PUBLIC_URL`), or `null` to build a relative URL for the preview path.
 * @returns a URL (absolute or relative) to `GET /api/admin/email-assets/:id`.
 */
function assetUrl(assetId: string, baseUrl: string | null): string {
  const path = `/api/admin/email-assets/${assetId}`;
  return baseUrl ? `${baseUrl.replace(/\/+$/, "")}${path}` : path;
}

/**
 * Fully-resolved branding for one render: the winning value per field after a
 * template's override (if any) is merged over the global default. Mirrors
 * {@link EmailBrandingDto} exactly — gradient colours are always present
 * (never null), asset ids may be null (no image).
 */
export interface ResolvedBranding {
  headerAssetId: string | null;
  footerText: string | null;
  lightBackgroundAssetId: string | null;
  darkBackgroundAssetId: string | null;
  lightGradientTop: string;
  lightGradientBottom: string;
  darkGradientTop: string;
  darkGradientBottom: string;
}

/**
 * Merges a template's branding overrides over the global branding default,
 * field by field: a non-null override wins, otherwise the global value is
 * used. Called on BOTH the send and preview paths (via {@link renderBlocks} /
 * {@link renderEmailPreview}) so the merge can never drift between what is
 * sent and what is previewed.
 *
 * @param overrides - the template's per-field overrides; an absent or `null`
 *   field falls back to `global` (present-keys-only, so a `Partial` from the
 *   preview endpoint's live-edit body is accepted as-is).
 * @param global - the global branding singleton (all gradient fields non-null).
 * @returns the resolved branding used for one render.
 */
export function resolveBranding(
  overrides: Partial<EmailTemplateBrandingOverrides>,
  global: EmailBrandingDto,
): ResolvedBranding {
  return {
    headerAssetId: overrides.headerAssetId ?? global.headerAssetId,
    footerText: overrides.footerText ?? global.footerText,
    lightBackgroundAssetId: overrides.lightBackgroundAssetId ?? global.lightBackgroundAssetId,
    darkBackgroundAssetId: overrides.darkBackgroundAssetId ?? global.darkBackgroundAssetId,
    lightGradientTop: overrides.lightGradientTop ?? global.lightGradientTop,
    lightGradientBottom: overrides.lightGradientBottom ?? global.lightGradientBottom,
    darkGradientTop: overrides.darkGradientTop ?? global.darkGradientTop,
    darkGradientBottom: overrides.darkGradientBottom ?? global.darkGradientBottom,
  };
}

/**
 * Builds the shared background declarations for one colour scheme — reused for
 * both the outer page-background `<td>` (which also needs its own padding) and
 * `<body>` (no padding). The gradient is ALWAYS present; `imageUrl`, when set,
 * is layered ON TOP of the gradient (CSS renders the first comma-separated
 * `background-image` value uppermost). `background-color` is the solid
 * last-resort fallback for clients that support neither gradients nor images.
 *
 * `background-repeat:no-repeat` is explicit and mandatory: the background image
 * must NEVER tile. Some mail clients honour `background-image` but ignore
 * `background-size`, which would otherwise fall back to the CSS default
 * (`repeat`) and tile the sky across the viewport.
 *
 * @param top - gradient top colour (hex).
 * @param bottom - gradient bottom colour (hex); doubles as the solid fallback.
 * @param imageUrl - optional background image URL layered over the gradient.
 * @returns the background declarations (no padding), each terminated by `;`.
 */
function buildBackgroundCss(top: string, bottom: string, imageUrl: string | null): string {
  const imageLayer = imageUrl ? `url(${imageUrl}), ` : "";
  return `background-color:${bottom};background-image:${imageLayer}linear-gradient(180deg, ${top}, ${bottom});background-repeat:no-repeat;background-size:cover;background-position:center;`;
}

/**
 * Resolved page-background styling for one colour scheme, split across the
 * two elements that both need to carry it: `<body>` and the outer `<td>`.
 *
 * A shrink-wrapped `<table>`/`<td>` only paints its OWN content height — if
 * only the `<td>` carried the background, a recipient whose viewport is
 * taller than the actual email would see the sky end abruptly and the plain
 * `<body>` colour take over below it. Painting the same background on
 * `<body>` too (which browsers and virtually all modern mail-client webviews
 * size to the full viewport) makes the sky fill the whole visible area
 * regardless of how tall the email content is. The `<td>` background is kept
 * as well because Outlook's Word rendering engine supports table-cell
 * backgrounds far more reliably than `<body>` backgrounds.
 *
 * The height chain that carries this is `html`, `body`, the outer table and
 * its cell, each at `height:100%`. Without it the sky is sized to the height
 * of the message rather than to the height of the pane, and a short message in
 * a tall window ends in a band of flat colour where the image stops. `100%`
 * behaves as a minimum on a table, so a message taller than the pane still
 * gets a sky the whole way down.
 *
 * There is deliberately NO legacy `background="..."` HTML attribute: the Word
 * engine (old Outlook desktop) ignores CSS `background-size`/`background-repeat`
 * and TILES that attribute's image with no non-VML way to stop it. Rather than
 * ever tile the sky, those clients fall back to the solid `background-color`
 * (the gradient's bottom colour) — no image, but never a tiled one.
 */
interface PageBackground {
  /** Inline style for `<body>` — background only, no padding. */
  bodyStyle: string;
  /** Inline style for the outer `<td class="em-page-bg">` — background plus the cell's own padding. */
  cellStyle: string;
}

/**
 * Builds {@link PageBackground} for one colour scheme.
 *
 * @param top - gradient top colour (hex).
 * @param bottom - gradient bottom colour (hex).
 * @param imageUrl - optional background image URL layered over the gradient.
 * @returns the body and cell inline styles for this scheme.
 */
function buildPageBackground(top: string, bottom: string, imageUrl: string | null): PageBackground {
  const backgroundCss = buildBackgroundCss(top, bottom, imageUrl);
  return {
    bodyStyle: backgroundCss,
    // 80px top/bottom (double the 16px side inset) gives the card generous
    // breathing room above and below within the page background.
    cellStyle: `padding:80px 16px;${backgroundCss}`,
  };
}

/**
 * Builds the `@media (prefers-color-scheme: dark)` block that overrides the
 * page background — on BOTH `<body>` and the page-bg `<td>` — for dark-mode
 * mail clients on the send path, mirroring the existing {@link DARK_RULES}
 * pattern (`!important` to beat the inline style).
 *
 * @param top - dark gradient top colour (hex).
 * @param bottom - dark gradient bottom colour (hex).
 * @param imageUrl - optional dark background image URL layered over the gradient.
 * @returns the CSS `@media` block appended into the document's `<style>`.
 */
function buildDarkPageBackgroundCss(top: string, bottom: string, imageUrl: string | null): string {
  const imageLayer = imageUrl ? `url(${imageUrl}), ` : "";
  const rule = `background-color:${bottom} !important; background-image:${imageLayer}linear-gradient(180deg, ${top}, ${bottom}) !important; background-repeat:no-repeat !important;`;
  return `@media (prefers-color-scheme: dark) { body { ${rule} } .em-page-bg { ${rule} } }`;
}

/**
 * Builds the ordered `<tr>` rows for a template's body blocks wrapped by the
 * resolved branding (header asset, footer text, footer asset), with `{{var}}`
 * interpolation applied from `variables`. This is the single place the
 * block-rendering switch statement lives, so what gets sent and what gets
 * previewed cannot drift apart.
 *
 * A template is one list of blocks, and it comes back as several cards: a
 * button ends the card it stands in, because a note that follows an action is
 * about that action rather than part of it. The share page separates the same
 * way, with its secondary action standing below the card rather than in it.
 *
 * @param blocks - The template's ordered body blocks.
 * @param variables - `{{var}}` substitution values available to text and button content.
 * @param baseUrl - The backend's own public base URL for asset URLs, or `null`
 *   to build relative ones (see {@link assetUrl}).
 * @param surfaces - The material for the scheme being written inline.
 * @param tokens - The token set, for the spacing the site uses.
 * @returns One list of `<tr>` rows per card, in order.
 */
function buildCards(
  blocks: EmailBlock[],
  variables: Record<string, string>,
  baseUrl: string | null,
  surfaces: EmailSurfaces,
  tokens: DesignTokens,
): string[][] {
  const gapPx = tokens.paddings[WELL_GAP_TOKEN];
  const controlInsetPx = tokens.paddings["--mc-pad-recessed"];
  const wellPaddingYPx = tokens.paddings[WELL_PADDING_Y_TOKEN];
  // Copy inside a well clears that well's own curve, per the card-geometry
  // rule that a text inset is half the radius it sits against.
  const wellPaddingXPx = tokens.paddings[WELL_PADDING_X_TOKEN] + Math.round(surfaces.well.radiusPx / 2);
  const wellStyle = `border-radius:${surfaces.well.radiusPx}px;background:${surfaces.well.fill};padding:${wellPaddingYPx}px ${wellPaddingXPx}px;`;

  /** Wraps one row's content in a well. */
  const well = (content: string, extraStyle = "") =>
    `<tr><td class="em-well" style="${wellStyle}${extraStyle}">${content}</td></tr>`;

  const cards: string[][] = [[]];
  /** The card being filled. A button closes it, so what follows starts a new one. */
  const current = () => cards[cards.length - 1] as string[];

  for (const block of blocks) {
    if (current().length > 0) {
      // A button stands away from what it acts on, by the same distance the
      // card holds from its own edge. Everything else stacks at the list gap,
      // which is what the site puts between rows inside one card.
      const spacingPx = block.type === EmailBlockType.Button ? surfaces.card.paddingPx : gapPx;
      current().push(`<tr><td style="height:${spacingPx}px;line-height:0;font-size:0;">&nbsp;</td></tr>`);
    }
    switch (block.type) {
      case EmailBlockType.Text:
        current().push(well(parseMarkdown(interpolate(block.markdown, variables), surfaces)));
        break;
      case EmailBlockType.Button:
        current().push(renderButton(block.label, interpolate(block.url, variables), surfaces, controlInsetPx));
        // Whatever comes after the action is a note about it rather than part
        // of it, so it gets a card of its own, the way the share page puts its
        // secondary action below the card instead of inside it.
        cards.push([]);
        break;
      case EmailBlockType.Image:
        current().push(
          well(
            `<img src="${assetUrl(block.assetId, baseUrl)}" width="480" alt="${escapeHtml(block.altText)}" style="display:block;max-width:100%;border-radius:${Math.max(0, surfaces.well.radiusPx - controlInsetPx)}px;">`,
            "font-size:0;line-height:0;",
          ),
        );
        break;
      case EmailBlockType.Divider:
        // A divider separates, and so does a card, so it starts a new one
        // rather than drawing a line nothing else in the product draws.
        if (current().length > 0) cards.push([]);
        break;
      case EmailBlockType.Spacer:
        current().push(
          `<tr><td style="height:${Math.max(0, Math.round(block.heightPx))}px;line-height:0;font-size:0;">&nbsp;</td></tr>`,
        );
        break;
    }
  }
  return cards.filter((rows) => rows.length > 0);
}

/**
 * Assembles the complete HTML email document: the `<style>` block (shared
 * base rules + the caller's scheme-specific `css`), a full-viewport `<body>`
 * background, and the outer page-background `<td>` wrapping the 560px
 * content card.
 *
 * The card is nested in an extra, unclipped `<td>` that carries the
 * `box-shadow`, because `box-shadow` and `overflow:hidden` never combine on
 * the same element: the shadow paints outside the border box and the
 * element's own overflow rule clips it away.
 *
 * The card is translucent, so the sky behind it reads through exactly as it
 * does behind the share page's card. Its own fill, its radius, its padding and
 * its shadow all come from the design tokens, which is where the page takes
 * them from too.
 *
 * @param rows - the body block rows from {@link buildBlockRows}.
 * @param css - scheme-specific `<style>` content (the dark `@media` block on the
 *   send path, or the forced light/dark rules on the preview path).
 * @param background - this render's {@link PageBackground} (body + cell inline styles).
 * @param surfaces - the material for the scheme written inline.
 * @returns the complete HTML email document.
 */
function buildEmailHtml(
  cards: string[][],
  css: string,
  background: PageBackground,
  surfaces: EmailSurfaces,
  masthead: string,
  cardGapPx: number,
): string {
  const cardMarkup = cards
    .map(
      (rows) => `<tr><td style="border-radius:${surfaces.card.radiusPx}px;box-shadow:${surfaces.card.shadow};">
          <table class="em-card" width="${CARD_WIDTH_PX}" cellpadding="0" cellspacing="0" border="0" style="max-width:${CARD_WIDTH_PX}px;background:${surfaces.card.fill};border-radius:${surfaces.card.radiusPx}px;">
            <tr><td style="padding:${surfaces.card.paddingPx}px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                ${rows.join("\n                ")}
              </table>
            </td></tr>
          </table>
        </td></tr>`,
    )
    .join(`\n        <tr><td style="height:${cardGapPx}px;line-height:0;font-size:0;">&nbsp;</td></tr>\n        `);
  return `<!DOCTYPE html>
<html lang="en" style="height:100%;">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <style>
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    /* !important: applyInlineStyles already writes an inline margin (meant for
       body-text paragraph spacing) directly onto this <p>; a plain class rule
       here loses to that inline style on specificity alone. */
    .em-footer-text p { margin: 0 !important; }
    ${css}
  </style>
</head>
<body style="margin:0;padding:0;height:100%;${background.bodyStyle}font-family:${surfaces.text.fontFamily};">
  <table width="100%" height="100%" cellpadding="0" cellspacing="0" border="0" style="height:100%;">
    <tr><td align="center" valign="top" class="em-page-bg" style="height:100%;${background.cellStyle}">
      <table cellpadding="0" cellspacing="0" border="0" style="width:${CARD_WIDTH_PX}px;max-width:${CARD_WIDTH_PX}px;">
        ${masthead}
        ${cardMarkup}
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Builds the wordmark and the claim that stand above the card.
 *
 * On the share page the wordmark sits on the sky with the claim under it, and
 * the card begins below both. An email is the same page in an inbox, so it
 * puts them in the same place rather than tucking the wordmark inside the card
 * where the page never has it.
 *
 * @param branding - The resolved branding, whose header asset is the wordmark
 *   and whose footer text is the claim.
 * @param baseUrl - Base URL for the asset, or `null` for a relative one.
 * @param variables - Substitution values, since the claim is editable copy.
 * @param surfaces - The material, for the sky text's own colour and size.
 * @param gapPx - Distance between the masthead and the card.
 * @returns Zero, one or two `<tr>` rows.
 */
function buildMasthead(
  branding: ResolvedBranding,
  baseUrl: string | null,
  variables: Record<string, string>,
  surfaces: EmailSurfaces,
  gapPx: number,
): string {
  const rows: string[] = [];
  if (branding.headerAssetId) {
    rows.push(
      `<tr><td align="center" style="padding:0 0 6px 0;font-size:0;line-height:0;"><img src="${assetUrl(branding.headerAssetId, baseUrl)}" width="${MASTHEAD_WIDTH_PX}" alt="" style="display:block;width:${MASTHEAD_WIDTH_PX}px;max-width:${Math.round(MASTHEAD_WIDTH_RATIO * 100)}%;height:auto;"></td></tr>`,
    );
  }
  if (branding.footerText) {
    rows.push(
      `<tr><td align="center" class="em-sky-text" style="padding:0;font-family:${surfaces.skyText.fontFamily};font-size:${surfaces.skyText.fontSizePx}px;line-height:1.4;color:${surfaces.skyText.color};text-align:center;">${escapeHtml(interpolate(branding.footerText, variables))}</td></tr>`,
    );
  }
  if (rows.length > 0) {
    rows.push(`<tr><td style="height:${gapPx}px;line-height:0;font-size:0;">&nbsp;</td></tr>`);
  }
  return rows.join("\n        ");
}

/**
 * Renders a template's body blocks into the shared HTML shell, wrapped by the
 * branding resolved from the template's overrides over the global default
 * (header/footer asset + footer text + day/night page background). Text and
 * button blocks interpolate `{{var}}` from `variables`; the caller is
 * responsible for having validated required variables. This is the live-send
 * path, so the wrapper always carries {@link DARK_MODE_CSS} plus the dark
 * page-background `@media` block — the recipient's own mail client decides
 * light vs dark, since the backend has no other way to know it ahead of time.
 *
 * @param blocks - the template's ordered body blocks.
 * @param overrides - the template's per-field branding overrides (`null`/absent inherits global).
 * @param global - the global branding singleton default.
 * @param variables - `{{var}}` substitution values available to text/button blocks.
 * @param baseUrl - the backend's own public base URL, used to build asset URLs.
 * @returns the complete HTML email document.
 */
export function renderBlocks(
  blocks: EmailBlock[],
  overrides: Partial<EmailTemplateBrandingOverrides>,
  global: EmailBrandingDto,
  variables: Record<string, string>,
  baseUrl: string,
  tokens: DesignTokens,
): string {
  const branding = resolveBranding(overrides, global);
  const light = resolveEmailSurfaces(tokens, EmailColorScheme.Light);
  const dark = resolveEmailSurfaces(tokens, EmailColorScheme.Dark);
  const cards = buildCards(blocks, variables, baseUrl, light, tokens);
  const masthead = buildMasthead(branding, baseUrl, variables, light, tokens.paddings["--mc-gap-cards"]);
  const lightImageUrl = branding.lightBackgroundAssetId ? assetUrl(branding.lightBackgroundAssetId, baseUrl) : null;
  const darkImageUrl = branding.darkBackgroundAssetId ? assetUrl(branding.darkBackgroundAssetId, baseUrl) : null;
  const background = buildPageBackground(branding.lightGradientTop, branding.lightGradientBottom, lightImageUrl);
  const css = `@media (prefers-color-scheme: dark) {${buildDarkRules(dark)}}\n    ${buildDarkPageBackgroundCss(branding.darkGradientTop, branding.darkGradientBottom, darkImageUrl)}`;
  return buildEmailHtml(cards, css, background, light, masthead, tokens.paddings["--mc-gap-cards"]);
}

/**
 * Renders a template's blocks + the resolved branding wrapper into a complete
 * email, with `{{var}}` interpolation applied from `variables`.
 *
 * @param template - the template's subject + ordered body blocks.
 * @param overrides - the template's per-field branding overrides (`null`/absent inherits global).
 * @param global - the global branding singleton default.
 * @param variables - substitution values for `{{var}}` placeholders.
 * @param baseUrl - the backend's own public base URL (used for asset URLs).
 * @returns the rendered HTML and the interpolated subject line.
 */
export function renderEmailTemplate(
  template: { subject: string; blocks: EmailBlock[] },
  overrides: Partial<EmailTemplateBrandingOverrides>,
  global: EmailBrandingDto,
  variables: Record<string, string>,
  baseUrl: string,
  tokens: DesignTokens,
): { html: string; subject: string } {
  const subject = interpolate(template.subject, variables);
  const html = renderBlocks(template.blocks, overrides, global, variables, baseUrl, tokens);
  return { html, subject };
}

/**
 * Renders a live preview of a set of blocks for the dashboard editor's
 * iframe, with no variable substitution (an empty variables map) so
 * placeholders like `{{username}}` remain visible verbatim in the preview.
 *
 * Unlike {@link renderBlocks} (the live-send path, which always inlines the
 * `@media (prefers-color-scheme: dark)` rules so the recipient's mail client
 * picks light/dark), the dashboard preview iframe has an explicit light/dark
 * toggle in the UI (`EmailPreview.tsx`) and re-requests this endpoint on every
 * toggle — so here `colorScheme` forces one specific scheme's rules directly,
 * with no `@media` query.
 *
 * Takes no `baseUrl`: asset URLs are always built relative (see
 * {@link assetUrl}'s doc comment for why an absolute `PUBLIC_URL`-based URL
 * is wrong for this path specifically).
 *
 * Because the scheme is forced (not left to `@media`), the page background is
 * emitted directly as the chosen scheme's variant: the dark gradient/image for
 * `"dark"`, the light one for `"light"`.
 *
 * @param blocks - the blocks currently being edited.
 * @param overrides - the (possibly still-unsaved) per-field branding overrides being edited.
 * @param global - the global branding singleton default.
 * @param colorScheme - "light" or "dark" — selects which CSS rules and background variant are inlined.
 * @returns the rendered HTML.
 */
export function renderEmailPreview(
  blocks: EmailBlock[],
  overrides: Partial<EmailTemplateBrandingOverrides>,
  global: EmailBrandingDto,
  colorScheme: EmailColorSchemeValue,
  tokens: DesignTokens,
): string {
  const branding = resolveBranding(overrides, global);
  const surfaces = resolveEmailSurfaces(tokens, colorScheme);
  const cards = buildCards(blocks, {}, null, surfaces, tokens);
  const masthead = buildMasthead(branding, null, {}, surfaces, tokens.paddings["--mc-gap-cards"]);
  const isDark = colorScheme === EmailColorScheme.Dark;
  const gradientTop = isDark ? branding.darkGradientTop : branding.lightGradientTop;
  const gradientBottom = isDark ? branding.darkGradientBottom : branding.lightGradientBottom;
  const backgroundAssetId = isDark ? branding.darkBackgroundAssetId : branding.lightBackgroundAssetId;
  const imageUrl = backgroundAssetId ? assetUrl(backgroundAssetId, null) : null;
  const background = buildPageBackground(gradientTop, gradientBottom, imageUrl);
  // The scheme is forced here, so the material is already the right one and no
  // `@media` block is needed: what the preview shows is what that scheme sends.
  return buildEmailHtml(cards, "", background, surfaces, masthead, tokens.paddings["--mc-gap-cards"]);
}
