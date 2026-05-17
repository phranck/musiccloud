import {
  FieldShell,
  type FieldShellProps,
  InputPrimitive,
  type InputPrimitiveProps,
  TextareaPrimitive,
  type TextareaPrimitiveProps,
} from "../primitives/FieldPrimitives.js";

export type DashboardFieldProps = FieldShellProps;

export function DashboardField(props: DashboardFieldProps) {
  return <FieldShell {...props} />;
}

export interface DashboardInputProps extends InputPrimitiveProps {
  error?: FieldShellProps["error"];
  fieldClassName?: string;
  hint?: FieldShellProps["hint"];
  label?: FieldShellProps["label"];
  optionalLabel?: FieldShellProps["optionalLabel"];
}

export function DashboardInput({
  error,
  fieldClassName,
  hint,
  id,
  label,
  optionalLabel,
  ...inputProps
}: DashboardInputProps) {
  if (!label && !hint && !error && !optionalLabel) {
    return <InputPrimitive id={id} {...inputProps} />;
  }

  return (
    <DashboardField
      className={fieldClassName}
      error={error}
      hint={hint}
      label={label}
      labelHtmlFor={id}
      optionalLabel={optionalLabel}
    >
      <InputPrimitive id={id} {...inputProps} />
    </DashboardField>
  );
}

export interface DashboardTextareaProps extends TextareaPrimitiveProps {
  error?: FieldShellProps["error"];
  fieldClassName?: string;
  hint?: FieldShellProps["hint"];
  label?: FieldShellProps["label"];
  optionalLabel?: FieldShellProps["optionalLabel"];
}

export function DashboardTextarea({
  error,
  fieldClassName,
  hint,
  id,
  label,
  optionalLabel,
  ...textareaProps
}: DashboardTextareaProps) {
  if (!label && !hint && !error && !optionalLabel) {
    return <TextareaPrimitive id={id} {...textareaProps} />;
  }

  return (
    <DashboardField
      className={fieldClassName}
      error={error}
      hint={hint}
      label={label}
      labelHtmlFor={id}
      optionalLabel={optionalLabel}
    >
      <TextareaPrimitive id={id} {...textareaProps} />
    </DashboardField>
  );
}
