import gsap from "gsap";
import { useEffect, useRef } from "react";
import { NightSkyDriver } from "@/components/background/nightSky/loop";
import {
  type NightSkyMessage,
  NightSkyMessageType,
  NightSkyWorkerEvent,
  type NightSkyWorkerEventMessage,
} from "@/components/background/nightSky/protocol";
import { createNightSkyScene, type NightSkyScene } from "@/components/background/nightSky/scene";
import { NIGHT_SKY_DEFAULTS, type NightSkySettings } from "@/components/background/nightSky/settings";
import { MotionEase } from "@/lib/motion/constants";
import { prefersReducedMotion, setupMotion } from "@/lib/motion/setup";

/** Seconds the canvas takes to fade in over the CSS gradient once the first frame is ready. */
const CANVAS_FADE_IN_SECONDS = 1.2;

/** Boot delay fallback for browsers without requestIdleCallback (Safari < 18). */
const IDLE_FALLBACK_MS = 200;

/** window event name of the opt-in runtime API (day/night toggle, animation switch). */
const NIGHT_SKY_EVENT = "mc:night-sky";

/** Detail payload of the {@link NIGHT_SKY_EVENT} CustomEvent. */
export interface NightSkyEventDetail {
  /** Target day amount in [0, 1]. */
  dayness?: number;
  /** Play the boosted fade (default true); ignored without `dayness`. */
  animated?: boolean;
  /** Master animation switch. */
  animate?: boolean;
}

/** Schedules the boot off the critical path; returns a canceller. */
function scheduleIdle(callback: () => void): () => void {
  if (typeof requestIdleCallback === "function") {
    const handle = requestIdleCallback(callback);
    return () => cancelIdleCallback(handle);
  }
  const handle = setTimeout(callback, IDLE_FALLBACK_MS);
  return () => clearTimeout(handle);
}

/**
 * The night-sky WebGL background island (plan MC-029 Phase 4).
 *
 * Renders a single `<canvas>` that starts fully transparent above the static
 * CSS gradient fallback and only fades in once the FIRST frame has been
 * rendered — the page never shows a black or half-initialised surface, and
 * without JS/WebGL the CSS layer simply stays.
 *
 * Render paths:
 * - **Worker (default):** after an idle callback the canvas is transferred
 *   via `transferControlToOffscreen()` to a module worker that owns GL and
 *   the whole frame loop (policy 6 — the main thread only posts primitives:
 *   throttled resize, visibility, reduced-motion, API events).
 * - **Main-thread fallback (Safari < 17):** the same scene/driver code runs
 *   locally, scheduled as a `gsap.ticker` callback (policy 3 — no extra rAF
 *   source); the driver's fps gate keeps the work identical.
 *
 * Runtime API: dispatch a {@link NIGHT_SKY_EVENT} CustomEvent on `window`
 * with a {@link NightSkyEventDetail} to drive the opt-in day/night blend or
 * the animation master switch from anywhere (no island prop drilling).
 *
 * Default behaviour per the approved settings: fixed night start, 10 fps
 * idle loop, 30 fps lift during the manual day/night fade.
 */
export function BackgroundScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setupMotion();

    let worker: Worker | null = null;
    let fallbackScene: NightSkyScene | null = null;
    let fallbackDriver: NightSkyDriver | null = null;
    let fallbackTick: (() => void) | null = null;
    let observer: ResizeObserver | null = null;
    let resizeQueued = false;
    let disposed = false;

    const reducedMotionQuery =
      typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

    /** Fades the ready canvas in over the CSS layer (instant under reduced motion). */
    const revealCanvas = () => {
      if (disposed) return;
      if (prefersReducedMotion()) {
        canvas.style.opacity = "1";
        return;
      }
      gsap.to(canvas, { opacity: 1, duration: CANVAS_FADE_IN_SECONDS, ease: MotionEase.McFade });
    };

    const cssSize = () => ({
      width: Math.max(1, canvas.clientWidth),
      height: Math.max(1, canvas.clientHeight),
      pixelRatio: window.devicePixelRatio || 1,
    });

    const postResize = () => {
      const { width, height, pixelRatio } = cssSize();
      if (worker) {
        worker.postMessage({
          type: NightSkyMessageType.Resize,
          cssWidth: width,
          cssHeight: height,
          pixelRatio,
        } satisfies NightSkyMessage);
      } else if (fallbackScene && fallbackDriver) {
        fallbackScene.resize(width, height, fallbackDriver.settings.renderScale * Math.min(pixelRatio, 2));
        fallbackDriver.requestRedraw();
      }
    };

    /** rAF-coalesced resize forwarding (no message bursts while dragging). */
    const queueResize = () => {
      if (resizeQueued) return;
      resizeQueued = true;
      requestAnimationFrame(() => {
        resizeQueued = false;
        if (!disposed) postResize();
      });
    };

    const handleVisibility = () => {
      const visible = document.visibilityState === "visible";
      if (worker) {
        worker.postMessage({ type: NightSkyMessageType.Visibility, visible } satisfies NightSkyMessage);
      } else {
        fallbackDriver?.setVisible(visible);
      }
    };

    const handleReducedMotion = () => {
      const reduced = reducedMotionQuery?.matches ?? false;
      if (worker) {
        worker.postMessage({ type: NightSkyMessageType.ReducedMotion, reduced } satisfies NightSkyMessage);
      } else {
        fallbackDriver?.setReducedMotion(reduced);
      }
    };

    const handleApiEvent = (event: Event) => {
      const detail = (event as CustomEvent<NightSkyEventDetail>).detail;
      if (!detail) return;
      if (typeof detail.dayness === "number") {
        const animated = detail.animated !== false;
        if (worker) {
          worker.postMessage({
            type: NightSkyMessageType.SetDayness,
            dayness: detail.dayness,
            animated,
          } satisfies NightSkyMessage);
        } else {
          fallbackDriver?.setDayness(detail.dayness, { animated });
        }
      }
      if (typeof detail.animate === "boolean") {
        if (worker) {
          worker.postMessage({
            type: NightSkyMessageType.SetAnimate,
            animate: detail.animate,
          } satisfies NightSkyMessage);
        } else {
          fallbackDriver?.setAnimate(detail.animate);
        }
      }
    };

    /** Worker path: transfer the canvas, then only post primitives. */
    const bootWorker = () => {
      const offscreen = canvas.transferControlToOffscreen();
      worker = new Worker(new URL("./nightSky/worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent<NightSkyWorkerEventMessage>) => {
        if (event.data.type === NightSkyWorkerEvent.Ready) revealCanvas();
        // On `failed` the canvas simply stays transparent — CSS layer remains.
      };
      const { width, height, pixelRatio } = cssSize();
      worker.postMessage(
        {
          type: NightSkyMessageType.Init,
          canvas: offscreen,
          cssWidth: width,
          cssHeight: height,
          pixelRatio,
          reducedMotion: reducedMotionQuery?.matches ?? false,
          settings: NIGHT_SKY_DEFAULTS,
        } satisfies NightSkyMessage,
        [offscreen],
      );
    };

    /** Fallback path (no OffscreenCanvas WebGL): same code, gsap.ticker-scheduled. */
    const bootFallback = () => {
      const settings: NightSkySettings = { ...NIGHT_SKY_DEFAULTS };
      fallbackScene = createNightSkyScene(canvas, settings, { onContextLost: () => undefined });
      if (!fallbackScene) return; // no WebGL2 → CSS layer stays
      fallbackDriver = new NightSkyDriver(fallbackScene, settings);
      fallbackDriver.setReducedMotion(reducedMotionQuery?.matches ?? false);
      const { width, height, pixelRatio } = cssSize();
      fallbackScene.resize(width, height, settings.renderScale * Math.min(pixelRatio, 2));
      fallbackTick = () => fallbackDriver?.tick(performance.now());
      gsap.ticker.add(fallbackTick);
      fallbackDriver.tick(performance.now()); // first frame before the reveal
      revealCanvas();
    };

    const cancelIdle = scheduleIdle(() => {
      if (disposed) return;
      if (typeof canvas.transferControlToOffscreen === "function" && typeof Worker === "function") {
        bootWorker();
      } else {
        bootFallback();
      }
      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(queueResize);
        observer.observe(canvas);
      }
      document.addEventListener("visibilitychange", handleVisibility);
      reducedMotionQuery?.addEventListener?.("change", handleReducedMotion);
      window.addEventListener(NIGHT_SKY_EVENT, handleApiEvent);
    });

    return () => {
      disposed = true;
      cancelIdle();
      observer?.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
      reducedMotionQuery?.removeEventListener?.("change", handleReducedMotion);
      window.removeEventListener(NIGHT_SKY_EVENT, handleApiEvent);
      if (fallbackTick) gsap.ticker.remove(fallbackTick);
      fallbackScene?.dispose();
      worker?.terminate();
    };
  }, []);

  // No aria-hidden here: the GradientBackground container already hides the
  // whole background layer from the accessibility tree.
  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full opacity-0" data-mc-night-sky />;
}
