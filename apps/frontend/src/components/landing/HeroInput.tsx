import { XCircleIcon } from "@phosphor-icons/react";
import { type ReactNode, useCallback, useEffect, useRef } from "react";
import { recessedControlInsetClassName } from "@/components/cards/cardGeometry";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { HeroSubmitSlot } from "@/components/landing/HeroSubmitSlot";
import { useT } from "@/i18n/localeContext";
import { isMusicUrl } from "@/lib/platform/url";
import { InputState } from "@/lib/types/app";
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
  /**
   * Optional control rendered as a fixed leading element inside the field, before
   * the input. The landing page passes the resolve-mode switch here so the active
   * search mode lives inside the field itself.
   */
  leadingControl?: ReactNode;
  /**
   * When true, the parent is holding the result reveal and asks the spinning
   * disc to slide out to the right. {@link HeroInputProps.onLoadingExitComplete}
   * fires once it is fully gone (and never fires under reduced motion, where the
   * parent does not hold the reveal).
   */
  requestDiscExit?: boolean;
  /** Called after the disc has slid out, so the parent can reveal the result. */
  onLoadingExitComplete?: () => void;
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
  leadingControl,
  requestDiscExit = false,
  onLoadingExitComplete,
}: HeroInputProps) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const autoSubmitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus input on mount for non-touch devices only. A direct share-page
  // Escape exit sets a one-shot flag so the landing field regains focus.
  useEffect(() => {
    let forceFocus = false;
    try {
      forceFocus = window.sessionStorage.getItem("mc:focusHero") === "1";
      if (forceFocus) window.sessionStorage.removeItem("mc:focusHero");
    } catch {
      forceFocus = false;
    }

    if (forceFocus || window.matchMedia("(hover: hover)").matches) {
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

  const updateInputValue = useCallback(
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
    if (value.trim() && state !== InputState.Loading) {
      onSubmit(value.trim());
    }
  }, [value, state, onSubmit]);

  const displayValue = state === InputState.Success && songName ? songName : value;

  return (
    <div
      className={cn(
        "relative w-full transition-all duration-500",
        state === InputState.Success || compact
          ? "max-w-full sm:max-w-[480px]"
          : "max-w-full sm:max-w-[520px] md:max-w-[640px]",
      )}
    >
      {/* `overflow-visible` overrides EmbossedCard's default `overflow-hidden`.
          EmbossedCard carries the `backdrop-filter` frost, and Firefox (WebRender)
          renders a CLIPPED backdrop-filter element through a separate intermediate
          surface whose tile boundary shows as a lighter rectangle in the frost.
          Dropping the clip removes it; the pill's children are inset, so nothing
          overflows the rounded shape. */}
      <EmbossedCard radius="9999px" className="overflow-visible">
        <RecessedCard className={cn(recessedControlInsetClassName, "hero-field", "flex items-center")}>
          {leadingControl && <div className="flex-shrink-0 flex items-center pl-1.5">{leadingControl}</div>}
          <input
            ref={inputRef}
            type="text"
            inputMode="text"
            value={displayValue}
            onChange={updateInputValue}
            onPaste={handlePaste}
            onKeyDown={handleKeyDown}
            onFocus={() => onFocus?.()}
            onBlur={() => onBlur?.()}
            placeholder={t("hero.placeholder")}
            readOnly={state === InputState.Loading || state === InputState.Success}
            className={cn(
              // Fill the field and shrink for the trailing button (`flex-auto w-full
              // min-w-0`). `appearance-none` strips the browser's native text-field
              // chrome so the input is a plain transparent box on the recessed glass.
              "mc-hero-input appearance-none flex-auto w-full min-w-0 bg-transparent border-0 pr-2 text-lg font-medium text-text-primary tracking-[-0.01em]",
              // Leading control sits left of the input; without it the text keeps its own inset.
              leadingControl ? "pl-2" : "pl-6",
              "placeholder:tracking-normal outline-none",
              "h-[40px] md:h-[48px]",
              state === InputState.Loading && "opacity-50",
            )}
            style={{ touchAction: "manipulation" }}
            aria-label="Search for music by link or name"
            autoComplete="off"
          />

          {(value || state === InputState.Success) && state !== InputState.Loading && (
            <button
              type="button"
              onClick={handleClear}
              className={cn(
                "flex items-center justify-center flex-shrink-0 size-9 rounded-full",
                "text-text-muted hover:text-text-primary",
                "transition-colors duration-150",
              )}
              aria-label="Clear search"
            >
              <XCircleIcon size={24} weight="duotone" />
            </button>
          )}

          <HeroSubmitSlot
            state={state}
            submitDisabled={!value.trim()}
            compact={compact}
            onSubmitClick={handleSubmitClick}
            requestDiscExit={requestDiscExit}
            onLoadingExitComplete={onLoadingExitComplete}
          />
        </RecessedCard>
      </EmbossedCard>
    </div>
  );
}
