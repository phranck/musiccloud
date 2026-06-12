import gsap from "gsap";
import { MotionDuration, MotionEase } from "./constants";
import { prefersReducedMotion, setupMotion } from "./setup";

/**
 * GSAP-driven page transitions on Astro's ClientRouter lifecycle (plan
 * MC-029 Task 3.1). The default view-transition animation is disabled in
 * `BaseLayout.astro` (`transition:animate="none"` on the body); these
 * listeners take over:
 *
 * - `astro:before-preparation` — the OUT phase. Astro exposes the document
 *   loader on the event for exactly this wrapping pattern; the wrapped
 *   loader runs the out tween IN PARALLEL with the network load
 *   (`Promise.all`), so the animation hides latency instead of adding to it.
 *   The swap happens only after both settle.
 * - `astro:after-swap` — the IN phase. Fires synchronously after the DOM
 *   swap and before the next paint, so the freshly swapped content can be
 *   seeded with its hidden start state without flashing.
 *
 * Only the page content (the `data-mc-page` wrapper around the layout slot)
 * animates — the persistent islands (`mc-background`, `mc-header`) are
 * siblings outside the wrapper and never tweened.
 *
 * Interrupt safety (rapid back-and-forth navigation): a new out/in kills the
 * wrapper's previous tween first (same contract as `lib/motion/swap.ts`).
 * The loader promise resolves through `onInterrupt` as well — a killed GSAP
 * animation never settles its `then()`, and an unresolved loader would
 * deadlock the navigation.
 *
 * Cleanup: the in tween clears its inline styles on completion. This is
 * load-bearing beyond tidiness — a lingering transform on the page wrapper
 * would make it the containing block for `position: fixed` overlays inside
 * the page (they would anchor to the wrapper instead of the viewport).
 *
 * Reduced motion: both phases perform the shared one-shot
 * `prefersReducedMotion()` read and skip their tween — the swap is then
 * instant (the CSS reduced-motion rule does not cover JS tweens; this gate
 * is the only guard).
 */

/** Selector of the animatable page wrapper rendered by `BaseLayout.astro` around its slot. */
export const PAGE_CONTENT_SELECTOR = "[data-mc-page]";

/** Vertical travel in px of the page content during out (up) and in (from below) — subtle, app-like. */
const PAGE_TRAVEL_PX = 12;

/** Marker on `document` so repeated `initPageTransitions()` calls (HMR, double imports) never stack listeners. */
const INIT_FLAG = "__mcPageTransitions";

/** The page wrapper's in-flight tween, killed by the next phase (interrupt contract). */
let activeTween: gsap.core.Tween | null = null;

/** Kills the in-flight page tween, if any (suppresses its onComplete; onInterrupt still fires). */
function killActiveTween(): void {
  activeTween?.kill();
  activeTween = null;
}

/**
 * Resolves when `tween` finishes OR is killed. GSAP semantics make this
 * dual-path mandatory: `onComplete` never fires after `kill()`, and the
 * timeline's own `then()` would stay pending forever — `onInterrupt` covers
 * the kill path so an interrupted out animation cannot deadlock the wrapped
 * loader.
 */
function tweenSettled(tween: gsap.core.Tween): Promise<void> {
  return new Promise((resolve) => {
    tween.eventCallback("onComplete", () => resolve());
    tween.eventCallback("onInterrupt", () => resolve());
  });
}

/**
 * Plays the page-out tween (fade + slight rise) on the current page content.
 *
 * @returns A promise that settles on completion or interruption, or `null`
 *   when there is nothing to animate (no wrapper, reduced motion).
 */
function animatePageOut(): Promise<void> | null {
  if (prefersReducedMotion()) return null;
  const page = document.querySelector<HTMLElement>(PAGE_CONTENT_SELECTOR);
  if (!page) return null;

  killActiveTween();
  activeTween = gsap.to(page, {
    opacity: 0,
    y: -PAGE_TRAVEL_PX,
    duration: MotionDuration.PageOut,
    ease: MotionEase.McOut,
    // No clearProps: the content must HOLD its hidden end state until the
    // swap replaces it — clearing would flash the old page back in.
  });
  return tweenSettled(activeTween);
}

/** Plays the page-in tween (fade + rise from below) on the freshly swapped content. */
function animatePageIn(): void {
  if (prefersReducedMotion()) return;
  const page = document.querySelector<HTMLElement>(PAGE_CONTENT_SELECTOR);
  if (!page) return;

  killActiveTween();
  activeTween = gsap.fromTo(
    page,
    { opacity: 0, y: PAGE_TRAVEL_PX },
    {
      opacity: 1,
      y: 0,
      duration: MotionDuration.PageIn,
      ease: MotionEase.McOut,
      // Settled pages carry no inline styles (fixed-overlay containing-block
      // hazard, see module doc); GSAP resets its transform cache alongside.
      clearProps: "opacity,transform",
      onComplete: () => {
        activeTween = null;
      },
    },
  );
}

/**
 * Installs the ClientRouter lifecycle listeners. Called once from the
 * BaseLayout module script (which runs once per real page load — module
 * scripts are not re-executed on ClientRouter swaps, and document-level
 * listeners survive them). Idempotent via a document-level flag so HMR or a
 * second import cannot stack duplicate listeners.
 */
export function initPageTransitions(): void {
  setupMotion();
  const holder = document as Document & { [INIT_FLAG]?: boolean };
  if (holder[INIT_FLAG]) return;
  holder[INIT_FLAG] = true;

  document.addEventListener("astro:before-preparation", (event) => {
    const preparation = event as Event & { loader: () => Promise<void> };
    const originalLoader = preparation.loader;
    preparation.loader = async function wrappedLoader(this: unknown, ...args: []) {
      const out = animatePageOut();
      // Animation and document load run concurrently; the swap waits for both.
      await Promise.all([out, originalLoader.apply(this, args)]);
    };
  });

  document.addEventListener("astro:after-swap", () => {
    animatePageIn();
  });
}
