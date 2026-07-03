import { type EmailBlock, EmailBlockType } from "@musiccloud/shared";
import { Marked } from "marked";

import type { EmailBrandingDto, EmailTemplateBrandingOverrides } from "../db/admin-repository.js";
import { escapeHtml } from "../lib/html.js";

/**
 * A dedicated `Marked` instance, NOT the package's shared default export.
 * `admin-content.ts` calls `marked.use({..., async: true, ...})` on that
 * default export to add its own footnote handling — since `marked.use()`
 * mutates process-wide singleton state, using the default export here would
 * make `.parse()` return a `Promise<string>` instead of a `string` for every
 * caller in the process, this one included, with no way to opt back out
 * (`marked.parse(text, {async: false})` on a polluted singleton throws:
 * "The async option was set to true by an extension"). A separate instance
 * keeps this file's markdown parsing genuinely synchronous regardless of
 * what other modules configure on the shared singleton.
 */
const emailMarked = new Marked({ breaks: true, gfm: true });

const VAR_REGEX = /\{\{(\w+)\}\}/g;

// musiccloud brand CI — dark palette mirrors the app's design tokens
// (see apps/frontend/src/styles/global.css: --color-background, --color-surface,
// --color-border, --color-text-primary, --color-text-secondary, --color-text-muted,
// --color-accent-hover).
//
// No `body { background: ... }` rule here (unlike earlier versions): the
// dark page background is now always a real resolved gradient (see
// `buildPageBackground`/`buildDarkPageBackgroundCss`), painted inline on
// `<body>` itself. A flat `!important` rule in this block would beat that
// plain inline style outright (importance always wins over specificity) and
// blank out the sky, regardless of source order.
const DARK_RULES = `
  table.em-container          { background: rgba(22, 22, 24, 0.94) !important; border-color: #2A2A2C !important; }
  h1, h2, h3                  { color: #F5F5F7 !important; }
  p                           { color: #C7C7CC !important; }
  a                           { color: #45BFE8 !important; }
  strong                      { color: #F5F5F7 !important; }
  .em-footer-border           { border-top-color: #38383A !important; }
  .em-footer-text,
  .em-footer-text p           { color: #9A9AA0 !important; }
`;

const DARK_MODE_CSS = `@media (prefers-color-scheme: dark) {${DARK_RULES}}`;

/** Accent color for the button block, reused verbatim from the developer-portal's dark-mode-safe button (`developer-email.ts`). */
const BUTTON_ACCENT = "#28A8D8";

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

function applyInlineStyles(html: string): string {
  return html
    .replace(/<h1>/g, '<h1 style="font-size:22px;font-weight:600;color:#1C1C1E;margin:0 0 16px 0;line-height:1.3;">')
    .replace(/<h2>/g, '<h2 style="font-size:18px;font-weight:600;color:#1C1C1E;margin:0 0 12px 0;line-height:1.3;">')
    .replace(/<p>/g, '<p style="font-size:15px;line-height:1.6;color:#3A3A3C;margin:0 0 16px 0;">')
    .replace(/<a /g, '<a style="color:#28A8D8;font-weight:600;" ')
    .replace(/<strong>/g, '<strong style="color:#1C1C1E;">');
}

/**
 * Parses markdown to HTML using the module-local {@link emailMarked}
 * instance (never the package's shared default export — see its own doc
 * comment for why). `{ async: false }` selects the overload that returns a
 * plain `string`.
 */
function parseMarkdown(text: string): string {
  const html = emailMarked.parse(text, { async: false });
  return applyInlineStyles(html);
}

/**
 * Builds the `<tr>` markup for a single button block. Style values (accent
 * color, padding, border-radius, dark text-on-accent) are lifted verbatim
 * from the already-shipped, dark-mode-safe developer-portal button
 * (`developer-email.ts`) rather than inventing a new look.
 *
 * @param label - visible button text (escaped).
 * @param url - already-interpolated target URL.
 * @returns a single `<tr>` row.
 */
function renderButton(label: string, url: string): string {
  return `<tr><td style="padding:8px 40px 24px;"><table cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:8px;background:${BUTTON_ACCENT};"><a href="${url}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#0f1115;text-decoration:none;">${escapeHtml(label)}</a></td></tr></table></td></tr>`;
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
  footerAssetId: string | null;
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
    footerAssetId: overrides.footerAssetId ?? global.footerAssetId,
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
    cellStyle: `padding:40px 16px;${backgroundCss}`,
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
 * block-rendering switch statement lives — both the live-send path
 * ({@link renderBlocks}) and the dashboard-preview path
 * ({@link renderEmailPreview}) call this and only differ in which CSS they
 * hand to {@link buildEmailHtml} afterwards, so the row markup can never
 * drift between what gets sent and what gets previewed.
 *
 * @param blocks - the template's ordered body blocks.
 * @param branding - the resolved branding for this render (header/footer asset ids + footer text).
 * @param variables - `{{var}}` substitution values available to text/button/footer content.
 * @param baseUrl - the backend's own public base URL for asset URLs, or `null`
 *   to build relative asset URLs (see {@link assetUrl}'s doc comment).
 * @returns the ordered list of `<tr>...</tr>` row strings.
 */
function buildBlockRows(
  blocks: EmailBlock[],
  branding: ResolvedBranding,
  variables: Record<string, string>,
  baseUrl: string | null,
): string[] {
  const rows: string[] = [];
  if (branding.headerAssetId) {
    rows.push(
      `<tr><td><img src="${assetUrl(branding.headerAssetId, baseUrl)}" width="560" alt="" style="display:block;width:100%;border-radius:8px 8px 0 0;"></td></tr>`,
    );
  }
  for (const block of blocks) {
    switch (block.type) {
      case EmailBlockType.Text:
        rows.push(
          `<tr><td style="padding:24px 40px;">${parseMarkdown(interpolate(block.markdown, variables))}</td></tr>`,
        );
        break;
      case EmailBlockType.Button:
        rows.push(renderButton(block.label, interpolate(block.url, variables)));
        break;
      case EmailBlockType.Image:
        rows.push(
          `<tr><td style="padding:0 40px;"><img src="${assetUrl(block.assetId, baseUrl)}" width="480" alt="${escapeHtml(block.altText)}" style="display:block;max-width:100%;"></td></tr>`,
        );
        break;
      case EmailBlockType.Divider:
        rows.push(`<tr><td style="padding:8px 40px;"><hr style="border:none;border-top:1px solid #E5E5EA;"></td></tr>`);
        break;
      case EmailBlockType.Spacer:
        rows.push(
          `<tr><td style="height:${Math.max(0, Math.round(block.heightPx))}px;line-height:0;">&nbsp;</td></tr>`,
        );
        break;
    }
  }
  if (branding.footerText) {
    rows.push(
      `<tr><td class="em-footer-border" style="padding:16px 40px;border-top:1px solid #E5E5EA;text-align:center;"><div class="em-footer-text" style="font-size:13px;color:#8E8E93;line-height:1.5;">${parseMarkdown(interpolate(branding.footerText, variables))}</div></td></tr>`,
    );
  }
  if (branding.footerAssetId) {
    rows.push(
      `<tr><td><img src="${assetUrl(branding.footerAssetId, baseUrl)}" width="560" alt="" style="display:block;width:100%;border-radius:0 0 8px 8px;"></td></tr>`,
    );
  }
  return rows;
}

/** Drop shadow behind the content card, giving it visible lift over the page background. */
const CARD_SHADOW = "0 20px 50px rgba(15, 23, 42, 0.35)";

/**
 * Assembles the complete HTML email document: the `<style>` block (shared
 * base rules + the caller's scheme-specific `css`), a full-viewport `<body>`
 * background, and the outer page-background `<td>` wrapping the 560px
 * content card.
 *
 * The card is nested in an extra, unclipped `<td>` that carries the
 * `box-shadow` — `box-shadow` and `overflow:hidden` never combine on the same
 * element (the shadow, which paints outside the border box, gets clipped by
 * the element's own overflow rule), and `overflow:hidden` on the card itself
 * is required to clip the header/footer images to its rounded corners. The
 * card's own background is a subtly translucent white (light) /
 * near-black (dark, via {@link DARK_RULES}) rather than fully opaque, so the
 * page background reads through slightly at the edges.
 *
 * @param rows - the body block rows from {@link buildBlockRows}.
 * @param css - scheme-specific `<style>` content (the dark `@media` block on the
 *   send path, or the forced light/dark rules on the preview path).
 * @param background - this render's {@link PageBackground} (body + cell inline styles).
 * @returns the complete HTML email document.
 */
function buildEmailHtml(rows: string[], css: string, background: PageBackground): string {
  return `<!DOCTYPE html>
<html lang="de">
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
<body style="margin:0;padding:0;${background.bodyStyle}font-family:'Barlow',-apple-system,BlinkMacSystemFont,system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" class="em-page-bg" style="${background.cellStyle}">
      <table cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:560px;">
        <tr><td style="border-radius:8px;box-shadow:${CARD_SHADOW};">
          <table class="em-container" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:rgba(255,255,255,0.94);border:1px solid #E5E5EA;border-radius:8px;overflow:hidden;">
            ${rows.join("\n            ")}
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
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
): string {
  const branding = resolveBranding(overrides, global);
  const rows = buildBlockRows(blocks, branding, variables, baseUrl);
  const lightImageUrl = branding.lightBackgroundAssetId ? assetUrl(branding.lightBackgroundAssetId, baseUrl) : null;
  const darkImageUrl = branding.darkBackgroundAssetId ? assetUrl(branding.darkBackgroundAssetId, baseUrl) : null;
  const background = buildPageBackground(branding.lightGradientTop, branding.lightGradientBottom, lightImageUrl);
  const css = `${DARK_MODE_CSS}\n    ${buildDarkPageBackgroundCss(branding.darkGradientTop, branding.darkGradientBottom, darkImageUrl)}`;
  return buildEmailHtml(rows, css, background);
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
): { html: string; subject: string } {
  const subject = interpolate(template.subject, variables);
  const html = renderBlocks(template.blocks, overrides, global, variables, baseUrl);
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
  colorScheme: "light" | "dark",
): string {
  const branding = resolveBranding(overrides, global);
  const rows = buildBlockRows(blocks, branding, {}, null);
  const isDark = colorScheme === "dark";
  const gradientTop = isDark ? branding.darkGradientTop : branding.lightGradientTop;
  const gradientBottom = isDark ? branding.darkGradientBottom : branding.lightGradientBottom;
  const backgroundAssetId = isDark ? branding.darkBackgroundAssetId : branding.lightBackgroundAssetId;
  const imageUrl = backgroundAssetId ? assetUrl(backgroundAssetId, null) : null;
  const background = buildPageBackground(gradientTop, gradientBottom, imageUrl);
  return buildEmailHtml(rows, isDark ? DARK_RULES : "", background);
}
