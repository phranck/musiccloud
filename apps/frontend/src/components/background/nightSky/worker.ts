import { NightSkyDriver } from "./loop";
import { type NightSkyMessage, NightSkyMessageType, NightSkyWorkerEvent } from "./protocol";
import { createNightSkyScene, type NightSkyScene } from "./scene";
import type { NightSkySettings } from "./settings";

/**
 * Render worker of the night-sky background (plan MC-029 Phase 4).
 * Receives the OffscreenCanvas once, then owns GL init and the entire frame
 * loop — the main thread never does render work (policy 6). The loop runs on
 * the worker's own rAF; all policy (fps cap, fade boost, animate/reduced/
 * visibility gates) lives in the shared {@link NightSkyDriver}.
 */

/** Typed view of the dedicated-worker global (avoids pulling the webworker lib into the app tsconfig). */
const workerSelf = self as unknown as {
  onmessage: ((event: MessageEvent<NightSkyMessage>) => void) | null;
  postMessage(message: unknown): void;
  requestAnimationFrame(callback: (time: number) => void): number;
};

let scene: NightSkyScene | null = null;
let driver: NightSkyDriver | null = null;

/** Buffer scale: user renderScale × DPR (clamped to 2, plan guard-rail). */
function pixelScale(pixelRatio: number, settings: NightSkySettings): number {
  return settings.renderScale * Math.min(pixelRatio, 2);
}

// The loop never needs cancelling: `worker.terminate()` from the bridge ends
// the whole worker, rAF included.
function loop(now: number): void {
  workerSelf.requestAnimationFrame(loop);
  driver?.tick(now);
}

workerSelf.onmessage = (event: MessageEvent<NightSkyMessage>) => {
  const message = event.data;
  switch (message.type) {
    case NightSkyMessageType.Init: {
      // One shared live settings object: the scene reads it, the driver mutates it.
      const settings: NightSkySettings = { ...message.settings };
      scene = createNightSkyScene(message.canvas, settings, {
        onContextLost: () => workerSelf.postMessage({ type: NightSkyWorkerEvent.Failed }),
      });
      if (!scene) {
        workerSelf.postMessage({ type: NightSkyWorkerEvent.Failed });
        return;
      }
      driver = new NightSkyDriver(scene, settings);
      driver.setReducedMotion(message.reducedMotion);
      scene.resize(message.cssWidth, message.cssHeight, pixelScale(message.pixelRatio, settings));
      // Draw the first frame synchronously, then tell the bridge to fade the
      // canvas in — it never reveals a black surface.
      driver.tick(performance.now());
      workerSelf.postMessage({ type: NightSkyWorkerEvent.Ready });
      workerSelf.requestAnimationFrame(loop);
      break;
    }
    case NightSkyMessageType.Resize: {
      if (!scene || !driver) return;
      scene.resize(message.cssWidth, message.cssHeight, pixelScale(message.pixelRatio, driver.settings));
      driver.requestRedraw();
      break;
    }
    case NightSkyMessageType.Visibility: {
      driver?.setVisible(message.visible);
      break;
    }
    case NightSkyMessageType.ReducedMotion: {
      driver?.setReducedMotion(message.reduced);
      break;
    }
    case NightSkyMessageType.SetDayness: {
      driver?.setDayness(message.dayness, { animated: message.animated });
      break;
    }
    case NightSkyMessageType.SetAnimate: {
      driver?.setAnimate(message.animate);
      break;
    }
  }
};
