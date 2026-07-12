/** Private root component assembled by the public ParameterCard compound. */
import type { ComponentPropsWithoutRef } from "react";
import { ContentPanel } from "@/components/docs/ContentPanel";
import { joinClassNames } from "@/components/docs/classNames";

type ParameterCardRootProps = ComponentPropsWithoutRef<typeof ContentPanel>;

/** Adds the parameter-card surface class while preserving ContentPanel props. */
export function ParameterCardRoot({ className, ...props }: ParameterCardRootProps) {
  return <ContentPanel className={joinClassNames("parameter-card", className)} {...props} />;
}
