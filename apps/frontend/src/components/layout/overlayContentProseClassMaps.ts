/**
 * Tailwind prose class-maps for overlay/fullscreen markdown content.
 *
 * The two surfaces share one structural template (spacing, typography, pill/kbd
 * geometry, field layout) and diverge only in their per-element color literals:
 * the translucent surface uses graduated white opacities, the embossed surface
 * collapses headings onto theme tokens.
 *
 * Every class string here is a COMPLETE literal so Tailwind's JIT compiler can
 * see it verbatim — class names are NEVER composed from sub-token fragments.
 * The color map holds full per-element/role class literals; the structural
 * template only concatenates those whole literals with the (equally whole)
 * non-color literals in the original source order. Both joined outputs stay
 * byte-identical to the pre-refactor maps (verified against snapshots).
 */

/**
 * Per-surface color literals. Each property holds the COMPLETE, contiguous run
 * of color-carrying classes for one element/role, positioned exactly where it
 * appears within that element's class run in the structural template.
 */
interface ProseColorMap {
  /** `<h1>` text color. */
  h1: string;
  /** `<h2>` text color. */
  h2: string;
  /** `<h3>` text color. */
  h3: string;
  /** `<p>` text color. */
  p: string;
  /** `<ul>` text color. */
  ul: string;
  /** `<ol>` text color. */
  ol: string;
  /** `<strong>` text color. */
  strong: string;
  /** `<hr>` border color. */
  hr: string;
  /** `<pre>` background color (sits mid-run, between padding and font). */
  pre: string;
  /** Inline `<code>` background color (mid-run, between rounded and padding). */
  code: string;
  /** `.mc-pill-alert` background + text colors. */
  pillAlert: string;
  /** `.mc-pill-info` background + text colors. */
  pillInfo: string;
  /** `.mc-pill-neutral` background + text colors. */
  pillNeutral: string;
  /** `.mc-pill-success` background + text colors. */
  pillSuccess: string;
  /** `.mc-kbd` bg + border-color + text colors (mid-run, between font-mono and align). */
  kbd: string;
  /** `.mc-fields` + dt/dd color literals (whole final color line). */
  fields: string;
}

const TRANSLUCENT_COLORS: ProseColorMap = {
  h1: "[&_h1]:text-white",
  h2: "[&_h2]:text-white/90",
  h3: "[&_h3]:text-white/80",
  p: "[&_p]:text-white/60",
  ul: "[&_ul]:text-white/60",
  ol: "[&_ol]:text-white/60",
  strong: "[&_strong]:text-white/80",
  hr: "[&_hr]:border-white/10",
  pre: "[&_pre]:bg-black/30",
  code: "[&_:not(pre)>code]:bg-white/15",
  pillAlert: "[&_.mc-pill-alert]:bg-error/20 [&_.mc-pill-alert]:text-error",
  pillInfo: "[&_.mc-pill-info]:bg-white/15 [&_.mc-pill-info]:text-[var(--color-accent)]",
  pillNeutral: "[&_.mc-pill-neutral]:bg-white/15 [&_.mc-pill-neutral]:text-white/70",
  pillSuccess: "[&_.mc-pill-success]:bg-success/20 [&_.mc-pill-success]:text-success",
  kbd: "[&_.mc-kbd]:bg-white/15 [&_.mc-kbd]:border [&_.mc-kbd]:border-white/20 [&_.mc-kbd]:text-white/80",
  fields: "[&_.mc-fields]:text-white/60 [&_.mc-fields_dt]:text-[var(--color-accent)] [&_.mc-fields_dd]:text-white/60",
};

const EMBOSSED_COLORS: ProseColorMap = {
  h1: "[&_h1]:text-text-primary",
  h2: "[&_h2]:text-text-primary",
  h3: "[&_h3]:text-text-primary",
  p: "[&_p]:text-text-secondary",
  ul: "[&_ul]:text-text-secondary",
  ol: "[&_ol]:text-text-secondary",
  strong: "[&_strong]:text-text-primary",
  hr: "[&_hr]:border-black/10",
  pre: "[&_pre]:bg-black/20",
  code: "[&_:not(pre)>code]:bg-white/8",
  pillAlert: "[&_.mc-pill-alert]:bg-error/15 [&_.mc-pill-alert]:text-error",
  pillInfo: "[&_.mc-pill-info]:bg-white/8 [&_.mc-pill-info]:text-[var(--color-accent)]",
  pillNeutral: "[&_.mc-pill-neutral]:bg-text-muted/20 [&_.mc-pill-neutral]:text-text-muted",
  pillSuccess: "[&_.mc-pill-success]:bg-success/15 [&_.mc-pill-success]:text-success",
  kbd: "[&_.mc-kbd]:bg-white/8 [&_.mc-kbd]:border [&_.mc-kbd]:border-white/12 [&_.mc-kbd]:text-text-secondary",
  fields:
    "[&_.mc-fields]:text-text-secondary [&_.mc-fields_dt]:text-[var(--color-accent)] [&_.mc-fields_dd]:text-text-secondary",
};

/** Color-free field-layout selectors, shared verbatim by both surfaces. */
const MD_FIELDS = [
  "[&_.mc-fields]:my-3 [&_.mc-fields]:items-baseline [&_.mc-fields]:gap-y-0.5",
  "[&_.mc-fields_dt]:min-w-0 [&_.mc-fields_dt]:font-mono [&_.mc-fields_dt]:text-sm [&_.mc-fields_dt]:font-semibold [&_.mc-fields_dt]:[overflow-wrap:anywhere]",
  "[&_.mc-fields_dd]:m-0 [&_.mc-fields_dd]:min-w-0 [&_.mc-fields_dd]:leading-normal [&_.mc-fields_dd]:[overflow-wrap:anywhere]",
].join(" ");

/**
 * Compose a full prose class-map from the shared structural template and a
 * per-surface {@link ProseColorMap}. Each entry concatenates whole literals in
 * the exact original source order, so the joined output is byte-identical to
 * the hand-written maps it replaces.
 *
 * @param c - the per-surface color literals to interleave
 * @returns the space-joined prose class string for that surface
 */
function buildProseClassMap(c: ProseColorMap): string {
  return [
    `${c.h1} [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:mb-3 [&_h1]:mt-0`,
    `${c.h2} [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mb-2 [&_h2]:mt-6 [&_h2:first-child]:mt-0`,
    `${c.h3} [&_h3]:text-base [&_h3]:font-medium [&_h3]:mb-1 [&_h3]:mt-4`,
    `${c.p} [&_p]:text-base [&_p]:leading-relaxed [&_p]:mb-3`,
    `${c.ul} [&_ul]:text-base [&_ul]:pl-5 [&_ul]:mb-3 [&_ul]:space-y-1 [&_ul]:list-disc`,
    `${c.ol} [&_ol]:text-base [&_ol]:pl-5 [&_ol]:mb-3 [&_ol]:space-y-1 [&_ol]:list-decimal`,
    "[&_li]:leading-relaxed",
    `${c.strong} [&_strong]:font-medium`,
    "[&_a]:text-[var(--color-accent)] [&_a]:underline",
    `${c.hr} [&_hr]:my-4`,
    `[&_pre]:my-3 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:p-3 ${c.pre} [&_pre]:font-mono [&_pre]:text-sm`,
    "[&_pre[data-card-wrapped]]:p-0 [&_pre[data-card-wrapped]]:bg-transparent [&_pre[data-card-wrapped]]:rounded-none [&_pre[data-card-wrapped]]:my-0",
    `[&_:not(pre)>code]:rounded ${c.code} [&_:not(pre)>code]:px-1.5 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-sm`,
    "[&_.mc-pill]:inline-block [&_.mc-pill]:px-1.5 [&_.mc-pill]:py-0.5 [&_.mc-pill]:rounded [&_.mc-pill]:text-xs [&_.mc-pill]:font-semibold [&_.mc-pill]:tracking-wide [&_.mc-pill]:font-mono [&_.mc-pill]:ml-1 [&_.mc-pill]:align-middle",
    c.pillAlert,
    c.pillInfo,
    c.pillNeutral,
    c.pillSuccess,
    `[&_.mc-kbd]:inline-block [&_.mc-kbd]:px-1.5 [&_.mc-kbd]:py-0.5 [&_.mc-kbd]:rounded [&_.mc-kbd]:text-xs [&_.mc-kbd]:font-mono ${c.kbd} [&_.mc-kbd]:align-middle`,
    MD_FIELDS,
    c.fields,
    "[&>*:last-child]:mb-0",
  ].join(" ");
}

/** Prose class-map for the translucent overlay surface (graduated white opacities). */
export const MD_TRANSLUCENT = buildProseClassMap(TRANSLUCENT_COLORS);

/** Prose class-map for the embossed overlay / fullscreen surface (theme tokens). */
export const MD_EMBOSSED = buildProseClassMap(EMBOSSED_COLORS);
