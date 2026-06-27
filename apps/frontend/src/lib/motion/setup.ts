import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { Flip } from "gsap/Flip";
import { MotionEase } from "./constants";

/**
 * The exact cubic-bezier control points of the app-wide easing curve
 * `cubic-bezier(0.16, 1, 0.3, 1)`. Registered under {@link MotionEase.McOut}
 * so every GSAP tween can reference the same named ease instead of inlining the
 * bezier string (DRY). Kept as a private constant — components consume the name
 * via `MotionEase`, never the raw points.
 */
const MC_OUT_BEZIER = "0.16, 1, 0.3, 1";

/**
 * Control points of the CSS `ease-in` keyword, `cubic-bezier(0.42, 0, 1, 1)`.
 * Registered under {@link MotionEase.McIn} for exits that accelerate away
 * (exact port of the retired `slide-out-down` keyframe's timing function).
 */
const MC_IN_BEZIER = "0.42, 0, 1, 1";

/**
 * Control points of the gentle deceleration curve `cubic-bezier(0, 0, 0.2, 1)`
 * the retired `fade-in` CSS animation used. Registered under
 * {@link MotionEase.McFade}.
 */
const MC_FADE_BEZIER = "0, 0, 0.2, 1";

/**
 * Lag-smoothing thresholds for `gsap.ticker`. When a single frame exceeds
 * `LAG_THRESHOLD_MS` (e.g. the tab was backgrounded or the main thread stalled),
 * GSAP clamps the reported delta to `LAG_ADJUSTED_MS` so in-flight tweens resume
 * smoothly instead of jumping forward by the full elapsed time. Values match the
 * plan's `gsap.ticker.lagSmoothing(500, 33)` (33 ms ≈ two 60 Hz frames).
 */
const LAG_THRESHOLD_MS = 500;
const LAG_ADJUSTED_MS = 33;

/** Media query that signals the user prefers reduced motion. */
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Guard that short-circuits redundant `setupMotion()` calls *within a single
 * module graph*. Every importer of this file in the same bundle shares one
 * module instance, so the flag is set on the first call and skips the work on
 * every later one.
 *
 * It does NOT span separate bundles: the React-island bundle and the inline
 * BaseLayout module script (Phase 3) each get their own module instance and
 * thus their own `isMotionSetup`. Cross-bundle de-duplication is handled by
 * GSAP itself — `registerPlugin` ignores already-registered plugins and
 * `CustomEase.create` overwrites the same-named ease in place — so a second
 * setup from another bundle is harmless, just not gated by this flag.
 */
let isMotionSetup = false;

/**
 * Registers the GSAP plugins and the custom easing the app relies on, and tunes
 * the shared ticker. Safe to call repeatedly: the first call performs the setup,
 * all subsequent calls are no-ops (idempotent), so calling it from several React
 * islands (or from the inline BaseLayout script) registers GSAP only once per
 * bundle.
 *
 * Side effects (first call only):
 * - registers the `Flip` and `CustomEase` plugins on the global `gsap` instance
 * - creates the `mcOut`, `mcIn` and `mcFade` CustomEases so
 *   `gsap.parseEase("mcOut")` (etc.) resolves
 * - sets `gsap.ticker.lagSmoothing` to avoid post-stall animation jumps
 * - sets `gsap.config({ force3D: true })` so every transform tween is
 *   GPU-composited (see the inline note for the jank rationale)
 *
 * **Consumer contract (tree-shaking safety):** any module that uses a GSAP
 * plugin (`Flip`) or the `mcOut` ease MUST call `setupMotion()` explicitly
 * before doing so — do not rely on the import-time auto-call below. That
 * auto-call is an import side effect; a production bundler (Rollup/Vite) is
 * free to drop it if this file is ever treated as side-effect-free and an
 * island imports only a named export (`MotionDuration`, `prefersReducedMotion`).
 * For the same reason this file must NEVER be marked side-effect-free (no
 * `"sideEffects": false` entry covering it in `package.json`); the explicit
 * call is the durable guarantee, the auto-call is only convenience.
 *
 * @returns Nothing — the effect is the global GSAP registration.
 */
export function setupMotion(): void {
  if (isMotionSetup) return;
  isMotionSetup = true;

  // Register plugins before creating the CustomEases so the named eases are
  // added to GSAP's global ease map and resolvable via gsap.parseEase.
  gsap.registerPlugin(Flip, CustomEase);
  CustomEase.create(MotionEase.McOut, MC_OUT_BEZIER);
  CustomEase.create(MotionEase.McIn, MC_IN_BEZIER);
  CustomEase.create(MotionEase.McFade, MC_FADE_BEZIER);
  gsap.ticker.lagSmoothing(LAG_THRESHOLD_MS, LAG_ADJUSTED_MS);

  // Force every transform tween onto its own GPU compositor layer
  // (translate3d/matrix3d) instead of GSAP's default "auto", which can leave a
  // tween on the main thread until it promotes mid-flight — the source of the
  // collapse-section jank after the CSS-keyframe→GSAP migration (the keyframes
  // had baked-in translate3d + backface-visibility). Setting it centrally is
  // the durable guarantee: a new transform tween is GPU-composited without each
  // call site remembering `force3D: true`.
  gsap.config({ force3D: true });
}

// Convenience: run setup as a side effect of importing the module so a bare
// `import "@/lib/motion/setup"` is enough in the common case. NOT a substitute
// for the explicit `setupMotion()` call mandated by the consumer contract above
// (a bundler may drop this auto-call under tree-shaking).
setupMotion();

/**
 * Reports whether the user currently requests reduced motion via a direct,
 * one-shot `window.matchMedia` read — no GSAP `matchMedia` context is allocated.
 * The query is read synchronously and nothing is subscribed, so there is no
 * listener to clean up. This is the same read as `readPrefersReducedMotion` in
 * `components/ui/usePrefersReducedMotion.ts:10-16`; both intentionally share the
 * `(prefers-reduced-motion: reduce)` query source. Converging the VFD hook onto
 * this single source is a later task (Phase 5) — do not touch that hook here.
 *
 * In a non-browser / headless context (SSR, unit tests) where
 * `window.matchMedia` is unavailable, this returns `false` (treat as
 * "motion allowed") instead of throwing. Animation entry points must still call
 * this from the client; the SSR fallback only prevents an import- or call-time
 * error on the server.
 *
 * @returns `true` if the user prefers reduced motion, otherwise `false`.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}
