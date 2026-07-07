import * as Iconsax from "iconsax-react";

/** The single Iconsax render style the portal uses (see lib/icons.tsx). */
const ICON_VARIANT = "Bulk" as const;

/** Iconsax component keyed by name; a tier's `icon` is one of the shared `TIER_ICONS`. */
type IconComponent = React.ComponentType<{ variant?: string; color?: string; className?: string }>;
const ICONS = Iconsax as unknown as Record<string, IconComponent | undefined>;

/**
 * Renders a tier's Iconsax icon by name in the portal's Bulk style
 * (`currentColor`, plus the `mc-icon` class so global.css lifts the dimmed
 * secondary layer). Used on the pricing cards, where the icon name comes from
 * the tier's `icon` field. Renders nothing for an empty or unknown name, so
 * call sites fall back to the colour dot.
 *
 * @param name - The Iconsax component name (a member of the shared `TIER_ICONS`).
 * @param className - Sizing/colour utility classes forwarded to the SVG.
 */
export function TierIcon({ name, className }: { name: string | null; className?: string }) {
  const Icon = name ? ICONS[name] : undefined;
  if (!Icon) return null;
  return (
    <Icon variant={ICON_VARIANT} color="currentColor" className={className ? `mc-icon ${className}` : "mc-icon"} />
  );
}
