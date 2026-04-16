import { ArrowRightIcon, CheckIcon, XCircleIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef } from "react";
import { CDSpinArtwork } from "@/components/ui/CDSpinArtwork";
import { useAmbilightAnimation } from "@/hooks/useAmbilightAnimation";
import { useT } from "@/i18n/context";
import { isMusicUrl } from "@/lib/platform/url";
import type { InputState } from "@/lib/types/app";
import { cn } from "@/lib/utils";

export type { InputState };

interface HeroInputProps {
  /** Current input value (controlled). */
  value: string;
  /** Called on every keystroke / paste. */
  onChange: (value: string) => void;
  onSubmit: (query: string) => void;
  onClear: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  state: InputState;
  compact?: boolean;
  songName?: string;
  errorMessage?: string;
}

export function HeroInput({
  value,
  onChange,
  onSubmit,
  onClear,
  onFocus,
  onBlur,
  state,
  compact = false,
  songName,
  errorMessage,
}: HeroInputProps) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const ambilightRef = useRef<HTMLDivElement>(null);
  const autoSubmitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useAmbilightAnimation(ambilightRef);

  // Focus input on mount for non-touch devices only (avoids iOS 26 keyboard suppression on load)
  useEffect(() => {
    if (window.matchMedia("(hover: hover)").matches) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, []);

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
      onChange(e.target.value);
    },
    [cancelAutoSubmit, onChange],
  );

  const handleClear = useCallback(() => {
    cancelAutoSubmit();
    onChange("");
    onClear();
    inputRef.current?.focus();
  }, [onClear, cancelAutoSubmit, onChange]);

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
      <div className="relative">
        <div
          ref={ambilightRef}
          className="absolute inset-[-3px] rounded-full blur-[10px] opacity-90 pointer-events-none"
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
              "h-[40px] md:h-[48px]",
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
              <XCircleIcon size={24} weight="duotone" />
            </button>
          )}

          <button
            type="button"
            onClick={handleSubmitClick}
            disabled={state === "loading" || !value.trim()}
            className={cn(
              "flex items-center justify-center",
              compact ? "hidden" : "flex",
              "w-8 h-8 md:w-10 md:h-10 mr-1.5 flex-shrink-0",
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
              <CDSpinArtwork className="w-8 h-8 md:w-10 md:h-10" />
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
