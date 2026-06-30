import { act, render } from "@testing-library/react";
import gsap from "gsap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackgroundScene } from "@/components/background/BackgroundScene";
import { DayNightMode, setDayNightMode } from "@/components/background/dayNightMode";
import { NightSkyMessageType, NightSkyWorkerEvent } from "@/components/background/nightSky/protocol";
import { createNightSkyScene } from "@/components/background/nightSky/scene";
import type { NightSkySettings } from "@/components/background/nightSky/settings";

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

const DARK_SCHEME_QUERY = "(prefers-color-scheme: dark)";

/** One controllable media-query record of the matchMedia stub. */
interface MediaStubEntry {
  matches: boolean;
  listeners: Set<(event: { matches: boolean }) => void>;
}

let mediaQueries: Map<string, MediaStubEntry>;

/**
 * matchMedia stub with per-query state: the day-night System mode listens on
 * `(prefers-color-scheme: dark)` while reduced-motion keeps its own query, so
 * a single shared `matches` value would conflate the two. Tests flip a query
 * via {@link setMediaMatches}, which also fires its registered listeners.
 */
function installMatchMediaStub(): void {
  const queries = new Map<string, MediaStubEntry>();
  mediaQueries = queries;
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => {
      let entry = queries.get(query);
      if (!entry) {
        entry = { matches: false, listeners: new Set() };
        queries.set(query, entry);
      }
      const stable = entry;
      return {
        get matches() {
          return stable.matches;
        },
        media: query,
        addEventListener: (_type: string, listener: (event: { matches: boolean }) => void) =>
          stable.listeners.add(listener),
        removeEventListener: (_type: string, listener: (event: { matches: boolean }) => void) =>
          stable.listeners.delete(listener),
      } as unknown as MediaQueryList;
    }),
  );
}

/** Flips a stubbed media query and notifies its listeners (OS theme change). */
function setMediaMatches(query: string, value: boolean): void {
  const entry = mediaQueries.get(query);
  if (!entry) throw new Error(`no media query registered for: ${query}`);
  entry.matches = value;
  entry.listeners.forEach((listener) => listener({ matches: value }));
}

beforeEach(() => {
  workerInstances.length = 0;
  sceneFactory.result = null;
  vi.mocked(createNightSkyScene).mockClear();
  vi.stubGlobal("Worker", MockWorker);
  installMatchMediaStub();
  // requestIdleCallback is absent in Safari < 18 AND jsdom — the island must
  // boot through its setTimeout fallback; run timers synchronously here.
  vi.useFakeTimers();
  HTMLCanvasElement.prototype.transferControlToOffscreen = vi
    .fn()
    .mockReturnValue(FAKE_OFFSCREEN as unknown as OffscreenCanvas);
});

afterEach(() => {
  gsap.globalTimeline.getChildren(true, true, true).forEach((animation) => animation.kill());
  // Reset the module-level mode store so no test leaks its mode (the store
  // is shared across this file's tests exactly like across real islands).
  setDayNightMode(DayNightMode.Night);
  vi.useRealTimers();
  vi.unstubAllGlobals();
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
    expect(message.settings.fpsCap).toBe(8);
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
    expect(createNightSkyScene).toHaveBeenCalledWith(canvas, expect.objectContaining({ fpsCap: 8 }), expect.anything());
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

  it("applies mode changes to the fallback driver settings", () => {
    forceFallback();
    sceneFactory.result = { draw: vi.fn(), resize: vi.fn(), dispose: vi.fn() };
    bootIsland(); // stored default: Night

    // The driver owns the very settings object the scene factory received —
    // its mutations are the observable proxy for the driver-path calls.
    const settings = vi.mocked(createNightSkyScene).mock.calls[0][1] as NightSkySettings;
    expect(settings.autoDayNight).toBe(0);

    act(() => {
      setDayNightMode(DayNightMode.Automatic);
    });
    expect(settings.autoDayNight).toBe(1);

    act(() => {
      setDayNightMode(DayNightMode.Night);
    });
    expect(settings.autoDayNight).toBe(0);
  });
});

describe("BackgroundScene day-night mode (plan MC-030)", () => {
  /** Messages posted AFTER the init message, type/payload only. */
  function postedAfterInit(worker: MockWorker): unknown[] {
    return worker.posted.slice(1).map((entry) => entry.message);
  }

  it("boots with the stored Day mode applied to the init settings", () => {
    setDayNightMode(DayNightMode.Day);
    bootIsland();
    const init = workerInstances[0].posted[0].message as { settings: NightSkySettings };
    expect(init.settings.dayness).toBe(1);
    expect(init.settings.autoDayNight).toBe(0);
  });

  it("boots the Automatic mode with the clock dayness and the automatic enabled", () => {
    vi.setSystemTime(new Date(2026, 5, 13, 12, 0, 0)); // noon → clock dayness 1
    setDayNightMode(DayNightMode.Automatic);
    bootIsland();
    const init = workerInstances[0].posted[0].message as { settings: NightSkySettings };
    expect(init.settings.autoDayNight).toBe(1);
    expect(init.settings.dayness).toBe(1); // first frame already matches the clock
  });

  it("posts automatic-off before the animated dayness fade on a fixed-mode change", () => {
    bootIsland(); // stored default: Night
    act(() => {
      setDayNightMode(DayNightMode.Day);
    });
    expect(postedAfterInit(workerInstances[0])).toEqual([
      { type: NightSkyMessageType.SetAutoDayNight, enabled: false },
      { type: NightSkyMessageType.SetDayness, dayness: 1, animated: true },
    ]);
  });

  it("posts only the automatic enable on switching to Automatic", () => {
    bootIsland();
    act(() => {
      setDayNightMode(DayNightMode.Automatic);
    });
    expect(postedAfterInit(workerInstances[0])).toEqual([{ type: NightSkyMessageType.SetAutoDayNight, enabled: true }]);
  });

  it("follows live OS scheme changes in System mode only", () => {
    bootIsland();
    const worker = workerInstances[0];
    act(() => {
      setDayNightMode(DayNightMode.System); // scheme matches=false → day
    });
    act(() => {
      setMediaMatches(DARK_SCHEME_QUERY, true); // OS flips to dark → night
    });
    expect(postedAfterInit(worker).at(-1)).toEqual({
      type: NightSkyMessageType.SetDayness,
      dayness: 0,
      animated: true,
    });

    // Outside System mode the scheme listener must stay inert.
    act(() => {
      setDayNightMode(DayNightMode.Night);
    });
    const postedCount = worker.posted.length;
    act(() => {
      setMediaMatches(DARK_SCHEME_QUERY, false);
    });
    expect(worker.posted.length).toBe(postedCount);
  });
});
