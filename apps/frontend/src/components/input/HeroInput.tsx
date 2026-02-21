import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/context";
import { cn } from "@/lib/utils";
import { isAlbumUrl, isMusicUrl } from "@/lib/platform/url";
import type { InputState } from "@/lib/types/app";
import { useAmbilightAnimation } from "@/hooks/useAmbilightAnimation";
import { useLoadingMessages } from "@/hooks/useLoadingMessages";

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
}: HeroInputProps) {
  const t = useT();
  const [value, setValue] = useState("");
  const [isAlbum, setIsAlbum] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const ambilightRef = useRef<HTMLDivElement>(null);
  const autoSubmitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevState = useRef(state);

  useAmbilightAnimation(ambilightRef);
  const loadingMessage = useLoadingMessages(state, t, isAlbum);

  // Clear input value when transitioning away from results/error (e.g. global ESC)
  useEffect(() => {
    if (
      (prevState.current === "success" || prevState.current === "error") &&
      (state === "idle" || state === "focused")
    ) {
      setValue("");
      inputRef.current?.focus();
    }
    prevState.current = state;
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

      setTimeout(() => {
        const album = isAlbumUrl(pastedText);
        // Auto-submit any URL from a known music service domain, even if it's not a
        // recognised track/album URL (e.g. artist pages). The backend will return a
        // descriptive error so the user gets immediate feedback instead of silence.
        const isMusicDomain =
          /^https?:\/\/(?:open\.spotify\.com|music\.apple\.com|(?:www\.)?youtube\.com|youtu\.be|(?:www\.|m\.)?soundcloud\.com|(?:listen\.)?tidal\.com|(?:www\.)?deezer\.com|link\.deezer\.com)/.test(
            pastedText,
          );
        if (isMusicUrl(pastedText) || album || isMusicDomain) {
          setIsAlbum(album);
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
      const v = e.target.value;
      setValue(v);
      setIsAlbum(isAlbumUrl(v.trim()));
    },
    [cancelAutoSubmit],
  );

  const handleClear = useCallback(() => {
    cancelAutoSubmit();
    setValue("");
    setIsAlbum(false);
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

  const displayValue = state === "success" && songName ? songName : value;

  return (
    <div
      className={cn(
        "relative w-full transition-all duration-500",
        state === "success" || compact
          ? "max-w-full sm:max-w-[480px]"
          : "max-w-full sm:max-w-[520px] md:max-w-[640px]",
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
            state === "focused" && (compact ? ["border-accent", "shadow-[0_0_12px_var(--color-accent-glow)]"] : "border-white/10"),
            state === "loading" && ["border-accent", "animate-pulse-glow"],
            state === "success" && ["border-accent", "shadow-[0_0_12px_var(--color-accent-glow)]"],
            state === "error" && ["border-error", "shadow-[0_0_12px_rgba(255,69,58,0.25)]"],
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
            placeholder={t("hero.placeholder")}
            readOnly={state === "loading" || state === "success"}
            className={cn(
              "flex-1 bg-transparent border-0 px-6 text-lg font-medium text-text-primary tracking-[-0.01em]",
              "placeholder:text-text-muted placeholder:text-base placeholder:tracking-normal outline-none",
              "h-14 md:h-16",
              state === "loading" && "opacity-50",
            )}
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
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}

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
