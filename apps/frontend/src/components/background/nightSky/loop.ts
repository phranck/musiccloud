import { DAY_FADE_FPS, daynessForLocalTime, type NightSkySettings, smooth01 } from "./settings";

/**
 * The slice of the scene the driver needs — kept minimal so tests can pass
 * a plain mock and the GL implementation stays swappable (worker + fallback).
 */
export interface DrawableScene {
  /** Renders one frame at the given animation time (seconds). */
  draw(simTimeSeconds: number): void;
}

/** Running manual day/night fade; `startMs` anchors on the first tick after start. */
interface DayFade {
  from: number;
  to: number;
  startMs: number | null;
}

/**
 * Shared frame driver of the night-sky background (plan MC-029 Phase 4).
 * Runs identically inside the render worker (scheduled by the worker's own
 * rAF) and in the main-thread fallback (scheduled by a `gsap.ticker`
 * callback — policy 3: no extra rAF source on the main thread). It owns the
 * loop POLICY, not the scheduling:
 *
 * - fps gating at `settings.fpsCap` (production default 7);
 * - the temporary {@link DAY_FADE_FPS} lift while a manual day/night fade
 *   runs (user decision: a 1 s fade at 10 fps would look steppy);
 * - `animate` off → one initial still frame, afterwards zero draws unless
 *   something requests a repaint (tuning, resize, fade, auto-clock step);
 * - reduced motion → exactly one static frame (WCAG; the scene's slow
 *   drift counts as motion);
 * - hidden tab → no work at all, repaint on return;
 * - the opt-in local-time automatic (`autoDayNight`), stepping the day
 *   blend roughly once a minute during twilight.
 *
 * Zero-allocation contract (policy 7): `tick` allocates nothing on the
 * steady-state path — all state lives in primitives on the instance.
 */
export class NightSkyDriver {
  /**
   * Live settings instance. The driver takes OWNERSHIP of the passed object
   * (no copy) and mutates it through the setters/fade — deliberately, so the
   * GL scene can hold the very same reference and always render the current
   * values without any per-frame synchronisation.
   */
  readonly settings: NightSkySettings;

  private readonly scene: DrawableScene;
  private simTime = 0;
  private lastTickMs: number | null = null;
  private lastDrawMs: number | null = null;
  private fade: DayFade | null = null;
  private needsRedraw = true; // the very first frame always draws
  private reducedMotion = false;
  private visible = true;

  /** Optional reverse-publish sink for the live day amount (see {@link publishDayness}). */
  private readonly onDayness?: (dayness: number) => void;
  /** Last value handed to {@link onDayness}; `NaN` forces the first publish. */
  private lastPublishedDayness = Number.NaN;
  /** Minimum day-amount delta that triggers a reverse publish (sub-step changes are skipped). */
  private static readonly DAYNESS_EPSILON = 0.001;

  /**
   * @param scene - Render sink (the GL scene, or a mock in tests).
   * @param settings - Settings instance the driver takes ownership of.
   * @param onDayness - Optional change-gated sink for the live day amount. The
   *   driver calls it with a bare number (zero allocation on the loop side) only
   *   when `dayness` actually moves — never per idle frame. The worker forwards
   *   it as a reverse `Dayness` message; the fallback path writes `--g-dayness`
   *   directly. Omit it (tests, headless) to disable the channel.
   */
  constructor(scene: DrawableScene, settings: NightSkySettings, onDayness?: (dayness: number) => void) {
    this.scene = scene;
    this.settings = settings;
    this.onDayness = onDayness;
  }

  /**
   * Advances the loop. Call once per scheduler tick with a monotonic
   * millisecond timestamp; the driver decides whether a frame is drawn.
   */
  tick(nowMs: number): void {
    const dtMs = this.lastTickMs == null ? 0 : nowMs - this.lastTickMs;
    this.lastTickMs = nowMs;
    if (!this.visible) return;

    this.tickFade(nowMs);
    this.tickAutoClock();
    this.publishDayness();

    const animating = this.settings.animate === 1 && !this.reducedMotion;
    if (animating) this.simTime += dtMs / 1000;

    // Manual fade temporarily lifts the cap so the blend stays smooth.
    const effectiveFps = this.fade ? Math.max(this.settings.fpsCap, DAY_FADE_FPS) : this.settings.fpsCap;
    const intervalMs = 1000 / effectiveFps;
    if (this.lastDrawMs != null && nowMs - this.lastDrawMs < intervalMs - 1) return;
    if (!animating && !this.needsRedraw && !this.fade) return;

    this.commitDraw(nowMs);
  }

  /**
   * Sets (or fades to) a new day amount. Under reduced motion the value
   * always snaps — the fade is an animation.
   *
   * @param target - Day amount in [0, 1].
   * @param options.animated - Play the boosted fade over `dayTransition` s.
   */
  setDayness(target: number, options: { animated: boolean }): void {
    const clamped = Math.max(0, Math.min(1, target));
    if (options.animated && !this.reducedMotion) {
      this.fade = { from: this.settings.dayness, to: clamped, startMs: null };
      return;
    }
    this.fade = null;
    this.settings.dayness = clamped;
    this.needsRedraw = true;
  }

  /** Master animation switch; turning it back on resumes from the frozen moment. */
  setAnimate(on: boolean): void {
    this.settings.animate = on ? 1 : 0;
    this.needsRedraw = true;
  }

  /**
   * Runtime switch of the local-clock automatic (plan MC-030). Enabling
   * fades to whatever the wall clock dictates right now — the fade guard in
   * {@link tickAutoClock} pauses the clock until the blend settles, then the
   * clock takes over seamlessly. Under reduced motion the value snaps (the
   * fade is an animation). Disabling only clears the flag and leaves
   * `dayness` untouched: the follow-up target is the bridge's separate
   * `setDayness` call, so the two transitions never fight.
   *
   * @param enabled - Whether the day blend should follow the local clock.
   */
  setAutoDayNight(enabled: boolean): void {
    this.settings.autoDayNight = enabled ? 1 : 0;
    if (!enabled) return;
    const target = this.clockDayness();
    if (target !== this.settings.dayness) this.setDayness(target, { animated: true });
  }

  /** Reduced-motion preference: cancels fades and pins the scene to one static frame. */
  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    if (reduced && this.fade) {
      this.settings.dayness = this.fade.to;
      this.fade = null;
    }
    this.needsRedraw = true;
  }

  /** Tab visibility: hidden skips all work; returning repaints once immediately. */
  setVisible(visible: boolean): void {
    this.visible = visible;
    if (visible) this.needsRedraw = true;
  }

  /** Requests a one-shot repaint (resize, external tuning) without enabling animation. */
  requestRedraw(): void {
    this.needsRedraw = true;
  }

  /**
   * Draws one frame IMMEDIATELY, bypassing the fps gate, and re-anchors the
   * gate on `nowMs`. Used right after a resize: `scene.resize()` reallocates
   * and CLEARS the GL drawing buffer, so with the context's `alpha: false` the
   * canvas would show an opaque-black surface until the next gated tick — up to
   * one fps interval later (~143 ms at the production cap of 7). Painting in the
   * SAME task as the resize closes that gap: the compositor only ever sees the
   * freshly redrawn buffer, so dragging the window edge never flashes black.
   *
   * Skips the paint while the tab is hidden (like {@link tick}); `setVisible`
   * repaints on return. Re-anchoring `lastDrawMs` keeps the following scheduled
   * tick on the fps interval instead of drawing a second time straight away.
   *
   * @param nowMs - Monotonic timestamp (worker rAF / `performance.now()`) the
   *   fps gate re-anchors on.
   */
  redrawNow(nowMs: number): void {
    if (!this.visible) {
      this.needsRedraw = true;
      return;
    }
    this.commitDraw(nowMs);
  }

  /**
   * Commits one frame: clears the pending-redraw flag, re-anchors the fps gate
   * on `nowMs`, and draws at the current sim time. The single source of truth
   * for "a frame was drawn", shared by the gated {@link tick} path and the
   * gate-bypassing {@link redrawNow}, so the draw invariant (clear flag +
   * anchor gate + draw) can never drift between the two call sites. The gates
   * (visibility, fps cap) stay at the call site; this only commits.
   *
   * @param nowMs - Monotonic timestamp the fps gate re-anchors on.
   */
  private commitDraw(nowMs: number): void {
    this.needsRedraw = false;
    this.lastDrawMs = nowMs;
    this.scene.draw(this.simTime);
  }

  /** Advances a running manual fade (smoothstepped over `dayTransition` seconds). */
  private tickFade(nowMs: number): void {
    if (!this.fade) return;
    if (this.fade.startMs == null) this.fade.startMs = nowMs;
    const t = (nowMs - this.fade.startMs) / (this.settings.dayTransition * 1000);
    this.settings.dayness = this.fade.from + (this.fade.to - this.fade.from) * smooth01(t);
    if (t >= 1) {
      this.settings.dayness = this.fade.to;
      this.fade = null;
      this.needsRedraw = true; // settle frame at the exact target
    }
  }

  /** Follows the local clock while the opt-in automatic is on (no fade running). */
  private tickAutoClock(): void {
    if (this.settings.autoDayNight !== 1 || this.fade) return;
    const target = this.clockDayness();
    if (target !== this.settings.dayness) {
      this.settings.dayness = target;
      this.needsRedraw = true;
    }
  }

  /**
   * Reverse-publishes the live day amount when it has moved enough to matter.
   * Runs every tick (so snaps and fade steps are both caught) but invokes the
   * sink only on a meaningful change — preserving the zero-allocation idle
   * path: no fade and no clock step means `dayness` is stable, so no call and
   * no message. A settled fade publishes the exact target (`fade === null`
   * branch) so the glass lands on the precise endpoint.
   */
  private publishDayness(): void {
    if (!this.onDayness) return;
    const d = this.settings.dayness;
    const last = this.lastPublishedDayness;
    const moved =
      Number.isNaN(last) || Math.abs(d - last) >= NightSkyDriver.DAYNESS_EPSILON || (this.fade === null && d !== last);
    if (!moved) return;
    this.lastPublishedDayness = d;
    this.onDayness(d);
  }

  /**
   * Day amount the local wall clock dictates right now, in 2-decimal steps —
   * the shared quantisation of the clock follower and the enable fade, so
   * the fade target and the first clock step never differ by a sub-step.
   */
  private clockDayness(): number {
    return Math.round(daynessForLocalTime(new Date(), this.settings) * 100) / 100;
  }
}
