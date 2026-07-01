import { type EmailBlock, EmailBlockType } from "@musiccloud/shared";
import { marked } from "marked";

import type { EmailBrandingDto } from "../db/admin-repository.js";
import { escapeHtml } from "../lib/html.js";

marked.use({ breaks: true, gfm: true });

const VAR_REGEX = /\{\{(\w+)\}\}/g;

// musiccloud brand CI — dark palette mirrors the app's design tokens
// (see apps/frontend/src/styles/global.css: --color-background, --color-surface,
// --color-border, --color-text-primary, --color-text-secondary, --color-text-muted,
// --color-accent-hover).
const DARK_RULES = `
  body                        { background: #0A0A0C !important; }
  table.em-container          { background: #161618 !important; border-color: #38383A !important; }
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

function interpolate(text: string, variables: Record<string, string>): string {
  return text.replace(new RegExp(VAR_REGEX.source, "g"), (_, name) => escapeHtml(variables[name] ?? ""));
}

function applyInlineStyles(html: string): string {
  return html
    .replace(/<h1>/g, '<h1 style="font-size:22px;font-weight:600;color:#1C1C1E;margin:0 0 16px 0;line-height:1.3;">')
    .replace(/<h2>/g, '<h2 style="font-size:18px;font-weight:600;color:#1C1C1E;margin:0 0 12px 0;line-height:1.3;">')
    .replace(/<p>/g, '<p style="font-size:15px;line-height:1.6;color:#3A3A3C;margin:0 0 16px 0;">')
    .replace(/<a /g, '<a style="color:#28A8D8;font-weight:600;" ')
    .replace(/<strong>/g, '<strong style="color:#1C1C1E;">');
}

function parseMarkdown(text: string): string {
  const result = marked.parse(text);
  const html = typeof result === "string" ? result : "";
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
 * Builds the streaming asset URL for an `email_assets` row, anchored at the
 * backend's own public base URL.
 *
 * @param assetId - the `email_assets.id` to point at.
 * @param baseUrl - the backend's own public base URL (e.g. `PUBLIC_URL`).
 * @returns an absolute URL to `GET /api/admin/email-assets/:id`.
 */
function assetUrl(assetId: string, baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/api/admin/email-assets/${assetId}`;
}

/**
 * Builds the ordered `<tr>` rows for a template's body blocks wrapped by the
 * global branding (header asset, footer text, footer asset), with `{{var}}`
 * interpolation applied from `variables`. This is the single place the
 * block-rendering switch statement lives — both the live-send path
 * ({@link renderBlocks}) and the dashboard-preview path
 * ({@link renderEmailPreview}) call this and only differ in which CSS they
 * hand to {@link buildEmailHtml} afterwards, so the row markup can never
 * drift between what gets sent and what gets previewed.
 *
 * @param blocks - the template's ordered body blocks.
 * @param branding - the global branding singleton (header/footer asset ids + footer text).
 * @param variables - `{{var}}` substitution values available to text/button/footer content.
 * @param baseUrl - the backend's own public base URL, used to build asset URLs.
 * @returns the ordered list of `<tr>...</tr>` row strings.
 */
function buildBlockRows(
  blocks: EmailBlock[],
  branding: EmailBrandingDto,
  variables: Record<string, string>,
  baseUrl: string,
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
      `<tr><td class="em-footer-border" style="padding:24px 40px;border-top:1px solid #E5E5EA;text-align:center;"><div class="em-footer-text" style="font-size:13px;color:#8E8E93;line-height:1.5;">${parseMarkdown(interpolate(branding.footerText, variables))}</div></td></tr>`,
    );
  }
  if (branding.footerAssetId) {
    rows.push(
      `<tr><td><img src="${assetUrl(branding.footerAssetId, baseUrl)}" width="560" alt="" style="display:block;width:100%;border-radius:0 0 8px 8px;"></td></tr>`,
    );
  }
  return rows;
}

function buildEmailHtml(rows: string[], css: string): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <style>
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    ${css}
  </style>
</head>
<body style="margin:0;padding:0;background:#F5F5F7;font-family:'Barlow',-apple-system,BlinkMacSystemFont,system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="padding:40px 16px;">
      <table class="em-container" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#FFFFFF;border:1px solid #E5E5EA;border-radius:8px;overflow:hidden;">
        ${rows.join("\n        ")}
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Renders a template's body blocks into the shared HTML shell, wrapped by the
 * global branding (header/footer asset + footer text). Text and button blocks
 * interpolate `{{var}}` from `variables`; the caller is responsible for having
 * validated required variables. This is the live-send path, so the wrapper
 * always carries {@link DARK_MODE_CSS} (the `@media (prefers-color-scheme:
 * dark)` rules) — the recipient's own mail client decides light vs dark, since
 * the backend has no other way to know it ahead of time.
 *
 * @param blocks - the template's ordered body blocks.
 * @param branding - the global branding singleton (header/footer asset ids + footer text).
 * @param variables - `{{var}}` substitution values available to text/button blocks.
 * @param baseUrl - the backend's own public base URL, used to build asset URLs.
 * @returns the complete HTML email document.
 */
export function renderBlocks(
  blocks: EmailBlock[],
  branding: EmailBrandingDto,
  variables: Record<string, string>,
  baseUrl: string,
): string {
  return buildEmailHtml(buildBlockRows(blocks, branding, variables, baseUrl), DARK_MODE_CSS);
}

/**
 * Renders a template's blocks + the global branding wrapper into a complete
 * email, with `{{var}}` interpolation applied from `variables`.
 *
 * @param template - the template's subject + ordered body blocks.
 * @param branding - the global branding singleton.
 * @param variables - substitution values for `{{var}}` placeholders.
 * @param baseUrl - the backend's own public base URL (used for asset URLs).
 * @returns the rendered HTML and the interpolated subject line.
 */
export function renderEmailTemplate(
  template: { subject: string; blocks: EmailBlock[] },
  branding: EmailBrandingDto,
  variables: Record<string, string>,
  baseUrl: string,
): { html: string; subject: string } {
  const subject = interpolate(template.subject, variables);
  const html = renderBlocks(template.blocks, branding, variables, baseUrl);
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
 * @param blocks - the blocks currently being edited.
 * @param branding - the global branding singleton.
 * @param colorScheme - "light" or "dark" — selects which CSS rules are inlined into the `<style>` block.
 * @param baseUrl - the backend's own public base URL (used for asset URLs).
 * @returns the rendered HTML.
 */
export function renderEmailPreview(
  blocks: EmailBlock[],
  branding: EmailBrandingDto,
  colorScheme: "light" | "dark",
  baseUrl: string,
): string {
  const rows = buildBlockRows(blocks, branding, {}, baseUrl);
  return buildEmailHtml(rows, colorScheme === "dark" ? DARK_RULES : "");
}
