import type { ComponentPropsWithoutRef, HTMLAttributes, LabelHTMLAttributes, ReactNode } from "react";

import { cx } from "../classNames.js";

export type FieldControlSize = "field" | "large";

export interface FieldShellProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  error?: ReactNode;
  errorClassName?: string;
  hint?: ReactNode;
  helpClassName?: string;
  label?: ReactNode;
  labelClassName?: string;
  labelHtmlFor?: string;
  optionalLabel?: ReactNode;
}

export interface InputPrimitiveProps extends ComponentPropsWithoutRef<"input"> {
  controlSize?: FieldControlSize;
  invalid?: boolean;
}

export interface TextareaPrimitiveProps extends ComponentPropsWithoutRef<"textarea"> {
  controlSize?: FieldControlSize;
  invalid?: boolean;
}

export type FieldLabelProps = LabelHTMLAttributes<HTMLLabelElement> & { htmlFor: string };

export const fieldShellClass = "space-y-1";
export const fieldLabelClass = "block px-[5px] text-xs font-medium text-[var(--ds-text-muted)] mb-1";
export const fieldOptionalClass = "font-normal text-[var(--ds-text-subtle)]";
export const fieldHelpClass = "text-xs text-[var(--ds-text-subtle)]";
export const fieldErrorClass = "text-xs text-red-500 mt-1";
export const fieldControlBaseClass =
  "box-border w-full rounded-control border border-[var(--ds-border)] bg-[var(--ds-form-control-bg,var(--ds-input-bg))] text-sm text-[var(--ds-text)] transition-colors placeholder:text-[var(--ds-text-subtle)] focus:outline-none focus:border-[var(--ds-border-focus)] focus:ring-2 focus:ring-[var(--ds-focus-ring)] disabled:cursor-not-allowed disabled:opacity-[var(--ds-control-disabled-opacity)]";
export const fieldControlInvalidClass =
  "border-[var(--ds-danger-border)] focus:border-[var(--ds-danger-border)] focus:ring-[var(--ds-danger-border)]";

export const inputSizeClass: Record<FieldControlSize, string> = {
  field: "h-[var(--ds-control-h-field)] px-3",
  large: "h-[var(--ds-control-h-field-large)] px-4",
};

export const textareaSizeClass: Record<FieldControlSize, string> = {
  field: "min-h-[calc(var(--ds-control-h-field)*3)] px-3 py-1.5",
  large: "min-h-[calc(var(--ds-control-h-field-large)*3)] px-4 py-2",
};

function hasInvalidState(value: InputPrimitiveProps["aria-invalid"] | TextareaPrimitiveProps["aria-invalid"]) {
  return value === true || value === "true";
}

export function FieldLabel({ className, htmlFor, ...props }: FieldLabelProps) {
  // biome-ignore lint/a11y/noLabelWithoutControl: htmlFor is required by the prop type and connects to the referenced control at every call site.
  return <label htmlFor={htmlFor} className={cx(fieldLabelClass, className)} {...props} />;
}

export function FieldLabelText({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cx(fieldLabelClass, className)} {...props} />;
}

export function FieldOptional({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx(fieldOptionalClass, className)}>{children}</span>;
}

export function FieldHelpText({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cx(fieldHelpClass, className)} {...props} />;
}

export function FieldErrorText({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cx(fieldErrorClass, className)} {...props} />;
}

export function FieldShell({
  children,
  className,
  error,
  errorClassName,
  hint,
  helpClassName,
  label,
  labelClassName,
  labelHtmlFor,
  optionalLabel,
  ...divProps
}: FieldShellProps) {
  return (
    <div {...divProps} className={cx(fieldShellClass, className)}>
      {label && labelHtmlFor ? (
        <FieldLabel className={labelClassName} htmlFor={labelHtmlFor}>
          {label}
          {optionalLabel && <FieldOptional> {optionalLabel}</FieldOptional>}
        </FieldLabel>
      ) : null}
      {label && !labelHtmlFor ? (
        <FieldLabelText className={labelClassName}>
          {label}
          {optionalLabel && <FieldOptional> {optionalLabel}</FieldOptional>}
        </FieldLabelText>
      ) : null}
      {children}
      {error ? <FieldErrorText className={errorClassName}>{error}</FieldErrorText> : null}
      {!error && hint ? <FieldHelpText className={helpClassName}>{hint}</FieldHelpText> : null}
    </div>
  );
}

export function InputPrimitive({ className, controlSize = "field", invalid, ...inputProps }: InputPrimitiveProps) {
  const ariaInvalid = invalid ?? inputProps["aria-invalid"];

  return (
    <input
      {...inputProps}
      aria-invalid={ariaInvalid}
      className={cx(
        fieldControlBaseClass,
        inputSizeClass[controlSize],
        hasInvalidState(ariaInvalid) && fieldControlInvalidClass,
        className,
      )}
    />
  );
}

export function TextareaPrimitive({
  className,
  controlSize = "field",
  invalid,
  ...textareaProps
}: TextareaPrimitiveProps) {
  const ariaInvalid = invalid ?? textareaProps["aria-invalid"];

  return (
    <textarea
      {...textareaProps}
      aria-invalid={ariaInvalid}
      className={cx(
        fieldControlBaseClass,
        textareaSizeClass[controlSize],
        hasInvalidState(ariaInvalid) && fieldControlInvalidClass,
        className,
      )}
    />
  );
}
