import type { ShaderTokens } from "@musiccloud/shared";
import gsap from "gsap";
import { useEffect, useRef } from "react";
import { DayNightMode, getDayNightMode, subscribeDayNightMode } from "@/components/background/dayNightMode";
import { daynessForMode } from "@/components/background/dayNightPolicy";
import { publishGlassDayness } from "@/components/background/glassDayness";
import { NightSkyDriver } from "@/components/background/nightSky/loop";
import {
  type NightSkyMessage,
  NightSkyMessageType,
  NightSkyWorkerEvent,
  type NightSkyWorkerEventMessage,
} from "@/components/background/nightSky/protocol";
import { createNightSkyScene, type NightSkyScene } from "@/components/background/nightSky/scene";
import { NIGHT_SKY_DEFAULTS, NIGHT_SKY_RANGES, type NightSkySettings } from "@/components/background/nightSky/settings";
import { MotionEase } from "@/lib/motion/constants";
import { prefersReducedMotion, setupMotion } from "@/lib/motion/setup";

/** Seconds the canvas takes to fade in over the base background color once the first frame is ready. */
const CANVAS_FADE_IN_SECONDS = 1.2;

/** Sky settings the day-night mode owns — never seeded from the saved token blob. */
const MODE_OWNED_SKY_KEYS = new Set<string>(["dayness", "autoDayNight"]);

/** Hex-colour sky settings (everything else in NIGHT_SKY_RANGES is numeric). */
const SKY_COLOR_KEYS = ["skyTop", "skyBottom", "skyTopDay", "skyBottomDay", "cloudColor", "cloudColorDay"] as const;

/**
 * Overlays the saved shader tokens onto the night-sky defaults: each numeric
 * value is clamped against {@link NIGHT_SKY_RANGES} (the sky's own authoritative
 * bounds, which the validated token blob may exceed), colours are copied
 * verbatim, and the mode-owned keys ({@link MODE_OWNED_SKY_KEYS}) are skipped so
 * the day-night store stays the single source of `dayness`/`autoDayNight`.
 *
 * @param base The compiled-in production defaults.
 * @param shader The saved shader tokens, or `undefined` to use `base` as-is.
 * @returns A fresh settings object safe to hand to the driver.
 */
function mergeShaderTokens(base: NightSkySettings, shader: ShaderTokens | undefined): NightSkySettings {
  if (!shader) return base;
  const merged: NightSkySettings = { ...base };
  for (const key of Object.keys(NIGHT_SKY_RANGES) as (keyof typeof NIGHT_SKY_RANGES)[]) {
    if (MODE_OWNED_SKY_KEYS.has(key)) continue;
    const raw = (shader as Record<string, unknown>)[key];
    if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
    const { min, max } = NIGHT_SKY_RANGES[key];
    (merged as unknown as Record<string, number>)[key] = Math.min(max, Math.max(min, raw));
  }
  for (const key of SKY_COLOR_KEYS) {
    const raw = shader[key];
    if (typeof raw === "string") merged[key] = raw;
  }
  return merged;
}

/** Boot delay fallback for browsers without requestIdleCallback (Safari < 18). */
const IDLE_FALLBACK_MS = 200;

/** Media query the System day-night mode follows (dark = night sky). */
const DARK_SCHEME_QUERY = "(prefers-color-scheme: dark)";

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
 * base background color and only fades in once the FIRST frame has been
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
 * Day-night mode (plan MC-030): the island consumes the shared
 * `dayNightMode` store — the boot settings reflect the stored mode so the
 * very first frame is correct, and later store changes translate into
 * `SetAutoDayNight`/`SetDayness` messages (worker) or the equivalent driver
 * calls (fallback). In System mode a `prefers-color-scheme` listener plays
 * live OS theme flips as animated fades.
 *
 * Default behaviour per the approved settings: fixed night start, 8 fps
 * idle loop, 30 fps lift during the manual day/night fade.
 */
export function BackgroundScene({ shaderTokens }: { shaderTokens?: ShaderTokens }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Captured once from the SSR prop (stable across the island's lifetime); read
  // inside the boot effect without widening its dependency list.
  const shaderTokensRef = useRef(shaderTokens);

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
    const darkSchemeQuery = typeof window.matchMedia === "function" ? window.matchMedia(DARK_SCHEME_QUERY) : null;

    /** Live OS dark preference (the System mode's input). */
    const prefersDark = () => darkSchemeQuery?.matches ?? false;

    /**
     * Boot settings reflecting the STORED mode, so the very first rendered
     * frame already matches it (no visible catch-up fade after the reveal).
     */
    const initialModeSettings = (): NightSkySettings => {
      const mode = getDayNightMode();
      return {
        ...mergeShaderTokens(NIGHT_SKY_DEFAULTS, shaderTokensRef.current),
        autoDayNight: mode === DayNightMode.Automatic ? 1 : 0,
        dayness: daynessForMode(mode, { prefersDark: prefersDark(), date: new Date() }),
      };
    };

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
        // Same-task repaint so the freshly cleared buffer never flashes black
        // (see NightSkyDriver.redrawNow).
        fallbackDriver.redrawNow(performance.now());
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

    /**
     * Translates a mode change into scene updates. Fixed modes disable the
     * automatic FIRST, then play the animated fade to their target — in this
     * order the driver never runs a clock step against the outgoing fade.
     * Automatic only enables the clock: the driver fades to the current
     * clock value itself (see NightSkyDriver.setAutoDayNight).
     */
    const applyMode = (mode: DayNightMode) => {
      if (mode === DayNightMode.Automatic) {
        if (worker) {
          worker.postMessage({ type: NightSkyMessageType.SetAutoDayNight, enabled: true } satisfies NightSkyMessage);
        } else {
          fallbackDriver?.setAutoDayNight(true);
        }
        return;
      }
      const dayness = daynessForMode(mode, { prefersDark: prefersDark(), date: new Date() });
      if (worker) {
        worker.postMessage({ type: NightSkyMessageType.SetAutoDayNight, enabled: false } satisfies NightSkyMessage);
        worker.postMessage({ type: NightSkyMessageType.SetDayness, dayness, animated: true } satisfies NightSkyMessage);
      } else if (fallbackDriver) {
        fallbackDriver.setAutoDayNight(false);
        fallbackDriver.setDayness(dayness, { animated: true });
      }
    };

    /** Plays live OS theme flips as animated fades — only while in System mode. */
    const handleSchemeChange = () => {
      if (getDayNightMode() !== DayNightMode.System) return;
      const dayness = daynessForMode(DayNightMode.System, { prefersDark: prefersDark(), date: new Date() });
      if (worker) {
        worker.postMessage({ type: NightSkyMessageType.SetDayness, dayness, animated: true } satisfies NightSkyMessage);
      } else {
        fallbackDriver?.setDayness(dayness, { animated: true });
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
        const data = event.data;
        if (data.type === NightSkyWorkerEvent.Ready) revealCanvas();
        else if (data.type === NightSkyWorkerEvent.Dayness) publishGlassDayness(data.dayness);
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
          settings: initialModeSettings(),
        } satisfies NightSkyMessage,
        [offscreen],
      );
    };

    /** Fallback path (no OffscreenCanvas WebGL): same code, gsap.ticker-scheduled. */
    const bootFallback = () => {
      const settings: NightSkySettings = initialModeSettings();
      fallbackScene = createNightSkyScene(canvas, settings, { onContextLost: () => undefined });
      if (!fallbackScene) return; // no WebGL2 → CSS layer stays
      fallbackDriver = new NightSkyDriver(fallbackScene, settings, publishGlassDayness);
      fallbackDriver.setReducedMotion(reducedMotionQuery?.matches ?? false);
      const { width, height, pixelRatio } = cssSize();
      fallbackScene.resize(width, height, settings.renderScale * Math.min(pixelRatio, 2));
      fallbackTick = () => fallbackDriver?.tick(performance.now());
      gsap.ticker.add(fallbackTick);
      fallbackDriver.tick(performance.now()); // first frame before the reveal
      revealCanvas();
    };

    let unsubscribeMode: (() => void) | null = null;

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
      darkSchemeQuery?.addEventListener?.("change", handleSchemeChange);
      window.addEventListener(NIGHT_SKY_EVENT, handleApiEvent);
      // Boot read the store synchronously above, so subscribing afterwards
      // cannot miss a change in between.
      unsubscribeMode = subscribeDayNightMode(applyMode);
    });

    return () => {
      disposed = true;
      cancelIdle();
      observer?.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
      reducedMotionQuery?.removeEventListener?.("change", handleReducedMotion);
      darkSchemeQuery?.removeEventListener?.("change", handleSchemeChange);
      window.removeEventListener(NIGHT_SKY_EVENT, handleApiEvent);
      unsubscribeMode?.();
      if (fallbackTick) gsap.ticker.remove(fallbackTick);
      fallbackScene?.dispose();
      worker?.terminate();
    };
  }, []);

  // No aria-hidden here: the NightSkyBackground container already hides the
  // whole background layer from the accessibility tree.
  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full opacity-0" data-mc-night-sky />;
}
