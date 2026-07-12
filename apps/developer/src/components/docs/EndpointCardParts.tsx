/** Private React components assembled by the public EndpointCard compound. */
import type { ComponentPropsWithoutRef } from "react";
import { ContentCard } from "@/components/docs/ContentCard";
import { joinClassNames } from "@/components/docs/classNames";

const KNOWN_METHOD_TONES = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]);

type EndpointCardProps = ComponentPropsWithoutRef<typeof ContentCard>;
type EndpointCardHeaderProps = ComponentPropsWithoutRef<typeof ContentCard.Header> & { method: string };
type EndpointCardHeaderAddonProps = ComponentPropsWithoutRef<typeof ContentCard.Header.Addon>;

/** Adds the endpoint-card surface class without changing ContentCard semantics. */
export function EndpointCardRoot({ className, ...props }: EndpointCardProps) {
  return <ContentCard className={joinClassNames("endpoint-card", className)} {...props} />;
}

/** Selects the stable visual method tone for a documented HTTP operation. */
export function EndpointCardHeader({ className, method, ...props }: EndpointCardHeaderProps) {
  const normalizedMethod = method.toUpperCase();
  const tone = KNOWN_METHOD_TONES.has(normalizedMethod) ? normalizedMethod.toLowerCase() : "default";
  return (
    <ContentCard.Header
      className={joinClassNames("endpoint-card__header", `endpoint-card__header--${tone}`, className)}
      {...props}
    />
  );
}

/** Positions endpoint access metadata in the shared ContentCard header addon slot. */
export function EndpointCardHeaderAddon({ className, ...props }: EndpointCardHeaderAddonProps) {
  return <ContentCard.Header.Addon className={joinClassNames("endpoint-card__header-addon", className)} {...props} />;
}
