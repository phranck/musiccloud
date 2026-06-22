import { useGSAP } from "@gsap/react";
import { type MouseEvent, type ReactNode, type RefObject, Suspense } from "react";
import { ShareResultPlaceholder } from "@/components/landing/ShareResultPlaceholder";
import { ShareLogoHeader } from "@/components/share/ShareLogoHeader";
import { FadeInOnMount } from "@/components/ui/FadeInOnMount";
import { animateSlideOutDown } from "@/lib/motion/entrances";

interface ShareResultFrameProps {
  /** The configured `<ShareLayout/>` to render inside the framed result area. */
  children: ReactNode;
  /** Focus target so keyboard users land on the result; also the slide-out target. */
  resultsPanelRef: RefObject<HTMLDivElement | null>;
  /** Home-link handler (begins the clear/return flow). */
  handleShareLogoClick: (event: MouseEvent<HTMLAnchorElement>) => void;
  /**
   * Whether the clearing slide-out is running. When omitted (the CC path), the
   * frame renders no slide-out and stays fully interactive.
   */
  isClearing?: boolean;
  /**
   * Fires once when the clearing slide-out finishes (or immediately on the
   * reduced-motion path) and hands over to the search-field return staging —
   * see `useSearchFieldReturn`. Required only when `isClearing` can be true.
   */
  onClearSlideOutComplete?: () => void;
}

/**
 * Shared framing for a client-rendered share result (commercial and CC).
 *
 * Renders the focusable results panel, the centered home-link logo header, and
 * the lazily loaded `<ShareLayout/>` (passed as `children`) behind a fade
 * entrance and a `Suspense` placeholder. Both the commercial and CC result
 * views reduce to building their `ShareLayout` props and wrapping them here.
 *
 * The clearing slide-out lives here too: the `useGSAP` is gated on `isClearing`,
 * so the CC path — which passes neither flag — is a no-op and the tween never
 * runs. The commercial path passes `isClearing` / `onClearSlideOutComplete`; the
 * timeline's `onComplete` continues the clear choreography (the `animationend`
 * event the GSAP port replaced does not exist for JS tweens). Unmounting
 * mid-flight (e.g. Escape while clearing) reverts the `useGSAP` context, killing
 * the tween and suppressing the handover — the same outcome the CSS animation
 * had when its element left the DOM before `animationend`.
 *
 * @param children - The configured `<ShareLayout/>`.
 * @param resultsPanelRef - Focus / slide-out target ref.
 * @param handleShareLogoClick - Home-link click handler.
 * @param isClearing - Whether the clearing slide-out is active (commercial only).
 * @param onClearSlideOutComplete - Slide-out completion callback (commercial only).
 */
export function ShareResultFrame({
  children,
  resultsPanelRef,
  handleShareLogoClick,
  isClearing = false,
  onClearSlideOutComplete,
}: ShareResultFrameProps) {
  useGSAP(
    () => {
      if (!isClearing) return;
      const panel = resultsPanelRef.current;
      if (!panel) return;
      const tween = animateSlideOutDown(panel, { onComplete: () => onClearSlideOutComplete?.() });
      // Reduced motion: no tween exists — the clear flow must not depend on
      // an animation playing, so hand over synchronously (pre-paint).
      if (!tween) onClearSlideOutComplete?.();
    },
    { dependencies: [isClearing] },
  );

  return (
    <div
      ref={resultsPanelRef}
      tabIndex={-1}
      className={`outline-none w-full ${isClearing ? "pointer-events-none" : ""}`}
    >
      <ShareLogoHeader onLogoClick={handleShareLogoClick} />
      <FadeInOnMount>
        <Suspense fallback={<ShareResultPlaceholder />}>{children}</Suspense>
      </FadeInOnMount>
    </div>
  );
}
