import { ArrowRightIcon, CheckIcon, XCircleIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CDSpinArtwork } from "@/components/ui/CDSpinArtwork";
import { useAmbilightAnimation } from "@/hooks/useAmbilightAnimation";
import { useLoadingMessages } from "@/hooks/useLoadingMessages";
import { useT } from "@/i18n/context";
import { isMusicUrl } from "@/lib/platform/url";
import type { InputState } from "@/lib/types/app";
import { cn } from "@/lib/utils";

export type { InputState };

interface HeroInputProps {
  onSubmit: (url: string) => void;
  onClear: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  state: InputState;
  compact?: boolean;
  songName?: string;
  errorMessage?: string;
  /**
   * Query string to restore into the input when transitioning away from a
   * result view back to an idle/focused state. Without this, the clear
   * effect would wipe the field — which is wrong when the user clicks
   * "back to discovery" and should see their original query again.
   * Undefined → falls back to clearing, as before.
   */
  preservedQuery?: string;
}

export function HeroInput({
  onSubmit,
  onClear,
  onFocus,
  onBlur,
  state,
  compact = false,
  songName,
  errorMessage,
  preservedQuery,
}: HeroInputProps) {
  const t = useT();
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const ambilightRef = useRef<HTMLDivElement>(null);
  const autoSubmitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevState = useRef(state);

  useAmbilightAnimation(ambilightRef);
  const loadingMessage = useLoadingMessages(state, t);

  // Focus input on mount for non-touch devices only (avoids iOS 26 keyboard suppression on load)
  useEffect(() => {
    if (window.matchMedia("(hover: hover)").matches) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, []);

  // Clear input value when transitioning away from results/error (e.g. global ESC).
  // If a `preservedQuery` is provided (e.g. on back-navigation from a result
  // that was reached via genre-search), restore that instead of clearing.
  useEffect(() => {
    if (
      (prevState.current === "success" || prevState.current === "error") &&
      (state === "idle" || state === "focused")
    ) {
      setValue(preservedQuery ?? "");
      inputRef.current?.focus();
    }
    prevState.current = state;
  }, [state, preservedQuery]);

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
    <div
      className={cn(
        "relative w-full transition-all duration-500",
        state === "success" || compact ? "max-w-full sm:max-w-[480px]" : "max-w-full sm:max-w-[520px] md:max-w-[640px]",
      )}
    >
      {state === "loading" && (
        <p className="text-sm text-text-secondary text-center mb-3 animate-fade-in" aria-live="polite">
          {loadingMessage}
        </p>
      )}

      <div className="relative">
        <div
          ref={ambilightRef}
          className="absolute inset-[-4px] rounded-full blur-[10px] opacity-90 pointer-events-none"
          aria-hidden="true"
          style={{
            maskImage:
              "radial-gradient(farthest-side at 50% 50%, transparent calc(100% - 12px), black calc(100% - 4px))",
            WebkitMaskImage:
              "radial-gradient(farthest-side at 50% 50%, transparent calc(100% - 12px), black calc(100% - 4px))",
          }}
        />

        <div
          className={cn(
            "relative flex items-center rounded-full",
            "bg-surface",
            "backdrop-blur-[20px]",
            "border",
            "transition-all duration-[250ms]",
            state === "idle" && (compact ? "border-[var(--color-accent)]/25" : "border-white/15"),
            state === "focused" &&
              (compact ? ["border-accent", "shadow-[0_0_12px_var(--color-accent-glow)]"] : "border-white/10"),
            state === "loading" && ["border-accent", "animate-pulse-glow"],
            state === "success" && ["border-accent", "shadow-[0_0_12px_var(--color-accent-glow)]"],
            state === "error" && ["border-error", "shadow-[0_0_12px_rgba(255,69,58,0.25)]"],
          )}
        >
          <input
            ref={inputRef}
            type="text"
            inputMode="text"
            value={displayValue}
            onChange={handleChange}
            onPaste={handlePaste}
            onKeyDown={handleKeyDown}
            onFocus={() => onFocus?.()}
            onBlur={() => onBlur?.()}
            placeholder={t("hero.placeholder")}
            readOnly={state === "loading" || state === "success"}
            className={cn(
              "flex-1 bg-transparent border-0 px-6 text-lg font-medium text-text-primary tracking-[-0.01em]",
              "placeholder:text-text-muted placeholder:text-base placeholder:tracking-normal outline-none",
              "h-14 md:h-16",
              state === "loading" && "opacity-50",
            )}
            style={{ touchAction: "manipulation" }}
            aria-label="Search for music by link or name"
            autoComplete="off"
          />

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
              <XCircleIcon size={20} weight="duotone" />
            </button>
          )}

          <button
            type="button"
            onClick={handleSubmitClick}
            disabled={state === "loading" || !value.trim()}
            className={cn(
              "flex items-center justify-center",
              compact ? "hidden" : "flex",
              "w-11 h-11 md:w-12 md:h-12 mr-2 flex-shrink-0",
              "rounded-full",
              "transition-all duration-[250ms]",
              state === "loading"
                ? "bg-transparent cursor-wait"
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
              <CDSpinArtwork className="w-11 h-11 md:w-12 md:h-12" />
            ) : state === "success" ? (
              <CheckIcon size={20} weight="duotone" className="text-[var(--color-accent-contrast)]" />
            ) : (
              <ArrowRightIcon size={20} weight="duotone" className="text-[var(--color-accent-contrast)]" />
            )}
          </button>
        </div>
      </div>

      {state === "error" && errorMessage && (
        <p className="mt-3 text-sm text-error text-center animate-fade-in" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
