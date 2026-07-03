interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Accessible name; required because the switch renders no visible label of its own. */
  "aria-label"?: string;
  id?: string;
}

/**
 * Small on/off switch (ported from lmaa.space's `@lmaa/ui/toggle-switch`):
 * a `role="switch"` button whose knob slides right when checked. Colours are
 * token-wired — primary track when on, border-grey when off.
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
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-focus-ring)] disabled:cursor-not-allowed disabled:opacity-[var(--ds-control-disabled-opacity)] ${
        checked ? "bg-[var(--color-primary)]" : "bg-[var(--ds-border)]"
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-block size-3.5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-[1.125rem]" : "translate-x-[0.1875rem]"
        }`}
      />
    </button>
  );
}
