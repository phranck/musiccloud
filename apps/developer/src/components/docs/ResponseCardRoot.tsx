import type { ComponentPropsWithoutRef } from "react";
import { joinClassNames } from "@/components/docs/classNames";
import type { ResponseToneValue } from "@/components/docs/responseCard.types";

interface ResponseCardRootProps extends ComponentPropsWithoutRef<"article"> {
  tone: ResponseToneValue;
}

/** Renders the shared response surface with its semantic status tone. */
export function ResponseCardRoot({ className, tone, ...props }: ResponseCardRootProps) {
  return (
    <article
      className={joinClassNames("content-panel", "response-card", `response-card--${tone}`, className)}
      {...props}
    />
  );
}
