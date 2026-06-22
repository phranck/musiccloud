/**
 * Tailwind prose class-maps for overlay/fullscreen markdown content.
 *
 * Two surfaces share an identical structural template (spacing, typography,
 * pill/kbd geometry, field layout) and diverge only in their per-element color
 * literals: the translucent surface uses graduated white opacities, the
 * embossed surface collapses headings onto theme tokens.
 *
 * Every class string here is a COMPLETE literal so Tailwind's JIT compiler can
 * see it verbatim — class names are never composed from fragments.
 */

const MD_FIELDS = [
  "[&_.mc-fields]:my-3 [&_.mc-fields]:items-baseline [&_.mc-fields]:gap-y-0.5",
  "[&_.mc-fields_dt]:min-w-0 [&_.mc-fields_dt]:font-mono [&_.mc-fields_dt]:text-sm [&_.mc-fields_dt]:font-semibold [&_.mc-fields_dt]:[overflow-wrap:anywhere]",
  "[&_.mc-fields_dd]:m-0 [&_.mc-fields_dd]:min-w-0 [&_.mc-fields_dd]:leading-normal [&_.mc-fields_dd]:[overflow-wrap:anywhere]",
].join(" ");

/** Prose class-map for the translucent overlay surface (graduated white opacities). */
export const MD_TRANSLUCENT = [
  "[&_h1]:text-white [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:mb-3 [&_h1]:mt-0",
  "[&_h2]:text-white/90 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mb-2 [&_h2]:mt-6 [&_h2:first-child]:mt-0",
  "[&_h3]:text-white/80 [&_h3]:text-base [&_h3]:font-medium [&_h3]:mb-1 [&_h3]:mt-4",
  "[&_p]:text-white/60 [&_p]:text-base [&_p]:leading-relaxed [&_p]:mb-3",
  "[&_ul]:text-white/60 [&_ul]:text-base [&_ul]:pl-5 [&_ul]:mb-3 [&_ul]:space-y-1 [&_ul]:list-disc",
  "[&_ol]:text-white/60 [&_ol]:text-base [&_ol]:pl-5 [&_ol]:mb-3 [&_ol]:space-y-1 [&_ol]:list-decimal",
  "[&_li]:leading-relaxed",
  "[&_strong]:text-white/80 [&_strong]:font-medium",
  "[&_a]:text-[var(--color-accent)] [&_a]:underline",
  "[&_hr]:border-white/10 [&_hr]:my-4",
  "[&_pre]:my-3 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:p-3 [&_pre]:bg-black/30 [&_pre]:font-mono [&_pre]:text-sm",
  "[&_pre[data-card-wrapped]]:p-0 [&_pre[data-card-wrapped]]:bg-transparent [&_pre[data-card-wrapped]]:rounded-none [&_pre[data-card-wrapped]]:my-0",
  "[&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-white/15 [&_:not(pre)>code]:px-1.5 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-sm",
  "[&_.mc-pill]:inline-block [&_.mc-pill]:px-1.5 [&_.mc-pill]:py-0.5 [&_.mc-pill]:rounded [&_.mc-pill]:text-xs [&_.mc-pill]:font-semibold [&_.mc-pill]:tracking-wide [&_.mc-pill]:font-mono [&_.mc-pill]:ml-1 [&_.mc-pill]:align-middle",
  "[&_.mc-pill-alert]:bg-error/20 [&_.mc-pill-alert]:text-error",
  "[&_.mc-pill-info]:bg-white/15 [&_.mc-pill-info]:text-[var(--color-accent)]",
  "[&_.mc-pill-neutral]:bg-white/15 [&_.mc-pill-neutral]:text-white/70",
  "[&_.mc-pill-success]:bg-success/20 [&_.mc-pill-success]:text-success",
  "[&_.mc-kbd]:inline-block [&_.mc-kbd]:px-1.5 [&_.mc-kbd]:py-0.5 [&_.mc-kbd]:rounded [&_.mc-kbd]:text-xs [&_.mc-kbd]:font-mono [&_.mc-kbd]:bg-white/15 [&_.mc-kbd]:border [&_.mc-kbd]:border-white/20 [&_.mc-kbd]:text-white/80 [&_.mc-kbd]:align-middle",
  MD_FIELDS,
  "[&_.mc-fields]:text-white/60 [&_.mc-fields_dt]:text-[var(--color-accent)] [&_.mc-fields_dd]:text-white/60",
  "[&>*:last-child]:mb-0",
].join(" ");

/** Prose class-map for the embossed overlay / fullscreen surface (theme tokens). */
export const MD_EMBOSSED = [
  "[&_h1]:text-text-primary [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:mb-3 [&_h1]:mt-0",
  "[&_h2]:text-text-primary [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mb-2 [&_h2]:mt-6 [&_h2:first-child]:mt-0",
  "[&_h3]:text-text-primary [&_h3]:text-base [&_h3]:font-medium [&_h3]:mb-1 [&_h3]:mt-4",
  "[&_p]:text-text-secondary [&_p]:text-base [&_p]:leading-relaxed [&_p]:mb-3",
  "[&_ul]:text-text-secondary [&_ul]:text-base [&_ul]:pl-5 [&_ul]:mb-3 [&_ul]:space-y-1 [&_ul]:list-disc",
  "[&_ol]:text-text-secondary [&_ol]:text-base [&_ol]:pl-5 [&_ol]:mb-3 [&_ol]:space-y-1 [&_ol]:list-decimal",
  "[&_li]:leading-relaxed",
  "[&_strong]:text-text-primary [&_strong]:font-medium",
  "[&_a]:text-[var(--color-accent)] [&_a]:underline",
  "[&_hr]:border-black/10 [&_hr]:my-4",
  "[&_pre]:my-3 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:p-3 [&_pre]:bg-black/20 [&_pre]:font-mono [&_pre]:text-sm",
  "[&_pre[data-card-wrapped]]:p-0 [&_pre[data-card-wrapped]]:bg-transparent [&_pre[data-card-wrapped]]:rounded-none [&_pre[data-card-wrapped]]:my-0",
  "[&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-white/8 [&_:not(pre)>code]:px-1.5 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-sm",
  "[&_.mc-pill]:inline-block [&_.mc-pill]:px-1.5 [&_.mc-pill]:py-0.5 [&_.mc-pill]:rounded [&_.mc-pill]:text-xs [&_.mc-pill]:font-semibold [&_.mc-pill]:tracking-wide [&_.mc-pill]:font-mono [&_.mc-pill]:ml-1 [&_.mc-pill]:align-middle",
  "[&_.mc-pill-alert]:bg-error/15 [&_.mc-pill-alert]:text-error",
  "[&_.mc-pill-info]:bg-white/8 [&_.mc-pill-info]:text-[var(--color-accent)]",
  "[&_.mc-pill-neutral]:bg-text-muted/20 [&_.mc-pill-neutral]:text-text-muted",
  "[&_.mc-pill-success]:bg-success/15 [&_.mc-pill-success]:text-success",
  "[&_.mc-kbd]:inline-block [&_.mc-kbd]:px-1.5 [&_.mc-kbd]:py-0.5 [&_.mc-kbd]:rounded [&_.mc-kbd]:text-xs [&_.mc-kbd]:font-mono [&_.mc-kbd]:bg-white/8 [&_.mc-kbd]:border [&_.mc-kbd]:border-white/12 [&_.mc-kbd]:text-text-secondary [&_.mc-kbd]:align-middle",
  MD_FIELDS,
  "[&_.mc-fields]:text-text-secondary [&_.mc-fields_dt]:text-[var(--color-accent)] [&_.mc-fields_dd]:text-text-secondary",
  "[&>*:last-child]:mb-0",
].join(" ");
