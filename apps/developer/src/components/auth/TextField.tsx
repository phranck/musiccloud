import type { ChangeEvent } from "react";
import { useId } from "react";

/**
 * Props for {@link TextField}, the labelled text input used across the
 * developer-portal auth forms.
 */
export interface TextFieldProps {
  /** The form field name, submitted as the request body key. */
  name: string;
  /** Visible label rendered above the control. */
  label: string;
  /** Current controlled value. */
  value: string;
  /** Change handler receiving the raw input event. */
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  /**
   * HTML input type. Defaults to `text`. `type` is an allow-listed JSX
   * attribute for the domain-literal rule, so passing it inline is fine.
   */
  type?: "text" | "email" | "password";
  /** Optional inline error message; renders red text + an invalid border when set. */
  error?: string;
  /** Optional helper text shown below the control when there is no error. */
  hint?: string;
  /** `autocomplete` attribute forwarded to the input (e.g. `email`, `current-password`). */
  autoComplete?: string;
  /** Marks the field required for native validation. Defaults to `true`. */
  required?: boolean;
  /** Placeholder text for the empty input. */
  placeholder?: string;
}

/**
 * A controlled, labelled text input styled entirely from the developer-portal
 * design tokens (glassy surface, hairline border, `--radius-button` corners,
 * brand-blue focus ring). When `error` is set, the border and helper text turn
 * red and the control is flagged `aria-invalid` with its message wired via
 * `aria-describedby` for assistive technology.
 *
 * It is a presentational building block: the parent form owns the value and
 * submission, so this component holds no state beyond a generated id used to
 * associate the label, input, and message.
 *
 * @param props - See {@link TextFieldProps}.
 * @returns The labelled input field markup.
 */
export function TextField({
  name,
  label,
  value,
  onChange,
  type = "text",
  error,
  hint,
  autoComplete,
  required = true,
  placeholder,
}: TextFieldProps) {
  const inputId = useId();
  const messageId = `${inputId}-message`;
  const hasError = Boolean(error);

  const borderClass = hasError ? "border-red-400/70 focus:border-red-400" : "border-border focus:border-accent";

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-body font-medium text-fg">
        {label}
      </label>
      <input
        id={inputId}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        required={required}
        placeholder={placeholder}
        aria-invalid={hasError}
        aria-describedby={error || hint ? messageId : undefined}
        className={`w-full rounded-button border bg-surface px-3.5 py-2.5 text-body text-fg placeholder:text-fg-subtle outline-none transition-colors focus:ring-2 focus:ring-accent/30 ${borderClass}`}
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
