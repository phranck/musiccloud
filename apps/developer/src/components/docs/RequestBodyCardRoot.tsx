/** Private root component assembled by the public RequestBodyCard compound. */
import type { ComponentPropsWithoutRef } from "react";
import { ContentPanel } from "@/components/docs/ContentPanel";
import { joinClassNames } from "@/components/docs/classNames";

type RequestBodyCardRootProps = ComponentPropsWithoutRef<typeof ContentPanel>;

/** Adds the request-body-card surface class while preserving ContentPanel props. */
export function RequestBodyCardRoot({ className, ...props }: RequestBodyCardRootProps) {
  return <ContentPanel className={joinClassNames("request-body-card", className)} {...props} />;
}
