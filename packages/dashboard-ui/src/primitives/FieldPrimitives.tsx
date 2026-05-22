import type { ComponentPropsWithoutRef, HTMLAttributes, LabelHTMLAttributes, ReactNode } from "react";

import { cx } from "../classNames.js";
import {
  fieldControlBaseClass,
  fieldControlInvalidClass,
  fieldErrorClass,
  fieldHelpClass,
  fieldLabelClass,
  fieldOptionalClass,
  fieldShellClass,
  inputSizeClass,
  textareaSizeClass,
} from "./fieldPrimitiveClasses.js";

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
