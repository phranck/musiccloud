/**
 * Shared neumorphic style tokens for the embossed/recessed design system.
 * Light source: top-left.
 *
 * Embossed = raised surface (bright top/left, dark bottom/right)
 * Recessed = inset surface (dark top/left, bright bottom/right)
 */

/** Raised/embossed shadow. Gradient border is handled by the `.embossed-gradient-border`
 *  CSS class in neumorphic.css (::before pseudo-element with mask-composite: exclude). */
export const embossedStyle: React.CSSProperties = {
  boxShadow: "2px 2px 6px rgba(0,0,0,0.4), -2px -2px 6px rgba(255,255,255,0.03)",
};

/** Inset/recessed shadow. Gradient border is handled by the `.recessed-gradient-border`
 *  CSS class in neumorphic.css (::before pseudo-element with mask-composite: exclude). */
export const recessedStyle: React.CSSProperties = {
  boxShadow: "inset 1px 1px 4px rgba(0,0,0,0.25), inset -1px -1px 4px rgba(255,255,255,0.02)",
};
