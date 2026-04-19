/**
 * Shared neumorphic style tokens for the embossed/recessed design system.
 * Light source: top-left.
 *
 * Gradient borders (light top-left → dark bottom-right) are handled purely
 * in CSS via the `.embossed-gradient-border` and `.recessed-gradient-border`
 * classes in neumorphic.css (::before pseudo-element with mask-composite).
 *
 * The inline style tokens below only carry the box-shadow that distinguishes
 * cards (raised with a vertical drop shadow) from the fully flat buttons.
 */

/** EmbossedCard drop shadow — vertical only (no X offset) for a clean
 *  "floating card" feel against the page. EmbossedButton does NOT apply this:
 *  buttons stay flat and rely on the gradient border alone. */
export const embossedCardStyle: React.CSSProperties = {
  boxShadow: "0 2px 6px rgba(0,0,0,0.4), 0 -2px 6px rgba(255,255,255,0.03)",
};

/** Inset/recessed shadow — single dark inset from top-left.
 *  No bottom-right highlight: the pushed-in impression should come from
 *  shadow alone, not from a competing rim light. */
export const recessedStyle: React.CSSProperties = {
  boxShadow: "inset 1px 1px 4px rgba(0,0,0,0.25)",
};
