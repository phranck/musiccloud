import { marked } from "marked";

import { escapeHtml } from "../lib/html.js";

marked.use({ breaks: true, gfm: true });

const VAR_REGEX = /\{\{(\w+)\}\}/g;

const DARK_RULES = `
  body                        { background: #1c1917 !important; }
  table.em-container          { background: #292524 !important; border-color: #44403c !important; }
  h1, h2, h3                  { color: #fafaf9 !important; }
  p                           { color: #d6d3d1 !important; }
  a                           { color: #fcd34d !important; }
  strong                      { color: #fafaf9 !important; }
  .em-footer-border           { border-top-color: #44403c !important; }
  .em-footer-text,
  .em-footer-text p           { color: #78716c !important; }
`;

const DARK_MODE_CSS = `@media (prefers-color-scheme: dark) {${DARK_RULES}}`;

function interpolate(text: string, variables: Record<string, string>): string {
  return text.replace(new RegExp(VAR_REGEX.source, "g"), (_, name) => escapeHtml(variables[name] ?? ""));
}

function applyInlineStyles(html: string): string {
  return html
    .replace(/<h1>/g, '<h1 style="font-size:22px;font-weight:600;color:#292524;margin:0 0 16px 0;line-height:1.3;">')
    .replace(/<h2>/g, '<h2 style="font-size:18px;font-weight:600;color:#292524;margin:0 0 12px 0;line-height:1.3;">')
    .replace(/<p>/g, '<p style="font-size:15px;line-height:1.6;color:#44403c;margin:0 0 16px 0;">')
    .replace(/<a /g, '<a style="color:#b45309;font-weight:600;" ')
    .replace(/<strong>/g, '<strong style="color:#292524;">');
}

function parseMarkdown(text: string): string {
  const result = marked.parse(text);
  const html = typeof result === "string" ? result : "";
  return applyInlineStyles(html);
}

export interface EmailTemplateFields {
  headerBannerUrl?: string | null;
  headerText?: string | null;
  bodyText: string;
  footerText?: string | null;
  footerBannerUrl?: string | null;
}

function buildRows(fields: EmailTemplateFields, variables: Record<string, string>): string[] {
  const headerHtml = fields.headerText ? parseMarkdown(interpolate(fields.headerText, variables)) : null;
  const bodyHtml = parseMarkdown(interpolate(fields.bodyText, variables));
  const footerHtml = fields.footerText ? parseMarkdown(interpolate(fields.footerText, variables)) : null;

  const rows: string[] = [];

  if (fields.headerBannerUrl) {
    rows.push(
      `<tr><td><img src="${fields.headerBannerUrl}" width="560" alt="" style="display:block;width:100%;border-radius:8px 8px 0 0;"></td></tr>`,
    );
  }
  if (headerHtml) {
    rows.push(`<tr><td style="padding:32px 40px 0;">${headerHtml}</td></tr>`);
  }
  rows.push(`<tr><td style="padding:32px 40px;">${bodyHtml}</td></tr>`);
  if (footerHtml) {
    rows.push(
      `<tr><td class="em-footer-border" style="padding:24px 40px;border-top:1px solid #e7e5e4;text-align:center;"><div class="em-footer-text" style="font-size:13px;color:#a8a29e;line-height:1.5;">${footerHtml}</div></td></tr>`,
    );
  }
  if (fields.footerBannerUrl) {
    rows.push(
      `<tr><td><img src="${fields.footerBannerUrl}" width="560" alt="" style="display:block;width:100%;border-radius:0 0 8px 8px;"></td></tr>`,
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
  <style>${css}</style>
</head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:'Inter',system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="padding:40px 16px;">
      <table class="em-container" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#fff;border:1px solid #e7e5e4;border-radius:8px;overflow:hidden;">
        ${rows.join("\n        ")}
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function renderEmailTemplate(
  template: EmailTemplateFields & { subject: string },
  variables: Record<string, string>,
): Promise<{ html: string; subject: string }> {
  const subject = interpolate(template.subject, variables);
  const rows = buildRows(template, variables);
  return { html: buildEmailHtml(rows, DARK_MODE_CSS), subject };
}

export function renderEmailPreview(fields: EmailTemplateFields, colorScheme: "light" | "dark"): string {
  const rows = buildRows(fields, {});
  return buildEmailHtml(rows, colorScheme === "dark" ? DARK_RULES : "");
}
