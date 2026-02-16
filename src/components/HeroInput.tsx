import { useCallback, useEffect, useRef, useState } from "react";
import { cn, isMusicUrl } from "../lib/utils";

export type InputState = "idle" | "focused" | "loading" | "success" | "error";

interface HeroInputProps {
  onSubmit: (url: string) => void;
  onClear: () => void;
  state: InputState;
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
  state,
  songName,
  errorMessage,
}: HeroInputProps) {
  const [value, setValue] = useState("");
  const [loadingMessage, setLoadingMessage] = useState(LOADING_MESSAGES[0].text);
  const inputRef = useRef<HTMLInputElement>(null);
  const autoSubmitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

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
    <div className="relative w-full max-w-[640px]">
      {/* Loading message above input */}
      {state === "loading" && (
        <p
          className="text-sm text-text-secondary text-center mb-3"
          aria-live="polite"
        >
          {loadingMessage}
        </p>
      )}

      {/* Input wrapper */}
      <div
        className={cn(
          "relative flex items-center rounded-2xl",
          "bg-surface/60 backdrop-blur-[20px]",
          "border",
          "transition-all duration-200",
          state === "idle" && "border-white/10",
          state === "focused" && [
            "border-accent",
            "shadow-[0_0_20px_rgba(124,92,252,0.3)]",
            "scale-[1.02]",
          ],
          state === "loading" && [
            "border-accent",
            "animate-pulse-glow",
          ],
          state === "success" && [
            "border-green-400",
            "shadow-[0_0_20px_rgba(74,222,128,0.3)]",
          ],
          state === "error" && [
            "border-red-400",
            "shadow-[0_0_20px_rgba(248,113,113,0.3)]",
            "animate-shake",
          ],
        )}
      >
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          onChange={handleChange}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            /* parent manages state */
          }}
          placeholder="Paste a link or search by name..."
          readOnly={state === "loading" || state === "success"}
          className={cn(
            "flex-1 bg-transparent px-6 text-lg font-medium text-text-primary",
            "placeholder:text-text-muted outline-none",
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
              "transition-colors duration-100",
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
            "w-11 h-11 md:w-12 md:h-12 mr-2",
            "rounded-full",
            "transition-all duration-200",
            state === "loading"
              ? "bg-accent/50 cursor-wait"
              : state === "success"
                ? "bg-green-500"
                : [
                    "bg-accent text-white",
                    "hover:scale-110 hover:shadow-[0_0_20px_rgba(124,92,252,0.4)]",
                    "active:scale-95",
                    "disabled:opacity-30 disabled:hover:scale-100 disabled:hover:shadow-none",
                  ],
          )}
          aria-label={state === "loading" ? "Searching..." : "Search"}
        >
          {state === "loading" ? (
            <svg
              className="w-5 h-5 text-white animate-spin"
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
              className="w-5 h-5 text-white"
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
              className="w-5 h-5 text-white"
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

      {/* Error message */}
      {state === "error" && errorMessage && (
        <p
          className="mt-3 text-sm text-red-400 text-center"
          role="alert"
        >
          {errorMessage}
        </p>
      )}
    </div>
  );
}
