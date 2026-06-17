import { ArrowRightIcon, CheckIcon, XCircleIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef } from "react";
import { recessedControlInsetClassName } from "@/components/cards/cardGeometry";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { RecessedCard } from "@/components/cards/RecessedCard";
import { CDSpinArtwork } from "@/components/ui/CDSpinArtwork";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { useT } from "@/i18n/context";
import { isMusicUrl } from "@/lib/platform/url";
import { InputState } from "@/lib/types/app";
import { cn } from "@/lib/utils";

export type { InputState };

/**
 * Accent-tinted glass fill for the submit button ("Glass + Accent"). Set on the
 * `EmbossedButton` via its `style` prop so it overrides the neutral button-glass
 * tint of the `.embossed-gradient-border` recipe (inline style beats the class).
 * The CTA stays in the glass language while reading clearly in both day + night;
 * the accent is constant (no day↔night cross-fade) by design.
 */
const SUBMIT_ACCENT_FILL =
  "linear-gradient(to bottom, color-mix(in srgb, var(--color-accent) 92%, transparent), color-mix(in srgb, var(--color-accent) 78%, transparent))";

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
              "mc-hero-input appearance-none flex-auto w-full min-w-0 bg-transparent border-0 pl-6 pr-2 text-lg font-medium text-text-primary tracking-[-0.01em]",
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

          {state === InputState.Loading ? (
            <div className="flex items-center justify-center flex-shrink-0 size-10 md:size-12" aria-hidden="true">
              <CDSpinArtwork className="w-8 h-8 md:w-10 md:h-10" />
            </div>
          ) : (
            <EmbossedButton
              as="button"
              type="button"
              onClick={handleSubmitClick}
              disabled={!value.trim()}
              style={{ background: SUBMIT_ACCENT_FILL }}
              className={cn(
                "flex items-center justify-center px-0 py-0 ml-0.5 flex-shrink-0 size-10 md:size-12 text-white",
                compact && "hidden",
              )}
              aria-label="Search"
            >
              {state === InputState.Success ? (
                <CheckIcon size={20} weight="duotone" className="text-white" />
              ) : (
                <ArrowRightIcon size={20} weight="duotone" className="text-white" />
              )}
            </EmbossedButton>
          )}
        </RecessedCard>
      </EmbossedCard>
    </div>
  );
}
