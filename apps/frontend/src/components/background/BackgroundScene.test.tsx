import { act, render } from "@testing-library/react";
import gsap from "gsap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearSpectrumFrame, publishSpectrumFrame, writeSpectrumLevels } from "@/components/audio/spectrumStore";
import { BackgroundScene } from "@/components/background/BackgroundScene";
import { NightSkyMessageType, NightSkyWorkerEvent } from "@/components/background/nightSky/protocol";
import { createNightSkyScene } from "@/components/background/nightSky/scene";

/**
 * Bridge-wiring contract of the BackgroundScene island (plan MC-029 Phase
 * 4). jsdom has neither WebGL nor real workers, so a mocked Worker pins the
 * protocol: the one-time init with the transferred OffscreenCanvas and the
 * production settings, resize forwarding, visibility forwarding, the
 * canvas fade-in on `ready` (never before — a black canvas must stay
 * invisible), and `terminate()` on unmount.
 *
 * The main-thread fallback (no `transferControlToOffscreen`, Safari < 17)
 * is pinned here too — the browser-side feature detection cannot be forced
 * off against a real build (no init-script hook in the tooling), so this is
 * the canonical proof of that branch. The GL code itself is shared with the
 * browser-verified worker path.
 */

/** Controllable result of the mocked scene factory (per-test override). */
const sceneFactory = vi.hoisted(() => ({
  result: null as { draw: () => void; resize: () => void; dispose: () => void } | null,
}));

vi.mock("@/components/background/nightSky/scene", () => ({
  createNightSkyScene: vi.fn(() => sceneFactory.result),
}));

/** Captured constructor calls + a controllable mock instance. */
const workerInstances: MockWorker[] = [];

class MockWorker {
  readonly url: URL;
  readonly options: WorkerOptions | undefined;
  readonly posted: Array<{ message: unknown; transfer?: Transferable[] }> = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  terminated = false;

  constructor(url: URL, options?: WorkerOptions) {
    this.url = url;
    this.options = options;
    workerInstances.push(this);
  }

  postMessage(message: unknown, transfer?: Transferable[]): void {
    this.posted.push({ message, transfer });
  }

  terminate(): void {
    this.terminated = true;
  }

  /** Simulates a worker→bridge event. */
  emit(data: unknown): void {
    this.onmessage?.({ data });
  }
}

/** Marker object standing in for the transferred OffscreenCanvas. */
const FAKE_OFFSCREEN = { __offscreen: true };

beforeEach(() => {
  workerInstances.length = 0;
  sceneFactory.result = null;
  vi.mocked(createNightSkyScene).mockClear();
  vi.stubGlobal("Worker", MockWorker);
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList),
  );
  // requestIdleCallback is absent in Safari < 18 AND jsdom — the island must
  // boot through its setTimeout fallback; run timers synchronously here.
  vi.useFakeTimers();
  HTMLCanvasElement.prototype.transferControlToOffscreen = vi
    .fn()
    .mockReturnValue(FAKE_OFFSCREEN as unknown as OffscreenCanvas);
});

afterEach(() => {
  gsap.globalTimeline.getChildren(true, true, true).forEach((animation) => animation.kill());
  vi.useRealTimers();
  vi.unstubAllGlobals();
  clearSpectrumFrame(); // module singleton — do not leak frames between tests
  // @ts-expect-error cleanup of the prototype stub
  delete HTMLCanvasElement.prototype.transferControlToOffscreen;
});

function bootIsland() {
  const utils = render(<BackgroundScene />);
  act(() => {
    vi.runAllTimers(); // fires the idle/setTimeout boot
  });
  return utils;
}

describe("BackgroundScene bridge", () => {
  it("boots a module worker and transfers the OffscreenCanvas in the init message", () => {
    bootIsland();
    expect(workerInstances).toHaveLength(1);
    const worker = workerInstances[0];
    expect(worker.options?.type).toBe("module");

    expect(worker.posted).toHaveLength(1);
    const init = worker.posted[0];
    const message = init.message as { type: string; canvas: unknown; settings: { fpsCap: number } };
    expect(message.type).toBe(NightSkyMessageType.Init);
    expect(message.canvas).toBe(FAKE_OFFSCREEN);
    expect(init.transfer).toContain(FAKE_OFFSCREEN);
    // Production settings ride along (spot check the approved fps cap).
    expect(message.settings.fpsCap).toBe(10);
  });

  it("keeps the canvas invisible until the worker reports ready, then fades it in", () => {
    const { container } = bootIsland();
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    expect(gsap.getTweensOf(canvas)).toHaveLength(0);

    act(() => {
      workerInstances[0].emit({ type: NightSkyWorkerEvent.Ready });
    });
    expect(gsap.getTweensOf(canvas).length).toBeGreaterThan(0);
  });

  it("forwards tab visibility changes", () => {
    bootIsland();
    const worker = workerInstances[0];
    act(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    const visibilityMessages = worker.posted
      .map((p) => p.message as { type: string; visible?: boolean })
      .filter((m) => m.type === NightSkyMessageType.Visibility);
    expect(visibilityMessages.at(-1)?.visible).toBe(false);
  });

  it("terminates the worker on unmount", () => {
    const { unmount } = bootIsland();
    unmount();
    expect(workerInstances[0].terminated).toBe(true);
  });

  it("forwards spectrum publishes as throttled audio-level messages (RMS of both channels)", () => {
    bootIsland();
    const worker = workerInstances[0];
    act(() => {
      writeSpectrumLevels(0.6, 0.8);
      publishSpectrumFrame();
    });
    const audioMessages = worker.posted
      .map((p) => p.message as { type: string; level?: number; active?: boolean })
      .filter((m) => m.type === NightSkyMessageType.SetAudioLevel);
    expect(audioMessages).toHaveLength(1);
    // RMS of (0.6, 0.8) = sqrt((0.36 + 0.64) / 2) ≈ 0.7071
    expect(audioMessages[0].level).toBeCloseTo(Math.SQRT1_2, 3);
    expect(audioMessages[0].active).toBe(true);

    act(() => {
      clearSpectrumFrame();
    });
    const afterClear = worker.posted
      .map((p) => p.message as { type: string; level?: number; active?: boolean })
      .filter((m) => m.type === NightSkyMessageType.SetAudioLevel);
    expect(afterClear).toHaveLength(2);
    expect(afterClear[1].level).toBe(0);
    expect(afterClear[1].active).toBe(false);
  });

  it("does not forward audio levels under reduced motion", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: true, // prefers-reduced-motion: reduce
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as unknown as MediaQueryList),
    );
    bootIsland();
    const worker = workerInstances[0];
    act(() => {
      writeSpectrumLevels(0.9, 0.9);
      publishSpectrumFrame();
    });
    const audioMessages = worker.posted
      .map((p) => p.message as { type: string })
      .filter((m) => m.type === NightSkyMessageType.SetAudioLevel);
    expect(audioMessages).toHaveLength(0);
  });
});

describe("BackgroundScene main-thread fallback", () => {
  /** Removes the worker-path stub so the feature detection picks the fallback. */
  function forceFallback() {
    // @ts-expect-error remove the prototype stub installed by beforeEach
    delete HTMLCanvasElement.prototype.transferControlToOffscreen;
  }

  it("runs scene + driver on gsap.ticker and cleans both up on unmount", () => {
    forceFallback();
    const scene = { draw: vi.fn(), resize: vi.fn(), dispose: vi.fn() };
    sceneFactory.result = scene;
    const tickerAdd = vi.spyOn(gsap.ticker, "add");
    const tickerRemove = vi.spyOn(gsap.ticker, "remove");

    const { container, unmount } = bootIsland();
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;

    expect(workerInstances).toHaveLength(0);
    expect(createNightSkyScene).toHaveBeenCalledWith(
      canvas,
      expect.objectContaining({ fpsCap: 10 }),
      expect.anything(),
    );
    expect(scene.draw).toHaveBeenCalled(); // first frame renders before the reveal
    expect(gsap.getTweensOf(canvas).length).toBeGreaterThan(0); // reveal fade started
    expect(tickerAdd).toHaveBeenCalledTimes(1);
    const tick = tickerAdd.mock.calls[0][0];

    unmount();
    expect(tickerRemove).toHaveBeenCalledWith(tick);
    expect(scene.dispose).toHaveBeenCalledTimes(1);
    tickerAdd.mockRestore();
    tickerRemove.mockRestore();
  });

  it("keeps the CSS layer when WebGL is unavailable", () => {
    forceFallback();
    sceneFactory.result = null; // createNightSkyScene: no WebGL2 context
    const { container, unmount } = bootIsland();
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;

    expect(workerInstances).toHaveLength(0);
    expect(gsap.getTweensOf(canvas)).toHaveLength(0); // canvas stays transparent
    unmount(); // no crash without a scene
  });
});
