/**
 * Shared neumorphic style tokens for the embossed/recessed design system.
 * Light source: top-left.
 *
 * Embossed = raised surface (bright top/left, dark bottom/right)
 * Recessed = inset surface (dark top/left, bright bottom/right)
 */

/** Raised/embossed border + shadow. Bright highlight top-left, dark shadow bottom-right. */
export const embossedStyle: React.CSSProperties = {
  boxShadow: "2px 2px 6px rgba(0,0,0,0.4), -2px -2px 6px rgba(255,255,255,0.03)",
  borderTop: "1px solid rgba(255,255,255,0.15)",
  borderLeft: "1px solid rgba(255,255,255,0.10)",
  borderBottom: "1px solid rgba(0,0,0,0.35)",
  borderRight: "1px solid rgba(0,0,0,0.3)",
};

/** Inset/recessed border + shadow. Dark shadow top-left, subtle highlight bottom-right. */
export const recessedStyle: React.CSSProperties = {
  boxShadow: "inset 1px 1px 4px rgba(0,0,0,0.25), inset -1px -1px 4px rgba(255,255,255,0.02)",
  borderTop: "1px solid rgba(0,0,0,0.25)",
  borderLeft: "1px solid rgba(0,0,0,0.2)",
  borderBottom: "1px solid rgba(255,255,255,0.15)",
  borderRight: "1px solid rgba(255,255,255,0.10)",
};
