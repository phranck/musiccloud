import { CaretDownIcon, CaretUpDownIcon, CaretUpIcon } from "@phosphor-icons/react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cx } from "../classNames.js";
import {
  FieldShell,
  type FieldShellProps,
  InputPrimitive,
  type InputPrimitiveProps,
  TextareaPrimitive,
  type TextareaPrimitiveProps,
} from "../primitives/FieldPrimitives.js";
import type { SegmentedControlPrimitiveProps } from "../primitives/SegmentedControlPrimitive.js";
import { SegmentedControlPrimitive } from "../primitives/SegmentedControlPrimitive.js";
import type { TableSortDirection } from "./tableSort.js";

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

export interface TableSortHeaderProps extends Omit<ComponentPropsWithoutRef<"button">, "children"> {
  children: ReactNode;
  direction?: TableSortDirection;
}

export function TableSortHeader({
  children,
  className,
  direction = null,
  type = "button",
  ...buttonProps
}: TableSortHeaderProps) {
  return (
    <button
      {...buttonProps}
      type={type}
      className={cx("inline-flex items-center gap-1.5 hover:text-[var(--ds-text)] transition-colors", className)}
    >
      {children}
      <TableSortIcon direction={direction} />
    </button>
  );
}

function TableSortIcon({ direction }: { direction: TableSortDirection }) {
  const Icon = direction === "asc" ? CaretUpIcon : direction === "desc" ? CaretDownIcon : CaretUpDownIcon;

  return <Icon weight="duotone" className={cx("w-3 h-3 shrink-0", direction === null && "opacity-40")} />;
}

export function DashboardSegmentedControl<T extends string = string>(props: SegmentedControlPrimitiveProps<T>) {
  return <SegmentedControlPrimitive {...props} />;
}
