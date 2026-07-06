interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Accessible name; required because the switch renders no visible label of its own. */
  "aria-label"?: string;
  id?: string;
}

/**
 * iOS-style on/off switch: a `role="switch"` button rendered as a full pill
 * track whose near-track-height knob slides right when checked (proportions
 * follow Apple's UISwitch — track ≈ 1.67:1, knob ≈ 83% of the track height
 * with a 2px inset). Colours are token-wired — primary track when on,
 * border-grey when off.
 */
export function ToggleSwitch({ checked, onChange, disabled = false, id, "aria-label": ariaLabel }: ToggleSwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-focus-ring)] disabled:cursor-not-allowed disabled:opacity-[var(--ds-control-disabled-opacity)] ${
        checked ? "bg-[var(--color-primary)]" : "bg-[var(--ds-border)]"
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-[1.125rem]" : "translate-x-[0.125rem]"
        }`}
      />
    </button>
  );
}
