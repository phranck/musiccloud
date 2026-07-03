import type { EmailBranding } from "@/features/templates/hooks/useEmailBranding";
import type { EmailTemplate } from "@/shared/contracts/admin-email-templates";

/** A deduplicated day/night gradient colour pair offered as a one-click preset. */
export interface GradientSwatch {
  top: string;
  bottom: string;
}

/**
 * Collects the distinct `(top, bottom)` gradient pairs already in use across
 * the global branding default and every template's overrides, so the gradient
 * picker can offer them as one-click presets (MC-079). A template override
 * half that is `null` (inherits the global) is skipped, since a swatch needs
 * both colours. Pairs are deduplicated by `"top|bottom"` and returned in
 * first-seen order (global light, global dark, then per template).
 *
 * @param global - the global branding singleton, or `undefined` while loading.
 * @param templates - all email templates, or `undefined` while loading.
 * @returns the distinct gradient pairs, in first-seen order.
 */
export function collectGradientSwatches(
  global: EmailBranding | undefined,
  templates: EmailTemplate[] | undefined,
): GradientSwatch[] {
  const seen = new Set<string>();
  const out: GradientSwatch[] = [];

  const add = (top: string | null, bottom: string | null) => {
    if (!top || !bottom) return;
    const key = `${top}|${bottom}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ top, bottom });
  };

  if (global) {
    add(global.lightGradientTop, global.lightGradientBottom);
    add(global.darkGradientTop, global.darkGradientBottom);
  }
  for (const template of templates ?? []) {
    add(template.branding.lightGradientTop, template.branding.lightGradientBottom);
    add(template.branding.darkGradientTop, template.branding.darkGradientBottom);
  }

  return out;
}
