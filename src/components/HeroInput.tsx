import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn, isMusicUrl } from "../lib/utils";

export type InputState = "idle" | "focused" | "loading" | "success" | "error";

interface HeroInputProps {
  onSubmit: (url: string) => void;
  onClear: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  state: InputState;
  compact?: boolean;
  songName?: string;
  errorMessage?: string;
}

const LOADING_MESSAGES = [
  { delay: 0, text: "Finding your song..." },
  { delay: 2000, text: "Still searching..." },
];

export function HeroInput({
  onSubmit,
  onClear,
  onFocus,
  onBlur,
  state,
  compact = false,
  songName,
  errorMessage,
}: HeroInputProps) {
  const [value, setValue] = useState("");
  const [loadingMessage, setLoadingMessage] = useState(LOADING_MESSAGES[0].text);
  const inputRef = useRef<HTMLInputElement>(null);
  const ambilightRef = useRef<HTMLDivElement>(null);
  const autoSubmitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const prevState = useRef(state);

  // Clear input value when transitioning away from results/error (e.g. global ESC)
  useEffect(() => {
    if ((prevState.current === "success" || prevState.current === "error") && (state === "idle" || state === "focused")) {
      setValue("");
      inputRef.current?.focus();
    }
    prevState.current = state;
  }, [state]);

  // Progressive loading messages
  useEffect(() => {
    if (state !== "loading") {
      loadingTimers.current.forEach(clearTimeout);
      loadingTimers.current = [];
      setLoadingMessage(LOADING_MESSAGES[0].text);
      return;
    }

    const timers = LOADING_MESSAGES.map(({ delay, text }) =>
      setTimeout(() => setLoadingMessage(text), delay),
    );
    loadingTimers.current = timers;

    return () => timers.forEach(clearTimeout);
  }, [state]);

  // Ambilight: Siri-style waves - concentrated light blobs traveling around the border
  // Start hues spaced 120 degrees apart for full rainbow coverage
  const waveSeeds = useMemo(() => {
    const offset = Math.random() * 360;
    return {
      hues: [offset, (offset + 120) % 360, (offset + 240) % 360],
      speeds: [
        0.7 + Math.random() * 0.4,        // wave 1: moderate forward
        -0.5 + Math.random() * -0.3,       // wave 2: moderate reverse
        0.2 + Math.random() * 0.1,         // wave 3: slow full-orbit, broad glow circling the ring
      ],
      widths: [
        35 + Math.random() * 15,           // wave 1: narrow blob
        25 + Math.random() * 15,           // wave 2: narrow blob
        80 + Math.random() * 30,           // wave 3: wide arc (~quarter ring), overlaps others
      ],
      alphas: [0.8, 0.8, 0.4],            // wave 3: softer so it blends under the narrow ones
    };
  }, []);
  useEffect(() => {
    const el = ambilightRef.current;
    if (!el) return;

    // Respect prefers-reduced-motion
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motionQuery.matches) {
      // Static gradient fallback
      el.style.background = `conic-gradient(from 0deg, hsla(${waveSeeds.hues[0]}, 75%, 60%, 0.5), hsla(${waveSeeds.hues[1]}, 75%, 60%, 0.5), hsla(${waveSeeds.hues[2]}, 75%, 60%, 0.5), hsla(${waveSeeds.hues[0]}, 75%, 60%, 0.5))`;
      return;
    }

    let raf: number;
    const startTime = performance.now();
    const { hues, speeds, widths, alphas } = waveSeeds;

    // Sample the gradient at fixed angle steps for a seamless closed loop
    const STEPS = 72; // every 5 degrees
    const DEG_STEP = 360 / STEPS;

    function animate(now: number) {
      const t = (now - startTime) / 1000;

      // Wave center positions, hues, and per-wave peak alpha
      const wavePos = hues.map((baseHue, i) => ({
        center: ((speeds[i] * t * 60) % 360 + 360) % 360,
        hue: (baseHue + t * 15) % 360,
        halfWidth: widths[i] / 2,
        peakAlpha: alphas[i],
      }));

      // For each sample angle, additively blend all waves
      const stops: string[] = [];
      for (let i = 0; i <= STEPS; i++) {
        const angle = i * DEG_STEP;
        let totalAlpha = 0;
        let hueX = 0;
        let hueY = 0;

        for (const wave of wavePos) {
          // Shortest angular distance (wraps correctly around 0/360)
          let dist = Math.abs(angle - wave.center);
          if (dist > 180) dist = 360 - dist;

          if (dist < wave.halfWidth) {
            // Smooth cosine falloff from center to edge
            const a = wave.peakAlpha * Math.cos((dist / wave.halfWidth) * Math.PI * 0.5);
            // Weighted hue blending via circular mean
            hueX += a * Math.cos(wave.hue * Math.PI / 180);
            hueY += a * Math.sin(wave.hue * Math.PI / 180);
            totalAlpha += a;
          }
        }

        if (totalAlpha < 0.01) {
          stops.push(`transparent ${angle.toFixed(0)}deg`);
        } else {
          const blendedAlpha = Math.min(totalAlpha, 1);
          const blendedHue = ((Math.atan2(hueY, hueX) * 180 / Math.PI) + 360) % 360;
          stops.push(`hsla(${blendedHue.toFixed(0)}, 75%, 60%, ${blendedAlpha.toFixed(2)}) ${angle.toFixed(0)}deg`);
        }
      }

      if (el) el.style.background = `conic-gradient(from 0deg, ${stops.join(", ")})`;
      raf = requestAnimationFrame(animate);
    }

    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [waveSeeds]);

  const cancelAutoSubmit = useCallback(() => {
    if (autoSubmitTimer.current) {
      clearTimeout(autoSubmitTimer.current);
      autoSubmitTimer.current = null;
    }
  }, []);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      const pastedText = e.clipboardData.getData("text").trim();
      if (!pastedText) return;

      // Let the paste happen naturally, then check
      setTimeout(() => {
        if (isMusicUrl(pastedText)) {
          autoSubmitTimer.current = setTimeout(() => {
            onSubmit(pastedText);
          }, 300);
        }
      }, 0);
    },
    [onSubmit],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      cancelAutoSubmit();
      setValue(e.target.value);
    },
    [cancelAutoSubmit],
  );

  const handleClear = useCallback(() => {
    cancelAutoSubmit();
    setValue("");
    onClear();
    inputRef.current?.focus();
  }, [onClear, cancelAutoSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      cancelAutoSubmit();
      if (e.key === "Enter" && value.trim()) {
        onSubmit(value.trim());
      } else if (e.key === "Escape") {
        handleClear();
      }
    },
    [value, onSubmit, cancelAutoSubmit, handleClear],
  );

  const handleSubmitClick = useCallback(() => {
    if (value.trim() && state !== "loading") {
      onSubmit(value.trim());
    }
  }, [value, state, onSubmit]);

  const displayValue = state === "success" && songName ? songName : value;

  return (
    <div className={cn(
      "relative w-full transition-all duration-500",
      (state === "success" || compact) ? "max-w-full sm:max-w-[480px]" : "max-w-full sm:max-w-[520px] md:max-w-[640px]",
    )}>
      {/* Loading message above input */}
      {state === "loading" && (
        <p
          className="text-sm text-text-secondary text-center mb-3 animate-fade-in"
          aria-live="polite"
        >
          {loadingMessage}
        </p>
      )}

      {/* Input + Ambilight wrapper */}
      <div className="relative">
      {/* Ambilight glow - ring behind the input border, always active on landing page */}
      <div
        ref={ambilightRef}
        className="absolute inset-[-4px] rounded-full blur-[10px] opacity-90 pointer-events-none"
        aria-hidden="true"
        style={{
          maskImage: "radial-gradient(farthest-side at 50% 50%, transparent calc(100% - 12px), black calc(100% - 4px))",
          WebkitMaskImage: "radial-gradient(farthest-side at 50% 50%, transparent calc(100% - 12px), black calc(100% - 4px))",
        }}
      />

      {/* Input wrapper */}
      <div
        className={cn(
          "relative flex items-center rounded-full",
          "bg-surface",
          "backdrop-blur-[20px]",
          "border",
          "transition-all duration-[250ms]",
          state === "idle" && "border-white/15",
          state === "focused" && "border-white/10",
          state === "loading" && [
            "border-accent",
            "animate-pulse-glow",
          ],
          state === "success" && [
            "border-accent",
            "shadow-[0_0_12px_var(--color-accent-glow)]",
          ],
          state === "error" && [
            "border-error",
            "shadow-[0_0_12px_rgba(255,69,58,0.25)]",
          ],
        )}
      >
        <input
          ref={inputRef}
          type="text"
          autoFocus
          value={displayValue}
          onChange={handleChange}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          onFocus={() => onFocus?.()}
          onBlur={() => onBlur?.()}
          placeholder="Paste a link or album and search by artist or title..."
          readOnly={state === "loading" || state === "success"}
          className={cn(
            "flex-1 bg-transparent border-0 px-6 text-lg font-medium text-text-primary tracking-[-0.01em]",
            "placeholder:text-text-muted placeholder:tracking-normal outline-none",
            "h-14 md:h-16",
            state === "loading" && "opacity-50",
          )}
          aria-label="Search for music by link or name"
          autoComplete="off"
        />

        {/* Clear button */}
        {(value || state === "success") && state !== "loading" && (
          <button
            type="button"
            onClick={handleClear}
            className={cn(
              "p-2 mr-1 rounded-full",
              "text-text-muted hover:text-text-primary",
              "transition-colors duration-150",
            )}
            aria-label="Clear search"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}

        {/* Submit / Loading button */}
        <button
          type="button"
          onClick={handleSubmitClick}
          disabled={state === "loading" || !value.trim()}
          className={cn(
            "flex items-center justify-center",
            "hidden sm:flex w-11 h-11 md:w-12 md:h-12 mr-2 flex-shrink-0",
            "rounded-full",
            "transition-all duration-[250ms]",
            state === "loading"
              ? "bg-accent/50 cursor-wait"
              : state === "success"
                ? "bg-accent"
                : [
                    "bg-accent text-[var(--color-accent-contrast)]",
                    "hover:scale-[1.08] hover:shadow-[0_0_12px_var(--color-accent-glow)]",
                    "active:scale-[0.97]",
                    "disabled:opacity-30 disabled:hover:scale-100 disabled:hover:shadow-none",
                  ],
          )}
          aria-label={state === "loading" ? "Searching..." : "Search"}
        >
          {state === "loading" ? (
            <svg
              className="w-5 h-5 text-[var(--color-accent-contrast)] animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          ) : state === "success" ? (
            <svg
              className="w-5 h-5 text-[var(--color-accent-contrast)]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          ) : (
            <svg
              className="w-5 h-5 text-[var(--color-accent-contrast)]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14 5l7 7m0 0l-7 7m7-7H3"
              />
            </svg>
          )}
        </button>
      </div>
      </div>

      {/* Error message */}
      {state === "error" && errorMessage && (
        <p
          className="mt-3 text-sm text-error text-center animate-fade-in"
          role="alert"
        >
          {errorMessage}
        </p>
      )}
    </div>
  );
}
