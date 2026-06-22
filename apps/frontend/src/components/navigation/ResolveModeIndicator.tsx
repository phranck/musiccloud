import { config } from "@fortawesome/fontawesome-svg-core";
import { faCreativeCommons } from "@fortawesome/free-brands-svg-icons";
import { faCopyright } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { raisedControlRadius, recessedSurfaceRadius } from "@/components/cards/cardGeometry";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { useT } from "@/i18n/localeContext";
import { getResolveMode, subscribeResolveMode } from "@/lib/resolve/resolveMode";
import { ResolveMode } from "@/lib/types/app";

// Disable Font Awesome's automatic CSS injection — icons are sized via Tailwind,
// and auto-injected styles cause SSR/Astro-island hydration artefacts.
config.autoAddCss = false;

/**
 * Raised inner-block corner — the same `raisedControlRadius` cascade level the
 * switchers use for their indicator cell, so the indicator's inner block rounds
 * identically to the hamburger button (radius cascade, see AGENTS.md).
 */
const INNER_BLOCK_STYLE = { borderRadius: raisedControlRadius } as React.CSSProperties;

/** Duration of the pill width FLIP and the label fade, kept in sync. */
const TRANSITION_MS = 260;

/**
 * Measure-before-paint on the client (flash-free FLIP), plain effect on the
 * server where there is no layout — avoids React's `useLayoutEffect` SSR warning
 * (this indicator is server-rendered inside the `client:idle` header island).
 */
const useIsomorphicLayoutEffect = typeof document === "undefined" ? useEffect : useLayoutEffect;

/**
 * Read-only header indicator of the active resolve mode (Streaming / Creative
 * Commons), pinned top-left next to the hamburger on every page.
 *
 * Built from the same two-layer recipe as the header switchers (hamburger,
 * Day/Night, Language) so it reads as one of them: a recessed
 * {@link RecessedCard} track ({@link recessedSurfaceRadius}, `p-1` ring) wrapping
 * a single raised `mc-glass-nav-indicator` block ({@link raisedControlRadius}) —
 * same outer height, corner radii and padding ring as the switch buttons. Icon
 * and label share the neutral `mc-txt-nav-bright` nav colour (no accent tint,
 * which reads poorly on the glass), at the hero input's `text-lg` size.
 *
 * The pill sizes to its label (so it is narrower for the shorter mode) and
 * animates on a mode change: the block width FLIPs between the two label widths
 * (Web Animations API, measured pre-paint so it leaves no inline width behind)
 * while the new icon + label fade in (keyed remount + `fade-in`). Both honour
 * `prefers-reduced-motion` (the FLIP is skipped; the CSS fade is neutralised by
 * the global reduced-motion rule).
 *
 * Reflects only — the mode is changed via the in-field switch on the landing
 * page, the single place where the resolve mode is meaningful.
 */
export function ResolveModeIndicator() {
  const t = useT();
  const mode = useSyncExternalStore(subscribeResolveMode, getResolveMode, () => ResolveMode.Commercial);
  const isCc = mode === ResolveMode.Cc;
  const blockRef = useRef<HTMLDivElement>(null);
  const prevWidthRef = useRef<number | null>(null);

  useIsomorphicLayoutEffect(() => {
    const el = blockRef.current;
    if (!el) return;
    const next = el.offsetWidth;
    const prev = prevWidthRef.current;
    prevWidthRef.current = next;
    // First measure (mount) or unchanged width: nothing to animate.
    if (prev === null || prev === next) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const animation = el.animate([{ width: `${prev}px` }, { width: `${next}px` }], {
      duration: TRANSITION_MS,
      easing: "cubic-bezier(0.4, 0, 0.2, 1)",
    });
    return () => animation.cancel();
  }, [mode]);

  return (
    <RecessedCard className="mc-glass-nav-track flex p-1" radius={recessedSurfaceRadius}>
      <RecessedCard.Body className="contents">
        <div
          ref={blockRef}
          style={INNER_BLOCK_STYLE}
          className="embossed-gradient-border mc-glass-nav-indicator mc-txt-nav-bright flex h-[34px] items-center overflow-hidden px-3"
        >
          <span key={mode} className="flex items-center gap-2 whitespace-nowrap [animation:fade-in_260ms_ease-out]">
            <FontAwesomeIcon icon={isCc ? faCreativeCommons : faCopyright} className="size-5" aria-hidden />
            <span className="font-condensed text-lg font-normal">
              {isCc ? t("results.modeCc") : t("results.modeCommercial")}
            </span>
          </span>
        </div>
      </RecessedCard.Body>
    </RecessedCard>
  );
}
