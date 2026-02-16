import { useCallback, useEffect, useRef, useState } from "react";
import { cn, isMusicUrl } from "../lib/utils";

export type InputState = "idle" | "focused" | "loading" | "success" | "error";

interface HeroInputProps {
  onSubmit: (url: string) => void;
  onClear: () => void;
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
  state,
  compact = false,
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
    <div className={cn(
      "relative w-full transition-all duration-500",
      (state === "success" || compact) ? "max-w-[480px]" : "max-w-[640px]",
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

      {/* Input wrapper */}
      <div
        className={cn(
          "relative flex items-center rounded-full",
          "bg-surface/60 backdrop-blur-[20px]",
          "border",
          "transition-all duration-[250ms]",
          state === "idle" && "border-white/15",
          state === "focused" && [
            "border-accent",
            "shadow-[0_0_15px_rgba(110,110,247,0.25)]",
          ],
          state === "loading" && [
            "border-accent",
            "animate-pulse-glow",
          ],
          state === "success" && [
            "border-accent",
            "shadow-[0_0_12px_rgba(110,110,247,0.25)]",
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
          value={displayValue}
          onChange={handleChange}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            /* parent manages state */
          }}
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
            "w-11 h-11 md:w-12 md:h-12 mr-2",
            "rounded-full",
            "transition-all duration-[250ms]",
            state === "loading"
              ? "bg-accent/50 cursor-wait"
              : state === "success"
                ? "bg-accent"
                : [
                    "bg-accent text-white",
                    "hover:scale-[1.08] hover:shadow-[0_0_12px_rgba(110,110,247,0.35)]",
                    "active:scale-[0.97]",
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
          className="mt-3 text-sm text-error text-center animate-fade-in"
          role="alert"
        >
          {errorMessage}
        </p>
      )}
    </div>
  );
}
