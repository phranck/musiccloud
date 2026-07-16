import { type ComponentPropsWithoutRef, createElement, type ElementType } from "react";
import { joinClassNames } from "@/components/docs/classNames";

type DataAttributes = {
  [attribute: `data-${string}`]: unknown;
};

/**
 * Creates a stable component adapter for one compound-component slot.
 * Shared class composition stays centralized while every caller retains the
 * wrapped element or component's complete prop and accessibility surface.
 */
export function createCompoundElement<Element extends ElementType>(
  element: Element,
  baseClassName: string,
  defaultProps?: Partial<ComponentPropsWithoutRef<Element>> & DataAttributes,
) {
  type Props = ComponentPropsWithoutRef<Element> & { className?: string };

  const CompoundElement = ({ className, ...props }: Props) =>
    createElement(element, { ...defaultProps, ...props, className: joinClassNames(baseClassName, className) });

  const elementName = typeof element === "string" ? element : element.displayName || element.name || "Component";
  CompoundElement.displayName = `CompoundElement(${elementName}.${baseClassName})`;
  return CompoundElement;
}
