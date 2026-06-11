import { useGSAP } from "@gsap/react";
import { type ComponentPropsWithRef, useCallback, useRef } from "react";
import { animateFadeIn } from "@/lib/motion/entrances";

/**
 * A plain `<div>` that plays the shared fade entrance once when it mounts —
 * the GSAP replacement for the removed `animate-fade-in` Tailwind class on
 * interaction-flow panels (result content, disambiguation, genre browse and
 * search). Extracted because the identical mount-fade pattern appears on
 * five call sites (shared-component rule).
 *
 * The fade starts in the pre-paint layout phase (`useGSAP`), so the first
 * painted frame already shows the hidden start state — the exact timing the
 * CSS animation's `both` fill provided. Reduced motion is handled inside
 * `animateFadeIn` (no tween, content appears instantly).
 *
 * Accepts all `<div>` props. A forwarded `ref` is merged with the internal
 * animation ref, so consumers can keep focusing/measuring the same element
 * (e.g. the genre-search panel's focus target). Note for callback refs: the
 * merge forwards the node but swallows a React 19 cleanup return value, so
 * cleanup-style callback refs fall back to the classic null-call contract —
 * all current consumers pass ref objects, where this is irrelevant.
 */
export function FadeInOnMount({ ref, children, ...divProps }: ComponentPropsWithRef<"div">) {
  const elementRef = useRef<HTMLDivElement | null>(null);

  const assignRefs = useCallback(
    (node: HTMLDivElement | null) => {
      elementRef.current = node;
      if (typeof ref === "function") {
        ref(node);
        return;
      }
      if (ref) ref.current = node;
    },
    [ref],
  );

  useGSAP(() => {
    if (elementRef.current) animateFadeIn(elementRef.current);
  }, []);

  return (
    <div ref={assignRefs} {...divProps}>
      {children}
    </div>
  );
}
