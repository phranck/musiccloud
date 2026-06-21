import { ArrowRightIcon, CheckIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { CDSpinArtwork } from "@/components/ui/CDSpinArtwork";
import { EmbossedButton } from "@/components/ui/EmbossedButton";
import { usePrefersReducedMotion } from "@/components/ui/usePrefersReducedMotion";
import { InputState } from "@/lib/types/app";
import { cn } from "@/lib/utils";

/**
 * Phases of the animated submit slot. The slot mounts in {@link SubmitPhase.ButtonOut}
 * (the button is sliding out), advances to {@link SubmitPhase.DiscIn} when the
 * button-out animation ends, then to {@link SubmitPhase.Spinning} when the disc
 * has slid in. The disc exit is derived from `Spinning + requestDiscExit`, so it
 * waits for the entry to finish even when the result is already ready.
 */
const SubmitPhase = {
  ButtonOut: "ButtonOut",
  DiscIn: "DiscIn",
  Spinning: "Spinning",
} as const;
type SubmitPhase = (typeof SubmitPhase)[keyof typeof SubmitPhase];

interface HeroSubmitSlotProps {
  /** Drives loading detection (`Loading`) and the rest-button icon (`Success`). */
  state: InputState;
  /** Disables the rest submit button (empty query). */
  submitDisabled: boolean;
  /** In compact mode the rest submit button is hidden (matches the field layout). */
  compact: boolean;
  /** Fired when the (interactive, rest) submit button is clicked. */
  onSubmitClick: () => void;
  /** Parent holds the result reveal and asks the spinning disc to slide out. */
  requestDiscExit: boolean;
  /** Called after the disc has slid out, so the parent can reveal the result. */
  onLoadingExitComplete?: () => void;
}

interface RestSubmitButtonProps {
  state: InputState;
  submitDisabled: boolean;
  compact: boolean;
  onSubmitClick: () => void;
}

/**
 * The interactive accent submit button at rest (idle / success / reduced motion).
 * Hidden in compact mode, matching the field's compact layout.
 */
function RestSubmitButton({ state, submitDisabled, compact, onSubmitClick }: RestSubmitButtonProps) {
  return (
    <EmbossedButton
      as="button"
      type="button"
      onClick={onSubmitClick}
      disabled={submitDisabled}
      className={cn(
        "flex items-center justify-center px-0 py-0 ml-0.5 flex-shrink-0 size-10 md:size-12 text-white",
        compact && "hidden",
      )}
      aria-label="Search"
    >
      {state === InputState.Success ? (
        <CheckIcon size={28} weight="duotone" className="text-[var(--color-accent)]" />
      ) : (
        <ArrowRightIcon size={28} weight="duotone" className="text-[var(--color-accent)]" />
      )}
    </EmbossedButton>
  );
}

/**
 * Reduced-motion loading indicator: the spinning disc shown statically at the
 * submit slot, at the full button size, with no slide.
 */
function StaticDisc() {
  return (
    <div className="flex items-center justify-center flex-shrink-0 size-10 md:size-12 ml-0.5" aria-hidden="true">
      <CDSpinArtwork className="size-full" />
    </div>
  );
}

interface AnimatedSubmitSlotProps {
  requestDiscExit: boolean;
  onLoadingExitComplete?: () => void;
}

/**
 * The animated slot, mounted only while loading (a fresh mount per loading
 * session resets the phase). Button + disc fill the fixed slot absolutely and
 * slide on `translateX`; the well's `overflow:hidden` clips a layer the instant
 * it leaves the slot, so each reads as sliding off the field's right edge. All
 * phase advances happen in `onAnimationEnd` handlers (events, never effects), and
 * the parent is notified via {@link AnimatedSubmitSlotProps.onLoadingExitComplete}
 * from the disc-out animation's `animationend`.
 */
function AnimatedSubmitSlot({ requestDiscExit, onLoadingExitComplete }: AnimatedSubmitSlotProps) {
  const [phase, setPhase] = useState<SubmitPhase>(SubmitPhase.ButtonOut);
  const showDisc = phase === SubmitPhase.DiscIn || phase === SubmitPhase.Spinning;
  const discExiting = phase === SubmitPhase.Spinning && requestDiscExit;

  return (
    <div className="relative flex-shrink-0 size-10 md:size-12 ml-0.5">
      <div
        className="mc-hero-btn-out absolute inset-0"
        style={{ pointerEvents: "none" }}
        aria-hidden="true"
        onAnimationEnd={(e) => {
          if (e.target === e.currentTarget && phase === SubmitPhase.ButtonOut) setPhase(SubmitPhase.DiscIn);
        }}
      >
        <EmbossedButton
          as="button"
          type="button"
          tabIndex={-1}
          disabled
          className="flex items-center justify-center px-0 py-0 size-full text-white"
        >
          <ArrowRightIcon size={28} weight="duotone" className="text-[var(--color-accent)]" />
        </EmbossedButton>
      </div>
      {showDisc && (
        <div
          className={cn(
            "absolute inset-0 flex items-center justify-center",
            discExiting ? "mc-hero-disc-out" : "mc-hero-disc-in",
          )}
          aria-hidden="true"
          onAnimationEnd={(e) => {
            if (e.target !== e.currentTarget) return;
            if (phase === SubmitPhase.DiscIn) setPhase(SubmitPhase.Spinning);
            else if (discExiting) onLoadingExitComplete?.();
          }}
        >
          <CDSpinArtwork className="size-full" />
        </div>
      )}
    </div>
  );
}

/**
 * The hero input's trailing submit slot. At rest it is the interactive accent
 * submit button; while loading it plays the slide choreography (button out →
 * disc in → spin → disc out) and, when the parent asks via `requestDiscExit`,
 * slides the disc out and calls `onLoadingExitComplete` so the result can be
 * revealed. Under reduced motion it falls back to a static disc / button swap.
 */
export function HeroSubmitSlot({
  state,
  submitDisabled,
  compact,
  onSubmitClick,
  requestDiscExit,
  onLoadingExitComplete,
}: HeroSubmitSlotProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const loading = state === InputState.Loading;

  if (prefersReducedMotion) {
    return loading ? (
      <StaticDisc />
    ) : (
      <RestSubmitButton state={state} submitDisabled={submitDisabled} compact={compact} onSubmitClick={onSubmitClick} />
    );
  }

  return loading ? (
    <AnimatedSubmitSlot requestDiscExit={requestDiscExit} onLoadingExitComplete={onLoadingExitComplete} />
  ) : (
    <RestSubmitButton state={state} submitDisabled={submitDisabled} compact={compact} onSubmitClick={onSubmitClick} />
  );
}
