import { type RefObject, useEffect, useMemo } from "react";

interface WaveSeeds {
  hues: number[];
  speeds: number[];
  widths: number[];
  alphas: number[];
}

function generateWaveSeeds(): WaveSeeds {
  const offset = Math.random() * 360;
  return {
    hues: [offset, (offset + 120) % 360, (offset + 240) % 360],
    speeds: [0.7 + Math.random() * 0.4, -0.5 + Math.random() * -0.3, 0.2 + Math.random() * 0.1],
    widths: [35 + Math.random() * 15, 25 + Math.random() * 15, 80 + Math.random() * 30],
    alphas: [0.8, 0.8, 0.4],
  };
}

/**
 * Siri-style ambilight ring animation via requestAnimationFrame.
 * Writes directly to the given div's `style.background` on each frame.
 * Respects `prefers-reduced-motion`.
 */
export function useAmbilightAnimation(ref: RefObject<HTMLDivElement | null>): void {
  const waveSeeds = useMemo(() => generateWaveSeeds(), []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motionQuery.matches) {
      el.style.background = `conic-gradient(from 0deg, hsla(${waveSeeds.hues[0]}, 75%, 60%, 0.5), hsla(${waveSeeds.hues[1]}, 75%, 60%, 0.5), hsla(${waveSeeds.hues[2]}, 75%, 60%, 0.5), hsla(${waveSeeds.hues[0]}, 75%, 60%, 0.5))`;
      return;
    }

    if (window.matchMedia("(pointer: coarse)").matches) return;

    let raf: number;
    const startTime = performance.now();
    const { hues, speeds, widths, alphas } = waveSeeds;
    const STEPS = 36;
    const DEG_STEP = 360 / STEPS;

    function animate(now: number) {
      const t = (now - startTime) / 1000;

      const wavePos = hues.map((baseHue, i) => ({
        center: (((speeds[i] * t * 60) % 360) + 360) % 360,
        hue: (baseHue + t * 15) % 360,
        halfWidth: widths[i] / 2,
        peakAlpha: alphas[i],
      }));

      const stops: string[] = [];
      for (let i = 0; i <= STEPS; i++) {
        const angle = i * DEG_STEP;
        let totalAlpha = 0;
        let hueX = 0;
        let hueY = 0;

        for (const wave of wavePos) {
          let dist = Math.abs(angle - wave.center);
          if (dist > 180) dist = 360 - dist;

          if (dist < wave.halfWidth) {
            const a = wave.peakAlpha * Math.cos((dist / wave.halfWidth) * Math.PI * 0.5);
            hueX += a * Math.cos((wave.hue * Math.PI) / 180);
            hueY += a * Math.sin((wave.hue * Math.PI) / 180);
            totalAlpha += a;
          }
        }

        if (totalAlpha < 0.01) {
          stops.push(`transparent ${angle.toFixed(0)}deg`);
        } else {
          const blendedAlpha = Math.min(totalAlpha, 1);
          const blendedHue = ((Math.atan2(hueY, hueX) * 180) / Math.PI + 360) % 360;
          stops.push(`hsla(${blendedHue.toFixed(0)}, 75%, 60%, ${blendedAlpha.toFixed(2)}) ${angle.toFixed(0)}deg`);
        }
      }

      if (el) el.style.background = `conic-gradient(from 0deg, ${stops.join(", ")})`;
      raf = requestAnimationFrame(animate);
    }

    raf = requestAnimationFrame(animate);

    const handleVisibilityChange = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
      } else if (!motionQuery.matches) {
        raf = requestAnimationFrame(animate);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [waveSeeds, ref]);
}
