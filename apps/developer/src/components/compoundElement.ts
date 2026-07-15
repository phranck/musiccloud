import { type ComponentPropsWithoutRef, createElement } from "react";
import { joinClassNames } from "@/components/docs/classNames";

type CompoundElementTag =
  | "a"
  | "article"
  | "button"
  | "code"
  | "dd"
  | "div"
  | "dt"
  | "dl"
  | "footer"
  | "h2"
  | "h3"
  | "h4"
  | "header"
  | "section"
  | "span"
  | "table"
  | "tbody"
  | "td"
  | "th"
  | "thead"
  | "tr"
  | "li"
  | "ul";

/**
 * Creates a stable semantic component for one compound-component slot.
 * Shared class composition stays centralized while every caller retains the
 * native element's complete prop and accessibility surface.
 */
export function createCompoundElement<Tag extends CompoundElementTag>(tag: Tag, baseClassName: string) {
  type Props = ComponentPropsWithoutRef<Tag> & { className?: string };

  const CompoundElement = ({ className, ...props }: Props) =>
    createElement(tag, { ...props, className: joinClassNames(baseClassName, className) });

  CompoundElement.displayName = `CompoundElement(${tag}.${baseClassName})`;
  return CompoundElement;
}
