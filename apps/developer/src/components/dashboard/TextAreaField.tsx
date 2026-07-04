import type { ChangeEvent } from "react";
import { useId } from "react";

/**
 * Props for {@link TextAreaField}, the labelled multi-line input used by the
 * API-access request form.
 */
export interface TextAreaFieldProps {
  /** The form field name, submitted as the request body key. */
  name: string;
  /** Visible label rendered above the control. */
  label: string;
  /** Current controlled value. */
  value: string;
  /** Change handler receiving the raw textarea event. */
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  /** Optional inline error message; renders red text + an invalid border when set. */
  error?: string;
  /** Optional helper text shown below the control when there is no error. */
  hint?: string;
  /** Marks the field required for native validation. Defaults to `true`. */
  required?: boolean;
  /** Placeholder text for the empty control. */
  placeholder?: string;
  /** Visible rows; defaults to 4. */
  rows?: number;
  /** Native `maxlength` cap forwarded to the textarea. */
  maxLength?: number;
}

/**
 * A controlled, labelled `<textarea>` styled from the same design tokens as
 * {@link TextField} (glassy surface, hairline border, `--radius-button`
 * corners, brand-blue focus ring), with the identical error/hint wiring
 * (`aria-invalid` + `aria-describedby`). Kept as its own component instead of
 * widening TextField because input and textarea share no element type.
 *
 * @param props - See {@link TextAreaFieldProps}.
 * @returns The labelled textarea markup.
 */
export function TextAreaField({
  name,
  label,
  value,
  onChange,
  error,
  hint,
  required = true,
  placeholder,
  rows = 4,
  maxLength,
}: TextAreaFieldProps) {
  const inputId = useId();
  const messageId = `${inputId}-message`;
  const hasError = Boolean(error);

  const borderClass = hasError ? "border-red-400/70 focus:border-red-400" : "border-border focus:border-accent";

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-body font-medium text-fg">
        {label}
      </label>
      <textarea
        id={inputId}
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        aria-invalid={hasError}
        aria-describedby={error || hint ? messageId : undefined}
        className={`w-full rounded-button border bg-surface px-3.5 py-2.5 text-body text-fg placeholder:text-fg-subtle outline-none transition-colors focus:ring-2 focus:ring-accent/30 resize-y ${borderClass}`}
      />
      {error ? (
        <p id={messageId} className="text-body text-red-400">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="text-body text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
